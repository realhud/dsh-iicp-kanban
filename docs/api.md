# dsh-iicp-kanban 接口契约（api）

> 未发布（agent-team）：新增 `POST /agent/lead`、`GET /agent/transcript`、`POST /agent/message`、`GET /agent/stream`；成员/任务多出会话与队列字段。
> v0.3：成员模块升级为「队长 + 工作成员」，新增 `GET /team`、`POST /member.dispatch|report|review`，`member.*` 增加团队字段。

所有路由挂在 DSH webServer，前缀 `/iicp-kanban/api`，owner-only（非 owner → `403 {"ok":false,"error":"unauthorized"}`）。除 /ping /state /workspaces /member.workload /team 为 GET 外，其余均为 POST，请求体为 JSON 对象（数组/缺体/非法 JSON → 400）。

## 通用约定

- 成功：`{"ok":true, ...}`
- 业务错误：`{"ok":false,"error":"invalid-input"|"not-found"|"conflict"|"internal","message":"..."}`，状态码 400/404/409/500
- id 校验：`^[A-Za-z0-9_-]{1,64}$`
- 文本字段超长自动截断（不报错），见 domain.md 各上限

## 路由

### GET /ping
健康检查。→ `{"ok":true,"plugin":"dsh-iicp-kanban","dshHome":"...","version":2,"time":"<ISO>"}`（v2 起版本号升为 2）

### GET /state
全量看板状态（客户端 8s 轮询）。→
```jsonc
{ "ok":true, "generatedAt":"<ISO>",
  "tasks":[ { ...Task, "assigneeName":"", "projectName":"", "ready":true } ],
  "members":[...Member], "projects":[...Project],
  "workspaces":[ {id,title,path,source,included,sessionCount,lastActivityAt} ],
  "settings":{ "defaultAssigneeId":"", "showArchived":false },
  "team":{ "lead":..., "workers":[...], "pendingReviews":[...], "waiting":0, ... },
  "stats":{ "total":0, "archived":0,
            "byStatus":{"backlog":0,"in_progress":0,"blocked":0,"done":0},
            "assigned":0, "unassigned":0, "members":0, "projects":0 } }
```
`team` 字段（v0.3）结构见下方 `GET /team`。`task.ready`（未发布）是派生值：`dependsOn` 全部为 `done` 时为 `true`（无前置也是 `true`），缺失的前置按未完成算；不落盘。

### 任务依赖（未发布）

- 依赖方向：`task.dependsOn` 存「本任务依赖哪些任务」，上限 8，去重保序。
- 开工判定：任何把 `status` 写成 `in_progress` 的请求，在前置未全部 `done` 时返回 `409 conflict`，message 形如「前置任务未完成：A（进行中）、B（待办）」。被拒请求不修改任何字段。
- 守卫只作用于「进入 in_progress」：已处于 in_progress 的任务新增/回退前置不改状态。
- `dependsOn` 自依赖或引用不存在 → 400；成环 → 409（「任务依赖成环：A → B → A」）。
- 删除任务时从其它任务的 `dependsOn` 摘除，并写该任务 history。

### Agent 会话（未发布）

队长与成员各跑一个真实 DSH agent 会话；看板只负责建会话、投简报、收汇报，不代理模型调用。

#### POST /agent/lead
`{}` → `{"ok":true,"available":true,"memberId":"m_x","sessionId":"s_x","rebuilt":false,"transcript":[{"role":"user|assistant","text":"...","at":"<ISO>"}]}`

- 确保队长在默认工作区的会话：先 resume，失败则重建（`rebuilt:true`）。
- 宿主没有 `agents` 服务 → HTTP 200、`available:false`、`sessionId:""`、`transcript:[]`（降级，不是错误）。

#### GET /agent/transcript?sessionId=s_x
→ `{"ok":true,"sessionId":"s_x","transcript":[...]}`。优先读 `agent.session.log`（user/message + assistant/message），最多 80 条；会话不在本进程 → 404。

#### POST /agent/message
`{sessionId, text}` → `{"ok":true}`。投递用户消息（`agent.followup`）；会话不存在 → 404；投递失败 → 409。空文本 → 400。

#### GET /agent/stream?sessionId=s_x
Server-Sent Events（`text/event-stream`）。首帧 `{"type":"ready"}`，随后转发：

| 帧 | 含义 |
| --- | --- |
| `{"type":"user","text":"..."}` | 用户消息回显 |
| `{"type":"assistant-start"}` | 助手开始输出 |
| `{"type":"chunk","text":"..."}` | 流式增量（拼接） |
| `{"type":"assistant-end"}` | 本轮结束 |
| `{"type":"status","status":"idle|running"}` | 会话状态 |

