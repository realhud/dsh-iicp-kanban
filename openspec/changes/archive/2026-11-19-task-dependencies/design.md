# Design

## Context

见 `proposal.md` 的 Why。这里只列约束：

- 单进程 DSH 插件。`server/service.mjs` 在内存里持有一个 `state` 单例，所有写路由改完内存后调用一次 `store.save()`；`store` 用 tmp + rename 原子写整个 `state.json`（`STATE_VERSION` 为 1）。没有事务、没有数据库、没有逐条写入。
- 所有请求都经过 `index.mjs` 的 `ownerAdmission`，服务端只有一个 owner 身份，无法区分人和 agent；`origin` / `sourceSessionId` 只是信息字段。因此依赖约束是「防手滑的护栏」，不是权限模型。
- 客户端每 8 秒轮询 `/state`；拖动是乐观更新 + 失败回滚（architecture 决策 11）；团队聚合、成员状态都在服务端算（决策 26）；人工越权优先（决策 22）。
- 任务模型目前没有任何任务间关系；四列全连通，无守卫。`done` 会触发非 manual 子任务自动关闭、`settleReviewOnStatus`、goal/progress 同步。
- 因为只有一次 `store.save()`，一旦守卫在内存修改之后抛错，未保存的脏值会留在单例里污染后续请求。所有校验必须前置。

## Goals / Non-Goals

**Goals:**

- 用最小的数据结构表达前置关系，能在重启、迁移、删除后保持引用完整。
- 就绪判定只有一个实现，供 `/state`、四个写入口和团队负载共用。
- 被拒绝的请求不改变内存中的任何字段，也不产生部分写入。
- 保留既有的验收与越权语义，只增加可见的痕迹。

**Non-Goals:**

- 不做排期、工期、关键路径、自动开始/自动完成、通知提醒。
- 不支持跨看板/远程任务引用。
- 不引入新集合、不改 `STATE_VERSION`、不引入权限模型。
- 不改变子任务语义，也不把依赖做成父子层级。

## Decisions

### D1 依赖存在依赖方：`dependsOn: string[]`

任务对象新增 `dependsOn`，语义是「我必须等这些任务完成」。替代方案与放弃原因：

- **独立 `edges` 集合**：需要第二条记录的生命周期、迁移和一致性；删除任务要同时清两类记录，收益不抵成本。
- **前置方存 `blocks`**：删除/改关系时要双写，容易只写一边。
- **父子层级**：会把「同一交付物的步骤」和「独立交付物」混为一谈，子任务已经是前者。
- **复用 `blocked` 状态**：`blocked` 会派生成员状态、进入团队 attention，把正常等待误报成异常。
- **备注/标签约定**：不可校验，无法阻止开工。

`dependsOn` 同时加入 `limits.mjs` 的 `LOCKABLE_FIELDS`，让 `lockedFields` 能记录它（现有机制只对 `subtasks` 有实际语义，这里不新增锁语义）。上限 8，去重后截断。

### D2 `ready` 是派生值，不落盘

```
isReady(task, byId) = task.dependsOn.every(id => byId.get(id)?.status === "done")
```

- 不持久化：落盘后遇到删除、归档、重开、迁移都可能留下无法自愈的 `true`。
- 缺失 id 按未完成处理（fail closed）；正常情况下迁移和删除级联保证不会出现缺失。
- `buildStatePayload` 给每个任务附加 `ready`，客户端把它当权威值，不自行推导正确性。
- 判 `archived` 无关：已完成 + 已归档仍算满足，归档但未完成永远不就绪。这是最不意外的规则——归档不应撤销已完成的产出。

### D3 单点守卫，且在任何修改之前

新增 `assertStartable(state, task, nextStatus, nextDeps?)`：

1. `nextStatus !== "in_progress"` 直接返回（`done` 走 D5 的留痕逻辑）。
2. 用 `nextDeps ?? task.dependsOn` 计算就绪；未就绪则 `throw conflict(...)`，message 列出每个未完成前置的 `标题（状态）`。
3. 抛错时不得有任何字段已被写入。

调用点四个：`/task.create`（`status` 为 `in_progress`）、`/task.update`、`/task.move`、`/member.dispatch`。

两个必须写进实现的细节：

- **`/member.dispatch` 的守卫放在函数第一行**。现在的顺序是先写 `assigneeId` 再改状态，守卫若放在后面，409 会留下「人已换、状态没变」的脏内存态。
- **`/task.update` 对 `dependsOn` + `status` 做两阶段处理**：先把 `dependsOn` 归一化、校验存在性/自依赖/环，再用「候选 dependsOn」判就绪，全部通过后才提交字段修改。不能先改 `dependsOn` 再判 status，否则 409 时依赖已经被改掉。

`/member.report` 不走守卫：汇报代表产出已存在，拦下来只会让事实无法登记。改为在推 `in_progress` 时写一条 history「提交时前置未完成：A」。

### D4 错误码：格式错 400，状态冲突 409

- 自依赖、引用不存在的 id、非数组/非法元素 → 400 `badRequest`。
- 前置未完成导致不能开工、写入后成环 → 409 `conflict`（`server/http.mjs:36` 已有助手）。
- message 用中文，和现有错误一致；列前置时用 `标题（状态）`，最多列 3 个再省略，避免超长。

