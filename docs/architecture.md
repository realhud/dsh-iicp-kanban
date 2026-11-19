# dsh-iicp-kanban 架构设计（architecture）

> v0.3（2026-11-18）：成员模块升级为队长 + 工作成员，新增团队路由与 `reviewStatus` 验收字段。决策 20–26 记录这次的取舍。

## 总览

沿用 dsh-super-kanban 的**零构建双半边**架构，代码全新实现：

```
┌─ DSH Web 界面（浏览器）────────────────────┐
│ client.js — window.__ModuleLoader__.load    │
│   slots.inject("main") → PageTeamBoard      │
│   团队视图 = 队长卡 + 待验收队列 + 工人网格 │
│   fetch /iicp-kanban/api/* (same-origin)    │
└──────────────┬──────────────────────────────┘
               │ JSON over HTTP
┌──────────────▼──────────────────────────────┐
│ index.mjs（cordis 接线，薄）                 │
│   ownerAdmission → service.handle            │
│ server/service.mjs（路由+编排）              │
│   ├─ server/auth.mjs        owner 鉴权决策表 │
│   ├─ server/http.mjs        JSON/读体/校验   │
│   ├─ server/domain.mjs→limits.mjs 常量钳制  │
│   ├─ server/store.mjs       state.json 持久化│
│   └─ server/workspaces.mjs  只读工作区发现   │
│   团队规则：settleTeam / refreshMemberStatus │
│            settleReviewOnStatus / buildTeamPayload │
└──────────────────────────────────────────────┘
```

## 关键决策与理由