每 15 秒写一行注释保活；客户端断开即退订。SSE 不可用时客户端退回 1 秒轮询 `/agent/transcript`。

#### 派单、汇报与验收的 agent 字段

- `/member.dispatch` 返回追加 `agent:{available:boolean,state:""|"queued"|"running"}`；`agents` 缺失或建/恢复失败时仍 200（降级人工），任务 `agentState="queued"`、成员 `agentState="unavailable"`。
- `/member.report` 支持三态：`status:"progress"`（只记进展）、`"blocked"`（置 blocked）、`"done"`（置 pending 验收）；**缺省 `status` 仍是旧语义 `done`**。done/blocked 清 `agentState` 并唤醒队长（30 秒按成员合并）。
- `/member.review` 的 `changes` 分支把任务重新置 `queued`，由队列在会话空闲时补投简报（含「打回意见」），保持同工作区串行。

### GET /workspaces
→ `{"ok":true,"workspaces":[...]}`（同 /state.workspaces）

### GET /models（v0.4）
成员表单的模型目录：从 DSH 活着的 `llm` 服务读「宿主已经配好的 provider + model」，并带上宿主当前默认模型。
```jsonc
{ "ok":true, "available":true, "generatedAt":"<ISO>",
  "defaultModel": { "provider":"deepseek", "model":"deepseek-v4.1-flash" } | null,
  "providers":[ { "id":"deepseek", "name":"DeepSeek",
                  "models":[ {"id":"deepseek-v4.1-flash","name":"V4.1 Flash"}, {"id":"x"} ],
                  "modelCount":2 } ],
  "providerCount":1, "modelCount":2 }
```

- **不进 `/state`**：`/state` 被客户端每 8s 轮询一次，把模型目录塞进去会反复触发适配器枚举；客户端只在成员弹窗打开时取一次。
- **`available:false` 不是 HTTP 错误**：HTTP 恒 200。`llm` 服务未挂载/未就绪时返回 `ok:true, available:false, providers:[], error:{code:"E_RUNTIME_UNAVAILABLE",...}`，客户端退回手填输入框。`listProviders()` 抛错 → `error.code:"E_MODEL_DIRECTORY"`。
- **单个 provider 枚举失败不隐藏**：该行保留 `models:[]` 并附 `error:"<message>"`，否则成员上已有的 model id 会被静默改写。
- **`name` 缺省省略**：模型/提供方的显示名与 id 相同时不输出 `name`，客户端回落显示 `id`。
- **`defaultModel` 可能为 `null`**：宿主没配默认模型、`currentSelection()` 抛错或返回空串时均为 `null`。

### POST /workspace.update
`{id, included?:boolean}` → `{"ok":true,"workspace":{...}}`；未知 id → 404。

### POST /project.create（v2.6 / v2.7）
`{name(必填 ≤80), notes? ≤600, dueDate?, workspaceId?}` → `{"ok":true,"project":{...}}`

- **dueDate**：严格 `YYYY-MM-DD`；`normalizeDateOnly` 拒绝非法日期（如 `2026-02-31`）并回落 `""`。
- **workspaceId**：可选来源工作区 id（DSH `workspace.json` 发现值的 `id`），空串表示不关联。
  - **v2.7 校验**：当工作区发现可用时，未知 id → `400 invalid-input`（`unknown workspace: <id>`）；发现结果为空（workspace.json 缺失/损坏）时不做校验，照原样保存。
  - **v2.7 唯一绑定**：同一工作区只允许一个**未归档**项目；冲突 → `409 conflict`。

### POST /project.update（v2.6 / v2.7）
`{id, name?, notes?, dueDate?, workspaceId?, archived?, expectedUpdatedAt?}` → `{"ok":true,"project","changed":boolean}`；name 空串 → 400；`dueDate` 每次传入都过 `normalizeDateOnly`；`workspaceId` 传空串即解绑。

- **expectedUpdatedAt（v2.7 乐观锁）**：传入且与当前 `project.updatedAt` 不符 → `409 conflict`（"项目已被其他窗口修改，请刷新后重试"）；不传则跳过检查。
- **无变化不写盘（v2.7）**：字段逐个 `Object.is` 比对，全部相同则直接返回 `changed:false` 且不刷新 `updatedAt`。
- **工作区唯一绑定**：改 `workspaceId` 或取消归档时，若该工作区已有另一个未归档项目 → `409 conflict`。

