# dsh-iicp-kanban 领域模型与状态机（domain）

> v2（2026-11-18）：任务数据模型对齐 dsh-super-kanban，支持 AI AGENT 执行语义。变更点见「Task 任务 v2」。
>
> 未发布（agent-team）：队长与工作成员各自运行真实的 DSH agent 会话；`Member.sessions/agentState` 与 `Task.agentSessionId/agentState` 记录会话与执行队列。
> v0.3（2026-11-18）：成员模块升级为「一个队长 Agent 带领多个工作 Agent」。新增 `Member.kind/leadId/personality/skills/provider/model/status/sessionId` 与 `Task.reviewStatus/reviewNote`，团队语义见「团队协作语义（v0.3）」。
>
> 未发布（task-dependencies）：任务新增 `dependsOn` 前置依赖；`ready` 派生、开工守卫、删除级联与成员状态收紧见「任务依赖语义」。

## 实体

### Task 任务（v2 模型）
| 字段 | 类型/取值 | 说明 |
| --- | --- | --- |
| id | `t_<hex>` | `newTaskId`：时间戳 hex 尾 6 位 + counter 2 位 + 随机 1 位 |
| title | string ≤80 | 必填 |
| goal | `{text ≤280, status, source}` | **v2**：目标对象。status ∈ `active`/`done`/`none` 且**跟随 task.status**（done→done，无 text→none）；source ∈ `session`/`task`（agent 产出=session，用户表单=task）。旧版字符串自动迁移（v1→v2） |
| acceptanceCriteria | string ≤600 | **v2**：验收标准；agent 完成判定依据 |
| notes | string ≤280 | 备注 |
| dueDate | string ≤10 | **v2.1**：到期日 `YYYY-MM-DD`；卡片显示 📅 pill，过期未完成（dueDate<今天且 status≠done）红色高亮 |
| status | `backlog` \| `in_progress` \| `blocked` \| `done` | 四列看板列 |
| priority | `P0` \| `P1` \| `P2` \| `P3` | 默认 P2 |
| tags | string[] ≤4，单个 ≤12 字 | |
| progress | 0-100 整数 \| null | **v2**：有 subtasks 时自动推导（=round(done/total×100)，v2 contract）；无 subtasks 时 done=100、backlog 未设=0，其余手动 |
| subtasks | `{id, text ≤60, done, source}[] ≤12` | **v2**：可勾选执行步骤。source ∈ `ai`（agent 分析产出）/`todo`（导入计划）/`manual`（人工，永不被自动关闭）；旧字符串迁移为 manual |
| artifacts | `{id, name ≤120, path ≤260, kind, time}[] ≤10` | **v2**：交付物路径。kind ∈ `deliverable`/`modified`；agent 每轮产出可追加 |
| lockedFields | string[] | **v2**：agent 分析不得覆盖的字段，取值限 `LOCKABLE_FIELDS = [title, goal, status, progress, priority, tags, notes, subtasks, artifacts, dependsOn]`；非法项被过滤。**目前只有 subtasks 有实际锁语义**，其余字段只是记录 |
| workspaceId / projectId / assigneeId | string | 引用；`""` = 无 |
| dependsOn | string[] ≤8 | **未发布**：前置任务 id 列表，方向是「本任务依赖它们」。只能指向存在的任务，不得指向自己，不得成环；`ready` 由它派生、不落盘。见「任务依赖语义」 |
| origin | `manual` \| `session` | **v2**：agent 会话可传 `origin:"session"` + `sourceSessionId` 挂靠会话 |
| sourceSessionId | string ≤200 | **v2**：产生该任务的 agent 会话 id |
| agentSessionId | string ≤200 | **未发布**：当前执行该任务的成员会话 id（审计用；派单/重投时写入） |
| agentState | `""` \| `queued` \| `running` | **未发布**：执行队列状态；仅 in_progress 保留，其余状态清空。重启后 queued 可重建，running 由 resume 接管 |
| archived | boolean | 归档不显示，不删除 |
| pinned | boolean | **v2.5**：置顶标记。看板排序 `compareTasks` 先按 pinned 降序，再按优先级、最后 `updatedAt` 降序；卡片显示「置顶」徽章。变更写 `kind:"pin"`（「置顶任务」/「取消置顶」） |
| history | entry[] ≤20 | `{at, kind, note, from?, to?}`；kind ∈ create/status/assignee/archive/edit/**subtask**/**pin**/**dependency** |

### Member 成员（团队管理，v0.3 队长 + 工作成员）
| 字段 | 取值 |
| --- | --- |
| id | `m_<8chars>` |
| name | ≤40 字，必填 |
| role | `owner` \| `admin` \| `member` \| `guest`，默认 `member`；非法值在迁移时钳为 `member`。这是**人类视角的权限标签**，与 kind 正交 |
| kind | **v0.3**：`lead`（队长）\| `worker`（工作成员）；迁移缺省为 `worker`，启动时若全队无 lead 则把最早的成员提升为 lead |
| leadId | **v0.3**：worker 挂靠的队长 id；`""` = 暂无队长（orphan）。lead 自身恒为 `""` |
| personality | **v0.3**：≤200 字，人格/行事准则（「先问目标再动手」这类） |
| skills | **v0.3**：string[] ≤8，单个 ≤20 字，去空去重（先去重再截断） |
| provider / model | **v0.3**：≤60 / ≤60，成员画像里的模型偏好。**未发布**：真实用于 `agents.create/resume` 的 `agentOptions`；空值仍表示继承工作区。**v0.4**：两者同时为 `""` 表示「继承工作区」= 跟随宿主 `agentDefaultModel.currentSelection()`，不是「未配置」；服务端不做白名单校验，宿主目录里已消失的历史 id 原样保留 |
| status | **v0.3**：`idle` \| `working` \| `blocked`，默认 `idle`。worker 由任务派生（有 blocked→blocked；有 in_progress 或 ready 的 backlog→working；其余 backlog 视为等待前置；都没有→idle），lead 可手工设置 |
| sessionId | **v0.3**：≤200，历史预留位；**未发布**起由 `sessions` 取代，不再写入 |
| sessions | **未发布**：`{workspaceId: sessionId}`，每成员按工作区复用会话，最多 4 个（LRU）；键空串表示默认工作区 |
| agentState | **未发布**：`""` \| `unavailable`（宿主无 agents 服务或 create/resume 失败，降级人工） |
| title / contact | ≤60 / ≤80 字 |
| archived | boolean |

**唯一性**：一支队伍**只有一个队长**。已有 lead 时再建 lead 返回 409「团队已经有队长（X），请先解除再指定新队长」。
**种子（v0.5）**：成员表为空时，`start()` 的 `settleTeam()` 自动创建默认队长（名称「队长」、`kind:"lead"`、`role:"owner"`、画像字段空串），因此每个团队从诞生起就有一名队长。
**接管**：lead 上任（新建为 lead 或由 worker 提升）时，所有 `leadId` 为空的 worker 自动挂到该 lead 名下（`adoptOrphanWorkers`）。
**恒定角色（v0.5，取代旧「卸任」语义）**：队长不可被删除（`/member.delete` → 400「队长不可被删除」）、不可被降级为 worker（`/member.update` kind=worker → 400「队长不可被卸任」），换队长路径整体关闭；队长资料字段（name/title/personality/skills/provider/model/status 等）仍可正常编辑。worker→lead 晋升仅在团队确实没有队长时可能（v0.2.7 兼容路径），正常安装下只会得到 409。

### Task 的验收字段（v0.3）
| 字段 | 取值 |
| --- | --- |
| reviewStatus | `none` \| `pending` \| `accepted` \| `changes`，默认 `none`；迁移缺省 `none` |
| reviewNote | ≤160 字（复用 historyNote 上限）；提交说明或验收意见 |

### Project 项目（v2.6 / v2.7）
| 字段 | 取值 |
| --- | --- |
| id | `p_<8chars>` |
| name | ≤80 字，必填 |
| notes | ≤600 字 |
| dueDate | `YYYY-MM-DD` 或 `""`；`normalizeDateOnly` 拒绝非法日期（如 `2026-02-31`） |
| workspaceId | 关联的 DSH 工作区 id 或 `""`（不关联）；**v2.7 起当工作区发现可用时必须是已发现的 id**，未知值写入 400，历史脏值在 `start()` 时被清除 |
| archived | boolean；归档项目默认折叠进「已归档项目」，且**不能再接收新任务** |
| createdAt / updatedAt | ISO 时间戳；`updatedAt` 是 v2.7 乐观锁的版本凭据 |

项目分两类呈现：**工作区项目**（来自 DSH 工作区发现的只读卡片，按 `workspaceId` 统计）/ **自建项目**（手动创建，可跨工作区）。

**唯一绑定（v2.7）**：同一 `workspaceId` 只允许一个**未归档**项目；冲突写入返回 409。归档即让出绑定。

### Workspace 工作区（发现型，只读）
来源 `$DSH_HOME/storages/workspace.json`，优先读 DSH 现行布局 `tables.workspaces`（其它 `tables.*` 表不参与）；本插件只保存 `included` 标志与 sessionCount/lastActivityAt。

### Settings
`defaultAssigneeId`（新任务默认指派，成员被删时清空）、`showArchived`（预留）。

## AI AGENT 执行语义（v2 核心）

| 语义 | 规则 | 实现位置 |
| --- | --- | --- |
| 目标-状态联动 | task.status 变 done ⇒ goal.status="done"；status 离开 done ⇒ "active"（有 text）；无 text ⇒ "none" | service.mjs `syncGoalStatus` |
| 进度推导（v2 contract） | 有 subtasks ⇒ progress=done/total 百分比，每次 subtasks/status 变更重算 | service.mjs `progressFromSubtasks`/`syncProgress` |
| 完成自动收尾 | status→done 时，**非 manual** 且 subtasks 未锁定的未完成子任务自动置 done，写 `kind:"subtask"` history | task.update / task.move |
| 人工保护 | `source:"manual"` 的子任务永不被自动关闭；`lockedFields` 含 "subtasks" 时整个子任务列表不动 | 同上 |
| 字段锁定 | lockedFields 内字段由 agent 写入时跳过（锁定集合白名单过滤） | normalizeLockedFields |
| 会话挂靠 | agent 可带 `origin:"session"`、`sourceSessionId`，goal.source="session" | task.create |

## 团队协作语义（v0.3：队长带工人）

| 语义 | 规则 | 实现位置 |
| --- | --- | --- |
| 一队一队长 | 已有 lead 再建 lead → 409「团队已经有队长（X），请先解除再指定新队长」 | `service.mjs /member.create` |
| 自动挂靠 | worker 未显式给 `leadId` 时自动挂到现任 lead；显式 `""` 才保持 orphan | 同上 |
| 接管 orphan | lead 上任时把所有 `leadId===""` 的 worker 收到名下 | `adoptOrphanWorkers` |
| 空队种子（v0.5） | 成员表为空时启动即创建默认队长「队长」（kind=lead、role=owner） | `settleTeam` |
| 队长恒定（v0.5，取代「卸任不连坐」） | lead 不可删除（400「队长不可被删除」）、不可降级（400「队长不可被卸任」）；资料字段可编辑 | `/member.delete` `/member.update` |
| 成员状态派生 | worker 的 status 由任务推导：有 blocked→`blocked`；有 in_progress 或 ready 的 backlog→`working`；全部未完成 backlog 都在等前置→`idle`。lead 不自动派生 | `refreshMemberStatus` / `refreshTeam` |
| 派单 | owner 或 lead 把任务指给 worker：`assigneeId` 写入、backlog→in_progress（**未就绪则 409，且不写 assigneeId**）、清空旧验收态、写 `kind:"assignee"` history | `/member.dispatch` |
| 做的人不验收 | worker 只能 `report` 提交（`reviewStatus="pending"`），**不改状态列**（仍是 in_progress）；只有 lead 能 `review` 判定。**未就绪任务也可提交**，history 记「提交时前置未完成」 | `/member.report` `/member.review` |
| 职责隔离 | 任务已属他人 → 400「任务属于 X，Y 无法回报」；非 pending 的任务不能验收 → 409；验收人不能是被验收的 assignee → 400「自己完成的任务不能自己验收，请移交队长」 | 同上 |
| 人工越权优先 | owner 在看板把 worker 任务直接拖到 done，视同验收：`reviewStatus="accepted"` + note「人工直接完成（视同验收）」 | `settleReviewOnStatus` |
| 启动自愈 | 升级前无 kind 字段：启动时若全队无 lead 且有成员，把 `createdAt` 最早的成员提升为 lead；指向已删 lead 的 `leadId` 清空 | `settleTeam` |

## 任务依赖语义（未发布：task-dependencies）

三种关系互不替代：**子任务**是同一交付物的步骤（同一 owner、不单独验收）；**依赖边**是独立交付物之间的先后（可能换人、各自验收）；**blocked** 是停下来等人决策。等待前置**不是** blocked——它不应污染成员状态与团队 attention。

| 语义 | 规则 | 实现位置 |
| --- | --- | --- |
| 表示 | 依赖方存 `dependsOn: string[]`（≤8，去重、保序）；不建独立边集合，不引入 `blocks[]` 或父子层级 | `limits.normalizeDependsOn` / `store.normalizeTask` |
| 引用完整性 | 前置必须存在；自依赖 400；成环 409（DFS，message「任务依赖成环：A → B → A」） | `service.validateDependsOn` |
| 就绪派生 | `ready = dependsOn.every(id => 任务存在且 status==="done")`；缺失 id 视为未完成；不落盘，`/state` 现算；归档不影响判定（已完成+已归档算满足） | `service.isReady` / `buildStatePayload` |
| 开工守卫 | 任何把状态写成 `in_progress` 的请求，在前置未完成时 409，message 列出「标题（状态）」；覆盖 create/update/move/dispatch，且**先于任何字段修改**（dispatch 先于写 assigneeId） | `service.assertStartable` |
| 同请求改依赖+状态 | update 先归一化并校验新 dependsOn，再按新依赖判就绪；被拒不写入任何字段 | `/task.update` |
| 汇报例外 | worker 对未就绪任务仍可 report；status 仍被推成 in_progress（表示人在处理），history 记「提交时前置未完成：…」 | `/member.report` |
| 越权完成 | 任何入口 → done 都放行；有未完成前置时 history 记「越权完成：前置 … 未完成」（人工优先，沿用 v0.3） | create / update / move |
| 已开工不回退 | 守卫只在进入 in_progress 那一刻判定；已 in_progress 的任务新增/回退前置不改变状态 | `assertStartable` |
| 删除级联 | 删除任务时从其余任务的 dependsOn 摘除该 id，刷新 `updatedAt` 并写 history「前置任务已删除：X」；`project.delete` 只解绑 projectId，依赖边保留 | `/task.delete` / `/project.delete` |
| 迁移自愈 | 缺省 dependsOn → `[]`；迁移时丢弃悬空 id 与自引用（静默，不写 history）；不升 `STATE_VERSION` | `store.migrate` |
| 成员状态 | 只有 in_progress 或 ready 的 backlog 算 working；全部未完成 backlog 都在等前置时显示 idle；blocked 优先 | `refreshMemberStatus` |
| 团队负载 | `worker.waiting` = 已指派、仍 backlog、未就绪的任务数；`team.waiting` 为汇总；`inFlight` 口径不变（已指派未完成） | `buildTeamPayload` |
| 客户端 | 卡片「等待前置 N」chip、抽屉前置列表（标题/状态/跨项目名）、弹窗选择器（排除自身与成环候选）、拖拽本地预检 + 409 回滚 toast、「仅看可开工」筛选 | `client.js` |

## Agent 团队语义（未发布：agent-team）

派单不再只是记名字：队长与成员各有真实会话，任务按工作区串行执行。

| 语义 | 规则 | 实现位置 |
| --- | --- | --- |
| 会话映射 | 每成员×工作区一个会话：先 `resume` 映射的 `sessionId`，失败则 `create` 新会话并标记 rebuilt；`Member.sessions` 最多 4 项，淘汰时 dispose | `sessions.ensureSession` |
| 创建参数 | `cwd`=工作区路径（缺省用默认工作区/进程 cwd）、`agentOptions`=成员 provider/model（空则继承）、权限 `workspace-write`、**不设 `parentSession`** | `sessions.buildSetup` |
| 角色工具 | 队长 6 个（board_read/member_list/task_create/task_update/dispatch/review）；成员 3 个（task_get/report/artifact_add）；工具处理函数从会话身份取 memberId 并校验 assignee | `service.leadTools/workerTools` |
| 计划闸门 | 队长先给计划，用户确认后才建卡派单；`task_create` 1–30 张、整批校验通过才一次写入（失败零写入） | `rolePrompt` / `leadTools.task_create` |
| 执行队列 | `Task.agentState`：`""` \| `queued` \| `running`；派单时同工作区/同成员已有 running 则 queued，结束后按 `updatedAt` 推进 | `dispatchTask` / `pumpAgents` |
| 简报 | 投递内容含任务 id/标题/负责人/目标/验收/优先级/前置/项目/工作区路径/汇报要求；打回时附「打回意见」 | `taskBrief` |
| 汇报 | 成员 `report` 三态：progress（只记进展）、blocked（置 blocked）、done（置 pending 验收）；done/blocked 清 `agentState` | `reportTask` |
| 验收 | accepted→done + 自动关闭子任务；changes→reviewStatus=changes + in_progress + 重新排队并补投打回意见 | `reviewTask` |
| 唤醒 | done/blocked 唤醒队长，按成员 30 秒窗口合并；progress 不唤醒 | `scheduleWake` / `flushWakes` |
| 看门狗 | `running` 超过 30 分钟未更新（`IICP_AGENT_TIMEOUT_MS` 可覆盖）→ blocked + history「执行超时，已置为受阻」+ 唤醒队长 | `tickAgents` |
| 重启恢复 | 启动时把已指派、in_progress、非 running 的任务置 queued 后按队列重投；running 的会话 resume 后不重复投递 | `restoreAgents` |
| 降级 | `agents` 缺失或 create/resume 抛错：派单仍成功，任务 queued、成员 `agentState="unavailable"`，接口返回 `agent.available=false` | `deliverTask` |
| 销毁 | 删除成员、插件卸载时 dispose 对应句柄并清映射 | `/member.delete` / `stop` |

## 状态机

### Task.status
```
backlog ⇄ in_progress ⇄ blocked ⇄ done
（四列全连通：任何列可拖到任何列；唯一例外是进入 in_progress 需要前置已全部完成，否则 409）
```
转换途径：`/task.move`（看板拖拽，note=「看板拖拽：from → to」）或 `/task.update` 的 status 字段（note=「状态变更」，changes 记「状态 from → to」）。每次转换写一条 `kind:"status"` history。**→ done 的转换额外触发**：自动关闭生成子任务 + goal/progress 联动。

### goal.status（从属状态机）
```
text="" → none（终值，除非写入 text）
text≠"" → task.status=done ? done : active（自动跟随，不可手设为矛盾值）
```

### reviewStatus（v0.3 验收状态机）
```
none ──worker report──> pending ──lead accepted──> accepted（task.status→done）
                          │  └────lead changes───> changes（task.status→in_progress）
                          └──owner 直接拖到 done──> accepted（视同验收）
accepted/changes ──任务离开 done 或被改派──> none
```
- `pending` 只在任务处于 in_progress 时由 worker 主动提交产生；队长验收是唯一的 `accepted` 正途（owner 手动拖 done 例外）。
- 改派（`/member.dispatch` 或 `/task.update` 改 assignee）清空 `reviewStatus`/`reviewNote`，避免旧结论跟着新负责人走。
- 每次提交与验收都写一条 `kind:"review"` history（「X 提交验收：note」/「Y 验收通过」/「Y 要求返工」）。

### 实体生命周期
- Task: create → update*(history 累积) → archived? → delete（物理删除）。
- Member: create → update(资料字段；**kind 不可从 lead 改出**) → delete(**仅 worker 可删**)；**删除级联**：其任务 assigneeId→"" + history「成员已移除，任务改为未指派（原成员：X）」。
- Project: create → update → delete；**删除级联**：其任务 projectId→"" + history「项目已删除，任务改为无项目（原项目：X）」（v2.7 起，与 Member 对齐）。

## 迁移（v1 → v2，v0.2 → v0.3）

- goal 字符串 → `{text, status: text?(done?"done":"active"):"none", source:"task"}`。
- subtasks 字符串元素 → `{text, done:false, source:"manual"}`；无效条目丢弃；截断至 12。
- 缺省 acceptanceCriteria/subtasks/artifacts/lockedFields/progress → 空值；progress 非法值钳到 0-100 或 null。
- lockedFields 过滤到 LOCKABLE_FIELDS 白名单。
- **v0.3**：member 缺 `kind` → `worker`，缺 `leadId`/`personality`/`skills`/`provider`/`model`/`sessionId` → 空，`status` 非法 → `idle`；task 缺 `reviewStatus` → `none`。升级后首次 `start()` 由 `settleTeam` 提升一名 lead 并修复悬空 `leadId`。
- **未发布**：task 缺 `dependsOn` → `[]`；迁移丢弃悬空 id 与自引用，其它字段不动。

## 引用完整性

- 写路径断言：task 的 assigneeId/projectId 必须指向存在的未归档成员/项目，否则 400（`assignee not found` / `project not found`）；`""` 合法。
- 写路径断言（v2.7）：project.workspaceId 若工作区发现可用，必须是已发现的 id，否则 400（`unknown workspace`）；同一工作区仅一个未归档项目，冲突 409。
- 写路径断言（v0.3）：member.leadId 非空时必须是存在的 lead，否则 400（`lead not found: X` / `member is not a lead: X`）；lead 自身的 `leadId` 恒为 `""`。
- 写路径断言（未发布）：task.dependsOn 的每个 id 必须指向存在的任务（400），不得自引用（400），不得成环（409）；删除任务时从其它任务摘除。
- 读路径填充：`/state` 的 task 带 `assigneeName`/`projectName`（引用已删时为空串）。
- 迁移钳制：无效枚举→默认值；缺 id 或 name 的条目丢弃；超长文本截断；tags/history/subtasks/artifacts 截断到上限。

## 不变量

1. state.json 唯一写点，原子写（tmp+rename）。
2. history ≤20 条（超出丢最旧）。
3. 每次变更 `updatedAt` 刷新。
4. 非对象 POST 体（数组/缺体）→ 400「JSON object body required」。
5. **v2**：goal.status 与 task.status 恒一致；有 subtasks 时 progress 恒等于推导值。
6. **v2**：manual 子任务与锁定的 subtasks 列表永不被自动关闭。
7. **v2.7**：工作区发现可用时，project.workspaceId 要么是已发现的 id，要么是 `""`；同一工作区至多一个未归档项目。
8. **v2.7**：`project.update` 带 `expectedUpdatedAt` 且与当前值不符时必然 409，不会写入。
9. **v0.3**：未归档成员中至多一个 `kind==="lead"`；worker 的 `leadId` 要么为空，要么指向存在的 lead。
10. **v0.3**：`reviewStatus==="pending"` 只出现在 `status==="in_progress"` 的任务上；`accepted` 必然对应 `status==="done"`（或任务已被改派清空）。
11. **v0.5**：每个团队恒有一名队长——空成员表由启动种子保证，成员表非空由「lead 不可删除/卸任」守卫保证；队长资料的编辑不影响这一不变量。
12. **未发布**：task.dependsOn 无环、无自引用、无悬空 id（写路径与迁移共同保证）。
13. **未发布**：未就绪任务不得通过任何写入口进入 `in_progress`；已 `in_progress` 的任务不因前置被新增或回退而改回 backlog。