1. **零构建**：client.js 是手写 bundle（`window.__ModuleLoader__.load({id, factory})`），React 由 DSH `require("react")` 提供。理由：与 super-kanban 一致，无打包链路，改完即生效。
2. **路由收口在 service.handle**：index.mjs 只做前缀注册 + 鉴权 + URL 解析，`service.handle(req,res,{route,url,method})` 内部 `dispatch` + try/catch 兜底（错误→JSON，带 `error.statusCode` 时透传 400/404/409）。理由：测试不需要起真 HTTP 服务，PassThrough 假 req/res 即可全覆盖。
3. **鉴权 fail-closed**（auth.mjs）：`connection.admit(req)` 是唯一信任源；admit 缺失/抛异常/返回非对象/非 owner principal → 一律 403。rejection 状态码归一化到 400–599。
4. **持久化原子写**（store.mjs）：写 `state.json.tmp-<pid>-<ts>` 后 `renameSync`。损坏时备份 `state.json.corrupt-<ts>` 并空状态重启。理由：单文件 JSON 足够看板规模，避免引入 SQLite。
5. **domain/limits 拆分避免环**：store.mjs 需要 `clip`/枚举做迁移，service.mjs 需要同一套常量；limits.mjs 只放常量与纯函数，domain.mjs re-export。
6. **工作区只读发现**（workspaces.mjs）：只读 `$DSH_HOME/storages/workspace.json`，兼容数组/map/`{workspaces:[]}` 三种 shape；读取失败降级为空列表。是否纳入看板的 `included` 标志存自己的 state。
7. **客户端轮询**：`useBoardState` 每 8s GET `/state` 全量刷新；操作成功/失败都 `reload()`（失败也刷，避免本地态与服务端漂移）。
8. **删除语义**：member.delete 级联把其任务 `assigneeId=""` 并写历史「成员已移除」；project.delete 级联把任务 `projectId=""`；defaultAssigneeId 引用被删成员时清空。
9. **详情抽屉与编辑弹窗分离**（v2.4）：`TaskDrawer` 是纯展示组件（只读 `state.tasks` 的最新快照，自带 Esc 捕获监听），写操作全部收敛到 `TaskModal`；`PageTeamBoard` 用 `drawerTaskId` 而非整个 task 对象作为抽屉状态——这样 8s 轮询刷新后抽屉内容自动跟随服务端，任务被删除时 `useEffect` 自动关闭。单击/双击用自行计时的 350ms 间隔判定，因为合成点击（桌面自动化）不派发 `dblclick`、`event.detail` 也不递增。
10. **看板交互对齐 v2.5**：视图切换从页头下移到 slimbar，让页头专注「标题 + 统计 + 搜索 + 新建」；过滤状态全部是 `BoardView` 内部 `useState`（不落到 `settings`），因为它们是瞬时视图偏好而非持久配置——持久化会让「含归档」这类危险开关在下次打开时意外生效。排序 `compareTasks` 与服务端无关（服务端只保证返回全量任务），前端统一「置顶 → 优先级 → 最近更新」。
11. **乐观更新只用于拖拽**（v2.5）：`moveTask` 先写 `optimistic` 覆盖层再请求，失败回滚 + toast；其它操作（置顶/归档/删除/移动菜单）走「请求 → 用返回结果刷新」，因为它们的副作用（级联、历史写入）比状态字段更复杂，先请求避免本地与服务端不一致。
12. **置顶是一等字段而非标签**（v2.5）：`pinned` 落在 store 的 `normalizeTask`、`task.create` 初始化、`task.update` diff 三处，排序与徽章都读它；没有复用 `tags`，因为 tags 上限 4 个且会被搜索命中，置顶是排序语义不应污染检索。
13. **项目分「工作区项目 / 自建项目」两类呈现**（v2.6）：工作区项目是 DSH 工作区发现的只读投影（`workspaceId` 匹配、不可编辑删除），自建项目才落 store 的 `projects`。把二者混成一张表会导致「删除工作区项目」这种无意义操作，也会在 workspace.json 变动时产生孤儿记录；采用统一 `ProjectCard` + `isWorkspace` 开关渲染，避免两套卡片组件漂移。
14. **项目范围跳转走一次性 `scope` 对象**（v2.6）：项目卡片「看板」不直接写 `BoardView` 的筛选状态，而是 `PageTeamBoard` 维护 `scope = {projectId, workspaceId, nonce}` 传下去，`BoardView` 的 `useEffect` 依赖 `scope.nonce`（而非整个对象）做一次性应用后 `onScopeApplied()` 清空。这样筛选仍然是 BoardView 的内部瞬时状态（延续决策 10），也不会因为父组件重渲染反复重置用户手动改过的筛选。
15. **工作区解析优先 DSH 现行布局**（v2.6）：`workspace.json` 实际是 `{unit, global, tables:{workspaces:{...}}}`，旧「裸 map」回退分支会把元数据键当成工作区（UI 出现 `unit` 假卡片、`workspaceId` 存成 `"unit"`）。`normalizeWorkspaces` 的分支顺序改为 数组 → `workspaces` 数组 → `tables.workspaces` → `workspaces` 对象 → 裸 map（legacy），并由用例「reads the live DSH tables.workspaces registry without leaking other tables」锁死，防止再次回归。
16. **`dueDate` 严格回环校验**（v2.6）：`normalizeDateOnly` 用 `Date` 解析后把结果重新 `toISOString().slice(0,10)` 与输入比对，不等于就回落 `""`——因为原生 `<input type="date">` 与 agent 写入都可能给出 `2026-02-31` 这类「看起来合法」的字符串，`Date` 会静默滚动到 3 月 3 日。
17. **工作区绑定的读侧修复必须配写侧校验**（v2.7）：决策 15 只修了 `normalizeWorkspaces` 的解析，已经落盘的脏值（`workspaceId:"unit"`）不会自愈——`normalizeProject` 只校验类型不校验存在性。v2.7 在三条路径补齐：`start()` 里 `migrateWorkspaceBindings` 清掉解析不到的绑定（写 warn 日志并 `store.save()`），写路径 `normalizeWorkspaceBinding` 拒绝未知 id（400），弹窗把不在选项里的值显式渲染成「<id>（已失效）」而不是静默显示「不关联工作区」。**关键约束：工作区发现返回空集时三者一律放行/不动**——`workspace.json` 缺失或损坏是正常降级场景，此时把绑定清空等于数据丢失。
18. **优雅失败优先于强一致**（v2.7）：唯一绑定校验（`assertWorkspaceFree`）只在项目**未归档**时生效，归档即让出工作区；因为这些项目是人工创建的分组容器，不是 DSH 的自动归入配置，硬性唯一会让「归档旧项目 + 新建新项目」这一常见操作被阻塞。
19. **乐观锁用 `updatedAt` 而非自增版本号**（v2.7）：`updatedAt` 本来就在每次写盘刷新（不变量 3），直接拿它当 revision 不需要新增字段或迁移；`expectedUpdatedAt` 是可选参数，老客户端不传就退化成后写覆盖。代价是同一毫秒内的两次写无法区分，但单个本地看板的写频率下可忽略。同理 `project.update` 增加了「无变化早返回」（`changed:false`，不刷新 `updatedAt`），否则每次打开弹窗点保存都会无谓地推进版本号、把其它窗口变成 stale。
20. **队长/工人是纯本地规则，不接 DSH 的 agents/subagents 服务**（v0.3）：成员模型长出了 `kind/leadId/personality/skills/provider/model/status/sessionId`，任务长出 `reviewStatus/reviewNote`，但服务端**不创建任何 agent 会话**。理由是查过 `@deepseek-ai/dsh-agent`、`@deepseek-ai/dsh-subagent` 与本机 `dsh-ai-team` 的实现后确认接线成本与回归风险远超本插件定位：(a) `agents.create` 在本版本没有 `parentAgent` 字段，成员会话只能靠 `meta.origin:"subagent"` 隐式挂靠；(b) `pinInitialPermission` 会把新建会话钉成 profile 的 `defaultPreset`（本机是 `workspace-write`），要 `permissionPresets.set` 显式提权；(c) `archived-session-gate` 沿 subagent 父链检查归档，父会话一归档所有成员 turn 直接 blocked——参考实现实测过 453 blocked / 0 completed；(d) 句柄不会被插件卸载自动回收，必须自己 `ctx.effect` 里 dispose。结论：**先做可验证的协作契约（派单/提交/验收），把 agent 接线留成可选扩展**。代价是 `provider`/`model`/`sessionId` 目前只是画像字段。
21. **「做的人不验收」放在服务端而非客户端**（v0.3）：`/member.review` 里三条硬校验——reviewer 必须是 lead、任务必须处于 `pending`、**reviewer 不能是 assignee**——不依赖前端是否隐藏按钮。因为这条规则的失效方式很隐蔽（自己批自己，看板上一切正常），只能靠服务端兜住。同理 worker 的 `/member.report` 只把 `reviewStatus` 置 `pending`、**不动 status 列**：状态列是 owner 的视野，不能让 worker 提交动作把它推成 done。
22. **人工越权优先于机器规则**（v0.3）：owner 直接把 worker 的任务拖到 done 时不报错、不拦截，而是 `settleReviewOnStatus` 补记 `reviewStatus:"accepted"` + 「人工直接完成（视同验收）」。理由：owner 是这台机器的最终权威，把「done 但卡在待验收」这种自相矛盾的状态留给界面是最差选择；让规则跟随人的动作、并把这次越权写进历史，比强制人工走一遍验收按钮更符合真实使用。
23. **一队一队长的约束只加在写路径**（v0.3）：`/member.create` 与 `/member.update` 拒绝第二个 lead（409），但读路径与迁移一律宽容——`settleTeam()` 在 `start()` 时若发现全队无 lead，会把 `createdAt` 最早的成员提升为 lead，并把悬空 `leadId` 清空。这样 v0.2.7 的老数据升级后不会是「没有队长的死队」，也不需要用户手工修数据。
24. **删队长不级联删工人**（v0.3）：`member.delete` 只做两件事——解绑该成员的任务（沿用 v2 语义）与把 `leadId === 被删者` 的 worker 置空。相比「整个团队一起删」，这个选择保住了数据：工人的任务与历史留在原处，新队长上任时 `adoptOrphanWorkers` 一次性接管。反过来 `member.update` 的卸任（lead→worker）走同一条路径，让「换队长」变成两步无破坏操作。
25. **成员状态由任务派生，不由人维持**（v0.3）：worker 的 `status` 在每次任务写操作后由 `refreshMemberStatus` 重算（有 blocked→blocked；有 backlog/in_progress→working；否则 idle），lead 的 status 则允许手工设置。因为「谁在忙」是任务的函数，让人去手工维护必然与看板撒谎；lead 忙的是协调与验收，没有对应的任务列可派生。
26. **团队聚合在服务端算一次**（v0.3）：`buildTeamPayload` 输出 `lead`/`workers`（含 `taskTotal/inFlight/blocked/awaitingReview/orphan`）/`pendingReviews`/`unassigned`/`blocked`/`inFlight`/`orphanWorkers`，同时挂在 `GET /team` 与 `/state.team` 上。客户端不再自己遍历任务算指标（v0.2.7 的成员表格是前端统计的），因为「待验收」这类口径要和服务端的验收规则严格一致，两边各算一次迟早会漂。