### POST /project.delete
`{id}` → `{"ok":true,"deleted":id}`；级联：其任务 `projectId→""`，同时写任务 history（`kind:"project"`，note「项目已删除，任务改为无项目（原项目：X）」）并刷新 `updatedAt`（v2.7 与 member.delete 对齐）。id 不存在 → 404。
### GET /workspaces（v2.6 兼容 DSH 现行布局）
读取 `$DSH_HOME/storages/workspace.json`，依次尝试 `tables.workspaces`（DSH 现行）、`workspaces`、裸 map、数组四种形状；只有 workspace 表参与，其他表（如 `tables.sessions`）不会混入。

### POST /member.create（v0.3 起含团队字段）
`{name(必填), role?="member", kind?∈lead/worker, leadId?, title?, contact?, personality?, skills?, provider?, model?, status?="idle"}` → `{"ok":true,"member"}`

- **role**：人类权限标签（owner/admin/member/guest），非法 → 400。
- **kind**：`lead`/`worker`，非法 → 400 `invalid kind: X`；不传时由服务端推导——**团队已有队长则新成员为 `worker`，无队长（仅 v0.2.7 兼容路径，正常安装不会出现）则为 `lead`**。空成员表的团队在启动时由服务端自动种子默认队长（见 /team），因此常规调用恒得到 `worker`。
- **leadId**：worker 的归属队长。不传时自动挂到现任 lead；显式传 `""` 表示先不归属（orphan）。指向非 lead → 400 `lead not found: X` / `member is not a lead: X`。lead 自身恒为 `""`。
- **一队一队长**：已有 lead 时再建 lead → `409 conflict`「团队已经有队长（X），请先解除再指定新队长」。新 lead 上任会接管所有 orphan worker。
- **skills**：数组或字符串数组，单个 ≤20 字，≤8 个，去空**先去重再截断**；**personality** ≤200；**provider/model** ≤60（画像字段，不触发真实 agent spawn，见 architecture.md）。
- **provider/model 空串 = 继承工作区（v0.4）**：两者都留空表示「跟随宿主当前默认模型」，不是「未配置」。服务端不做白名单校验，允许保留目录里已经消失的历史 id。

### POST /member.update（v0.3 起含团队字段）
`{id, name?, title?, contact?, role?, archived?, kind?, leadId?, personality?, skills?, provider?, model?, status?}` → `{"ok":true,"member"}`

- **kind 升为 lead**：已有其他 lead → `409 conflict`；成功则接管所有 orphan worker。
- **kind 降为 worker（卸任）——v0.5 起禁止**：lead 是恒定角色，不可卸任 → `400 invalid-input`「队长不可被卸任」（成员与任务一律不受影响；换队长路径已整体关闭）。
- **leadId**：lead 传该字段 → 400「队长不能挂靠到其他成员」。
- **status**：`idle`/`working`/`blocked`，非法 → 400。worker 的 status 通常由任务派生，手工设置会被下一次 `refreshMemberStatus` 覆盖。
- **provider/model 改回空串**：显式传 `""` 即把成员切回「继承工作区」。

### POST /member.delete
`{id}` → `{"ok":true,"deleted":id}`；级联：其任务 assigneeId→"" + 写任务 history「成员已移除…」；settings.defaultAssigneeId 清空。
**v0.5 起队长不可被删除**：`id` 指向 lead → `400 invalid-input`「队长不可被删除」（成员、任务与归属关系一律不变；每个团队恒有一名队长）。

### GET /member.workload（v0.3 扩列）
→ `{"ok":true,"workload":[ {memberId,name,role,kind,leadId,status,reviewing,total,byStatus:{...}}, …, {"memberId":"","name":"未指派","role":"","kind":"","leadId":"","status":"","reviewing":0,"total",...} ]}`（末尾固定追加未指派桶）