### D5 `done` 放行但留痕

`/task.update`、`/task.move`、`/task.create` 把状态写成 `done` 时，若未就绪，照常完成，然后 `addHistory(task, "dependency", "越权完成：前置 A（进行中）未完成")`。history 仍受每任务 20 条上限约束。这样越权可见、可追，但不阻断——与决策 22 一致。

### D6 图的完整性

- **自依赖**：保存前检查 `dependsOn.includes(task.id)` → 400。
- **环**：把候选边并入现有图，从被修改任务出发做 DFS 三色标记；发现回边 → 409。只沿 `dependsOn` 方向走，跨项目边同样遍历。任务量在千级以内，O(V+E) 无需优化；用显式栈避免深链递归。
- **删除**：`/task.delete` 在 `splice` 之后遍历剩余任务，过滤掉被删 id，给每个被改任务 `addHistory(task, "dependency", "前置任务已删除：<标题>")` 并更新 `updatedAt`，然后 `refreshTeam` + `store.save()`。依赖方状态不变。
- **项目删除**：现有 `/project.delete` 只把任务 `projectId` 置空、不删任务，所以依赖边天然存活，无需额外处理。
- **迁移**：`normalizeTask` 只做形状归一（数组、去重、≤8、字符串）。悬空 id 必须在全部任务解析完之后做一次全局 pass（`byId` 建好再过滤），不能放在单条 `normalizeTask` 里——那时邻居可能还没加载。丢弃时写一条 history 会让「只读加载」变成写操作，因此只静默丢弃，等下一次保存落盘。

### D7 成员状态与团队负载

- `refreshMemberStatus` 的 `working` 条件改为：有 `in_progress`，或有 `ready` 的 `backlog`。`blocked` 仍然优先。
- 现有的单独调用点（`member.update`、`dispatch`、`report`、`create`）不改签名：`refreshMemberStatus(state, member, byId?)` 在缺省时内部建索引；`refreshTeam` 建一次索引传下去，避免 O(n²)。
- `buildTeamPayload` 给每个 worker 加 `waiting`：已指派、仍为 `backlog`、未就绪的任务数；团队汇总加 `waiting` 总数。`inFlight` 保持现有含义（已指派未完成），不改口径，避免破坏已有消费者。

### D8 客户端

- 卡片：未完成前置数 > 0 时显示「等待前置 N」chip，用现有 chip 样式；不新增强调色。
- 抽屉：列前置的标题、状态、所属项目；跨项目时才显示项目名。
- 编辑弹窗：前置选择器从 `state.tasks` 取候选，排除自身、已选中的、以及「选它会成环」的（在客户端做一次可达性检查作为便利，服务端仍是权威）。
- 拖拽：先做本地预检避免无意义的乐观更新；即使预检通过，也必须处理 409，回滚到原列并 toast 服务端 message。预检不是正确性依赖。
- 筛选：客户端状态，不持久化；「仅看可开工」隐藏 `ready === false` 的任务。
- 文案：`client.js` 内置 zh/en 词典，新增键两边都补齐。

### D9 排序与展示不变

`compareTasks` 仍是 pinned → priority → updatedAt；等待任务不特殊排序，否则列表会在前置完成时跳动。

## Risks / Trade-offs

- **新增写入口忘记调用守卫** → 守卫集中在一个 helper；测试逐个路由覆盖；实现时把「写 `in_progress` 必调 `assertStartable`」写进 tasks 的验收项。
- **抛错前已有内存修改**（本项目最大的坑） → 两阶段校验；每个 409 测试都补一次「随后 GET 状态未变」的断言。
- **客户端候选过滤与服务端环检测逻辑漂移** → 服务端权威；客户端只做体验优化；两边各有测试。
- **拖拽回滚让用户困惑** → toast 带前置标题；卡片同时显示等待 chip。
- **`ready` 语义边界**：归档但未完成的前置会让依赖方永久不就绪 → 抽屉里把这种前置标成异常，提示用户恢复或删除；不自动放行。
- **老版本回滚会丢依赖**：旧 `normalizeTask` 不认 `dependsOn`，下次保存会把它丢掉。单机插件可接受，CHANGELOG 注明。
- **团队测试期望变化**：`working` 判定收紧后，已有 fixture 里「只有 backlog」的 worker 可能从 `working` 变 `idle`，需要同步更新测试与文档。

## Migration Plan

1. 上线即生效：`state.json` 新增字段是可加的，`STATE_VERSION` 不变。
2. 加载：缺失字段归一为 `[]`；全局 pass 丢弃悬空 id；不主动回写，等下一次业务写入。
3. 部署：重启插件进程即可，无脚本、无停机数据迁移。
4. 回滚：旧代码忽略未知字段并在下次保存时丢弃；依赖关系丢失但任务数据不受影响，需要时从备份恢复 `state.json`。

## Open Questions

- 「仅看可开工」是否跨会话记住（localStorage）——实现时可后定，不影响 spec 与任务拆分。
- 团队概览是否单独加一个「等待中」统计块——先只在 worker 行与汇总字段暴露，等有真实使用再决定。