## 数据流（一次拖拽 / 一次派单验收）

**拖拽改状态**：TaskCard dragstart 记 taskId → 列 onDrop → POST `/task.move {id,status}` → dispatch 校验 isStatus → 改 state + addHistory("status") + store.save()（原子写）→ 客户端 reload() → 全量 `/state` 重渲染。

**派单 → 提交 → 验收（v0.3）**：
```
DispatchModal  → POST /member.dispatch {taskId, memberId}
                 → assigneeId=worker、backlog→in_progress、清旧验收态
                 → history「派单：X 认领」+ refreshMemberStatus(worker→working)
worker 提交     → POST /member.report {taskId, memberId, note, subtasks?, artifacts?}
                 → reviewStatus="pending"、status 保持 in_progress（不自己变 done）
                 → history「X 提交验收：note」
team 轮询       → GET /state（含 team.pendingReviews）→ 队长卡 + 待验收队列重绘
lead 验收       → POST /member.review {taskId, decision, leadId, note}
                 accepted → status=done + 自动关闭非 manual 子任务 + history「Y 验收通过」
                 changes  → status=in_progress + reviewNote + history「Y 要求返工」
```

## 存储布局

```
$DSH_HOME/
  storages/iicp-kanban/state.json     # 全部看板数据（本插件唯一写点）
  storages/workspace.json             # DSH 全局工作区（只读）
```