### GET /team（v0.3）
团队聚合视图，供客户端一次渲染队长卡 + 工人卡 + 待验收队列。
```jsonc
{ "ok":true, "team":{
  "lead": { ...Member, "workerCount":0 },
  "workers": [ { ...Member, "taskTotal":0, "inFlight":0, "blocked":0, "awaitingReview":0, "waiting":0, "orphan":false } ],
  "pendingReviews": [ {"taskId","title","assigneeId","assigneeName","note","updatedAt"} ],
  "unassigned": 0, "blocked": 0, "inFlight": 0, "waiting": 0, "orphanWorkers": 0,
  "generatedAt": "<ISO>" } }
```
`waiting`（未发布）：已指派、仍为 `backlog`、未就绪（`ready:false`）的任务数；`workers[].waiting` 为按人统计，`team.waiting` 为汇总。`inFlight` 口径不变（已指派未完成）。
`lead` 恒非空：成员表为空时服务端启动即种子默认队长（名称「队长」、`kind:"lead"`、`role:"owner"`、画像字段空串），v0.2.7 老数据（有成员无 lead）启动时提升最早成员为队长。`workers[].orphan` 与 `orphanWorkers` 字段保留，但正常安装下恒为 0（队长不可删除/卸任）。
`/state` 的响应体末尾同样带 `team` 字段（结构一致），客户端 8s 轮询即可拿到团队视图。

### POST /member.dispatch（v0.3）
`{taskId, memberId, leadId?}` → `{"ok":true,"task","member"}`

- 派单 = 指派 + 认领一步完成：`assigneeId=worker.id`；`backlog → in_progress`（其它状态不动）；清空旧的 `reviewStatus`/`reviewNote`；写 `kind:"assignee"` history「派单：X 认领」。
- **未就绪守卫（未发布）**：`backlog` 任务的前置未全部完成 → `409 conflict`，且**不写 `assigneeId`**；已 `in_progress` 的任务重派不受此守卫影响。
- 未知任务 → 404；未知成员 → 400 `assignee not found: X`；`leadId` 指向非 lead → 400。
- 派单后实时刷新该 worker 的 `status`（→ `working`）。

### POST /member.report（v0.3）
`{taskId, memberId, note?, subtasks?, artifacts?}` → `{"ok":true,"task"}`

- **做的人不验收**：worker 只能提交，`reviewStatus → "pending"`，**状态列仍是 in_progress**（不会自己变 done）。
- 任务已属他人 → 400「任务属于 X，Y 无法回报」；已处于 pending → `409 conflict`「该任务已提交验收，等待队长处理」。
- `blocked`/`backlog` 会自动回到 `in_progress`；`subtasks`/`artifacts` 传了就按 v2 规则整体覆盖并重算 progress。
- **汇报不受前置阻塞（未发布）**：未就绪也接受提交，额外写一条 `kind:"dependency"` history「提交时前置未完成：…」。
- 写 `kind:"review"` history「X 提交验收：note」。

### POST /member.review（v0.3）
`{taskId, decision∈accepted|changes, leadId?, note?}` → `{"ok":true,"task"}`

- `decision` 非法（含 `none`）→ 400 `invalid decision: X`；任务不在 `pending` → `409 conflict`「该任务没有待验收的提交」。
- 无队长 → 400「团队没有队长，无法验收」；reviewer 非 lead → 400；**reviewer 就是 assignee** → 400「自己完成的任务不能自己验收，请移交队长」。
- **accepted**：`reviewStatus="accepted"`、`status="done"`、自动关闭非 manual 子任务、goal/progress 联动、history「X 验收通过」。
- **changes**：`reviewStatus="changes"`、`status="in_progress"`、history「X 要求返工」。

### POST /task.create（v2）
`{title(必填), goal?, acceptanceCriteria?, notes?, dueDate?, status?="backlog", priority?="P2", tags?, workspaceId?, projectId?, assigneeId?, origin?="manual", sourceSessionId?, subtasks?, artifacts?, lockedFields?, dependsOn?}` → `{"ok":true,"task"}`

- **goal**：字符串（旧客户端）自动迁移为 `{text,status,source:"task"}`；或直接传对象 `{text ≤280, status?∈active/done/none, source?∈session/task}`（agent 传 `source:"session"`）。
- **acceptanceCriteria** ≤600：验收标准。
- **subtasks** ≤12：元素为 `{text ≤60, done?, source?∈ai/todo/manual}` 或字符串（迁移为 manual）；无效条目丢弃；返回时带服务端生成的 `id`。
- **artifacts** ≤10：`{name?, path ≤260, kind?∈deliverable/modified, time?}` 或字符串路径（name 自动取文件名）。
- **lockedFields**：仅接受 `LOCKABLE_FIELDS = [title,goal,status,progress,priority,tags,notes,subtasks,artifacts,dependsOn]` 内的值。
- **dependsOn**（未发布）：前置任务 id 数组（≤8，去重保序）；自依赖/不存在 400，成环 409。`status="in_progress"` 且前置未完成 → 409，任务不创建。`status="done"` 放行，但 history 记「越权完成：前置 … 未完成」。
- **origin/sourceSessionId**：agent 会话挂靠（origin="session" + 会话 id ≤200）。
- 返回的 task 带 `progress`（有 subtasks 时=done 比例，否则 done→100/backlog 未设→0）与 `pinned`（默认 `false`）。
- **v0.3 验收字段**：新建任务恒为 `reviewStatus:"none"`、`reviewNote:""`（由 `/member.report`、`/member.review` 驱动）。
- 返回的 task 带 `ready`（派生，不落盘）。引用不存在 → 400；history 追加 `{kind:"create",note:"创建任务"}`。

### POST /task.update（v2）
`{id, title?, goal?, acceptanceCriteria?, notes?, dueDate?, status?, priority?, tags?, dependsOn?, projectId?, assigneeId?, archived?, pinned?, subtasks?, artifacts?, lockedFields?}` → `{"ok":true,"task","changed":boolean}`

- goal 支持字符串（整体迁移）或**部分对象**（与现有 goal 合并后归一化）。
- **status→done 联动**：goal.status→"done"；非 manual 且 subtasks 未锁定的未完成子任务自动置 done（写一条 `kind:"subtask"` history「任务完成，自动关闭 N 个生成子任务」）；progress 重算。
- **v0.3 人工越权**：owner 直接把 worker 的任务改成 done，视同验收（`reviewStatus→"accepted"`、`reviewNote="人工直接完成（视同验收）"`，见 service.mjs `settleReviewOnStatus`）；状态离开 done 时 pending/accepted 会被清回 `none`。
- **v0.3 改派清验收**：`assigneeId` 变更时清空 `reviewStatus`/`reviewNote`，旧结论不跟着新负责人走。
- **dependsOn（未发布）**：整体覆盖（空数组即清空）；校验同 create。同一请求同时改 `dependsOn` 与 `status` 时，先归一化并校验新依赖，再按新依赖判就绪；被 409 拒绝时所有字段都不写入。`dependsOn` 变更写 `kind:"dependency"` history（「前置更新：A、B」/「前置已清空」）。
- **未就绪不可开工（未发布）**：`status→in_progress` 且前置未完成 → 409；`status→done` 放行并记越权 history。
- subtasks/artifacts 更新后 progress 自动重算（v2 contract）。
- **pinned（v2.5）**：布尔置顶标记；`pinned` 与现值不同时写 `kind:"pin"` history（「置顶任务」/「取消置顶」）并计入 `changed`；相同值不写盘。看板排序 `compareTasks` 先按 pinned 降序，再按优先级、最后按 `updatedAt` 降序。
- 有 diff 才写盘；status 变更写 `kind:"status"`（from/to），指派变更写 `kind:"assignee"`（note「指派：X → Y」），归档写 `kind:"archive"`；其余 diff 合并一条 `kind:"edit"`。
### POST /task.delete
`{id}` → `{"ok":true,"deleted":id}`（物理删除）。**级联（未发布）**：从其它任务的 `dependsOn` 摘除该 id，刷新其 `updatedAt` 并写 history「前置任务已删除：X」。
### POST /task.move（v2）
`{id, status}` → `{"ok":true,"task"}`（看板拖拽专用；同状态幂等返回，不写历史）。status 非法 → 400；id 不存在 → 404。**未就绪拖入 in_progress → 409**（未发布）；**→ done 的联动语义与 /task.update 相同**（goal/progress/自动关闭生成子任务），未完成前置时记越权 history。

## 错误码速查

| 场景 | 状态码 | error |
| --- | --- | --- |
| 非 owner | 403 | unauthorized |
| URL 无法解析 | 400 | invalid-input |
| 体非对象/非法 JSON/引用不存在/枚举非法/必填缺失 | 400 | invalid-input |
| id 未找到 | 404 | not-found |
| 工作区绑定冲突 / 乐观锁冲突（v2.7） | 409 | conflict |
| 重复队长（v0.3） | 409 | conflict |
| 重复提交验收 / 无待验收任务（v0.3） | 409 | conflict |
| 前置未完成却开工 / 依赖成环（未发布） | 409 | conflict |
| 会话不存在 / 消息投递失败（未发布） | 404 / 409 | not-found / conflict |
| 验收人=完成人、成员非队长、leadId 悬空（v0.3） | 400 | invalid-input |
| 删除/卸任队长（v0.5） | 400 | invalid-input |
| 无匹配路由 | 404 | not-found（message: `no route: GET /x`） |
| 服务端异常 | 500 | internal |