`state.json` 在 v0.3 里：`members[]` 多出 `kind/leadId/personality/skills/provider/model/status/sessionId`，`tasks[]` 多出 `reviewStatus/reviewNote`。没有新增顶层集合，也没有新增文件——`settleTeam()` 在 `start()` 时一次性把老数据补齐（缺 kind → worker，无 lead → 提升最早成员），所以升级不需要手工迁移。

## 为什么不做真实 spawn（v0.3 的边界）

查证过 `@deepseek-ai/dsh-agent` / `@deepseek-ai/dsh-subagent` 的类型契约与本机 `dsh-ai-team` 的实现后，这次**有意不接 agent 服务**：

| 障碍 | 具体表现 |
| --- | --- |
| 无 `parentAgent` | 本版本 `agents.create` 只有 `sessionId` 必填，成员会话靠 `meta.origin:"subagent"` 隐式挂靠，血缘不显式 |
| 权限钉死 | `pinInitialPermission` 把新会话钉成 profile 的 `defaultPreset`（本机 `workspace-write`），要 `permissionPresets.set` 显式提权才可写 |
| 归档连坐 | `archived-session-gate` 沿 subagent 父链检查，父会话归档 → 所有成员 turn 直接 blocked（参考实现实测 453 blocked / 0 completed） |
| 句柄泄漏 | agent handle 不随插件卸载回收，必须自己 `ctx.effect` dispose |
| 回合观测 | 只能靠 `session/event` 的 `turn/end` + `reason.kind`，`agent.status` 只有 idle/running |

因此 v0.3 交付的是**可验证的协作契约**（一队一队长、派单、做的人不验收、人工越权记账），全部走本地规则 + 原子写。`provider`/`model`/`sessionId` 作为画像与预留字段保留：真要接 agent 时，形状已经在了，而不必再改数据模型。

## 决策 27：模型目录单独开接口，且「空 = 继承」（v0.4）

成员的 provider/model 从自由文本改为「从 DSH 已有的模型目录里选」。三个决定值得记下来：

1. **目录不进 `/state`，单独 `GET /models`。** 客户端 `useBoardState` 每 8s 轮询一次 `/state`；把 `llm.listProviders()` + 每个 provider 的 `listModels()` 塞进 `/state`，等于每 8 秒把线上适配器枚举一遍。目录只在成员弹窗打开时取一次（`useModelCatalog` 只挂一次 effect），变化频率本来就低。
2. **服务读取一律惰性 + 双路径。** 本插件的 `apply(ctx)` 只 `ctx.inject(["connection","webServer"])`，没有注入 `llm`/`agentDefaultModel`（它们是后到的服务）；而且 cordis 的 Context 是 Proxy，访问未注入属性会抛。所以 `server/model-catalog.mjs` 的 `resolveService(ctx,name)` 先试 `ctx[name]`（带 try/catch）再退 `ctx.get(name)`，每次请求都重新解析，不在构造期缓存。
3. **`""` 是「继承工作区」，不是「没填」。** 查过 DSH 全部 338 个 `@deepseek-ai` 包：**没有**「工作区默认模型」这一内建概念——`workspace.json` 的 workspace 对象里也没有任何 model/provider 字段。所以「继承工作区」在本插件里的语义只能是「跟随宿主 `agentDefaultModel.currentSelection()`」，即新开会话会用的那个默认模型。服务端因此**不写死具体 id**、也不做白名单校验：留空才能跟着宿主默认模型一起变；写死反而会在宿主换默认模型后留在一个旧值上。

配套的两个防御：目录里已消失的历史值**保留并回显**（「`<id>`（当前值不在目录里）」），避免把成员的模型静默改名；单个 provider `listModels()` 失败时该行仍保留（`models:[]` + `error`），否则它名下成员的 model id 也会被静默清空。

## 决策 28：队长是恒定角色——不可删除、不可卸任、空队自动种子（v0.5）

v0.3 把「换队长」设计成两步无破坏操作（决策 24），但实际使用中发现这个口子弊大于利：队长一旦被删或卸任，团队就进入「无队长」状态，验收（`/member.review` 要求 lead）瘫痪、客户端要养一整套「暂无队长 / 队长已卸任 / orphan worker 挂靠」的分支 UI。v0.5 决定把口子焊死：

1. **服务端硬拒绝而非静默降级。** `/member.delete` 删 lead → 400「队长不可被删除」；`/member.update` lead→worker → 400「队长不可被卸任」。不用 200+no-op（调用方无法感知）也不用级联换人（静默替用户做重大决定）。409 保留给「一队一队长」冲突，400 用于这两个永久非法操作——它们不是并发或状态冲突，是领域不变量。
2. **种子并入 `settleTeam()` 而非独立初始化函数。** `settleTeam()` 已经在每次 `start()` 跑「提升最早成员 → 清悬空 leadId」的自愈链，种子作为第一个分支（`members.length === 0` → 创建默认队长「队长」）天然获得幂等性：有成员（含刚种下的）就永不重跑。这也让 v0.2.7 老数据迁移（提升最早成员）与全新安装（种子）共享同一个入口。
3. **`/member.create` 的 kind 推导保留作兜底。** `existingLead ? "worker" : "lead"` 不再改：正常安装下种子保证 `existingLead` 恒真，推导分支只剩 v0.2.7 兼容路径会走到。
4. **客户端删分支而非加判断。** 弹窗的「成员类型」下拉、「新建成员成为队长」标题、「还没有队长」空态、「队长已卸任」banner、orphan 卡样式与 roster「暂无队长」格整体移除——队长恒存在，这些状态机分支已不可达。roster 对 lead 不渲染删除按钮，与服务端守卫构成双层防护。

代价是 breaking：依赖「删队长重建」的自动化需改为直接编辑队长资料。收益是 Member 从「可能出现无头状态」变成恒定不变量「每队恰一名队长」（domain.md 不变量 11）。

## 测试架构

`node --test --test-isolation=none`（沙箱禁 spawn，故禁子进程隔离）；service.test.mjs 用 PassThrough 假 req/res 直调 `service.handle`；`process.env.DSH_HOME` 指向 mkdtemp 临时目录（service.mjs 构造时读取）。

- `tests/team.test.mjs`（v0.3，18 个用例）自带 `withService(fn,{seed})` 夹具，每个用例独立 `DSH_HOME`——因为 service.test.mjs 是全局共享一个 home 的（成员状态会跨用例残留），团队用例需要干净起点。
- `tests/model-catalog.test.mjs`（v0.4，8 个用例）：用假 `llm`/`agentDefaultModel` 服务驱动 `GET /models`，覆盖缺服务降级、目录枚举、单 provider 失败保留、非法行跳过、`listProviders` 抛错、默认模型回落、空串往返。`withService` 因此支持可选 `ctx` 注入（默认仍是只带 logger 的 `fakeCtx()`）。
- `scripts/smoke-team.mjs`（v0.3）：端到端 8 步冒烟，末尾打印 `SMOKE-TEAM-PASS`；与 smoke-v2 / smoke-project 一样用 PassThrough 假 req/res，不依赖真 HTTP 服务。
