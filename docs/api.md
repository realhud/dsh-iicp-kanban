# dsh-iicp-kanban 接口契约（api）

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
  "tasks":[ { ...Task, "assigneeName":"", "projectName":"" } ],
  "members":[...Member], "projects":[...Project],
  "workspaces":[ {id,title,path,source,included,sessionCount,lastActivityAt} ],
  "settings":{ "defaultAssigneeId":"", "showArchived":false },
  "team":{ "lead":..., "workers":[...], "pendingReviews":[...], ... },
  "stats":{ "total":0, "archived":0,
            "byStatus":{"backlog":0,"in_progress":0,"blocked":0,"done":0},
            "assigned":0, "unassigned":0, "members":0, "projects":0 } }
```
`team` 字段（v0.3）结构见下方 `GET /team`。

### GET /workspaces
→ `{"ok":true,"workspaces":[...]}`（同 /state.workspaces）

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
- **kind**：`lead`/`worker`，非法 → 400 `invalid kind: X`；不传时**第一个成员自动成为 lead**，其后默认 `worker`。
- **leadId**：worker 的归属队长。不传时自动挂到现任 lead；显式传 `""` 表示先不归属（orphan）。指向非 lead → 400 `lead not found: X` / `member is not a lead: X`。lead 自身恒为 `""`。
- **一队一队长**：已有 lead 时再建 lead → `409 conflict`「团队已经有队长（X），请先解除再指定新队长」。新 lead 上任会接管所有 orphan worker。
- **skills**：数组或字符串数组，单个 ≤20 字，≤8 个，去空**先去重再截断**；**personality** ≤200；**provider/model** ≤60（画像字段，不触发真实 agent spawn，见 architecture.md）。

### POST /member.update（v0.3 起含团队字段）
`{id, name?, title?, contact?, role?, archived?, kind?, leadId?, personality?, skills?, provider?, model?, status?}` → `{"ok":true,"member"}`

- **kind 升为 lead**：已有其他 lead → `409 conflict`；成功则接管所有 orphan worker。
- **kind 降为 worker（卸任）**：名下 worker 的 `leadId` 清空，成员与任务一律保留。
- **leadId**：lead 传该字段 → 400「队长不能挂靠到其他成员」。
- **status**：`idle`/`working`/`blocked`，非法 → 400。worker 的 status 通常由任务派生，手工设置会被下一次 `refreshMemberStatus` 覆盖。

### POST /member.delete
`{id}` → `{"ok":true,"deleted":id}`；级联：其任务 assigneeId→"" + 写任务 history「成员已移除…」；settings.defaultAssigneeId 清空；**若删的是 lead，仅把名下 worker 的 `leadId` 置空（不删成员、不解绑任务）**。

### GET /member.workload（v0.3 扩列）
→ `{"ok":true,"workload":[ {memberId,name,role,kind,leadId,status,reviewing,total,byStatus:{...}}, …, {"memberId":"","name":"未指派","role":"","kind":"","leadId":"","status":"","reviewing":0,"total",...} ]}`（末尾固定追加未指派桶）

### GET /team（v0.3）
团队聚合视图，供客户端一次渲染队长卡 + 工人卡 + 待验收队列。
```jsonc
{ "ok":true, "team":{
  "lead": { ...Member, "workerCount":0 } | null,
  "workers": [ { ...Member, "taskTotal":0, "inFlight":0, "blocked":0, "awaitingReview":0, "orphan":false } ],
  "pendingReviews": [ {"taskId","title","assigneeId","assigneeName","note","updatedAt"} ],
  "unassigned": 0, "blocked": 0, "inFlight": 0, "orphanWorkers": 0,
  "generatedAt": "<ISO>" } }
```
`/state` 的响应体末尾同样带 `team` 字段（结构一致），客户端 8s 轮询即可拿到团队视图。

### POST /member.dispatch（v0.3）
`{taskId, memberId, leadId?}` → `{"ok":true,"task","member"}`

- 派单 = 指派 + 认领一步完成：`assigneeId=worker.id`；`backlog → in_progress`（其它状态不动）；清空旧的 `reviewStatus`/`reviewNote`；写 `kind:"assignee"` history「派单：X 认领」。
- 未知任务 → 404；未知成员 → 400 `assignee not found: X`；`leadId` 指向非 lead → 400。
- 派单后实时刷新该 worker 的 `status`（→ `working`）。

### POST /member.report（v0.3）
`{taskId, memberId, note?, subtasks?, artifacts?}` → `{"ok":true,"task"}`

- **做的人不验收**：worker 只能提交，`reviewStatus → "pending"`，**状态列仍是 in_progress**（不会自己变 done）。
- 任务已属他人 → 400「任务属于 X，Y 无法回报」；已处于 pending → `409 conflict`「该任务已提交验收，等待队长处理」。
- `blocked`/`backlog` 会自动回到 `in_progress`；`subtasks`/`artifacts` 传了就按 v2 规则整体覆盖并重算 progress。
- 写 `kind:"review"` history「X 提交验收：note」。

### POST /member.review（v0.3）
`{taskId, decision∈accepted|changes, leadId?, note?}` → `{"ok":true,"task"}`

- `decision` 非法（含 `none`）→ 400 `invalid decision: X`；任务不在 `pending` → `409 conflict`「该任务没有待验收的提交」。
- 无队长 → 400「团队没有队长，无法验收」；reviewer 非 lead → 400；**reviewer 就是 assignee** → 400「自己完成的任务不能自己验收，请移交队长」。
- **accepted**：`reviewStatus="accepted"`、`status="done"`、自动关闭非 manual 子任务、goal/progress 联动、history「X 验收通过」。
- **changes**：`reviewStatus="changes"`、`status="in_progress"`、history「X 要求返工」。

### POST /task.create（v2）
`{title(必填), goal?, acceptanceCriteria?, notes?, dueDate?, status?="backlog", priority?="P2", tags?, workspaceId?, projectId?, assigneeId?, origin?="manual", sourceSessionId?, subtasks?, artifacts?, lockedFields?}` → `{"ok":true,"task"}`

- **goal**：字符串（旧客户端）自动迁移为 `{text,status,source:"task"}`；或直接传对象 `{text ≤280, status?∈active/done/none, source?∈session/task}`（agent 传 `source:"session"`）。
- **acceptanceCriteria** ≤600：验收标准。
- **subtasks** ≤12：元素为 `{text ≤60, done?, source?∈ai/todo/manual}` 或字符串（迁移为 manual）；无效条目丢弃；返回时带服务端生成的 `id`。
- **artifacts** ≤10：`{name?, path ≤260, kind?∈deliverable/modified, time?}` 或字符串路径（name 自动取文件名）。
- **lockedFields**：仅接受 `LOCKABLE_FIELDS = [title,goal,status,progress,priority,tags,notes,subtasks,artifacts]` 内的值。
- **origin/sourceSessionId**：agent 会话挂靠（origin="session" + 会话 id ≤200）。
- 返回的 task 带 `progress`（有 subtasks 时=done 比例，否则 done→100/backlog 未设→0）与 `pinned`（默认 `false`）。
- **v0.3 验收字段**：新建任务恒为 `reviewStatus:"none"`、`reviewNote:""`（由 `/member.report`、`/member.review` 驱动）。
- 引用不存在 → 400；history 追加 `{kind:"create",note:"创建任务"}`。

### POST /task.update（v2）
`{id, title?, goal?, acceptanceCriteria?, notes?, dueDate?, status?, priority?, tags?, projectId?, assigneeId?, archived?, pinned?, subtasks?, artifacts?, lockedFields?}` → `{"ok":true,"task","changed":boolean}`

- goal 支持字符串（整体迁移）或**部分对象**（与现有 goal 合并后归一化）。
- **status→done 联动**：goal.status→"done"；非 manual 且 subtasks 未锁定的未完成子任务自动置 done（写一条 `kind:"subtask"` history「任务完成，自动关闭 N 个生成子任务」）；progress 重算。
- **v0.3 人工越权**：owner 直接把 worker 的任务改成 done，视同验收（`reviewStatus→"accepted"`、`reviewNote="人工直接完成（视同验收）"`，见 service.mjs `settleReviewOnStatus`）；状态离开 done 时 pending/accepted 会被清回 `none`。
- **v0.3 改派清验收**：`assigneeId` 变更时清空 `reviewStatus`/`reviewNote`，旧结论不跟着新负责人走。
- subtasks/artifacts 更新后 progress 自动重算（v2 contract）。
- **pinned（v2.5）**：布尔置顶标记；`pinned` 与现值不同时写 `kind:"pin"` history（「置顶任务」/「取消置顶」）并计入 `changed`；相同值不写盘。看板排序 `compareTasks` 先按 pinned 降序，再按优先级、最后按 `updatedAt` 降序。
- 有 diff 才写盘；status 变更写 `kind:"status"`（from/to），指派变更写 `kind:"assignee"`（note「指派：X → Y」），归档写 `kind:"archive"`；其余 diff 合并一条 `kind:"edit"`。
### POST /task.delete
`{id}` → `{"ok":true,"deleted":id}`（物理删除）。
### POST /task.move（v2）
`{id, status}` → `{"ok":true,"task"}`（看板拖拽专用；同状态幂等返回，不写历史）。status 非法 → 400；id 不存在 → 404。**→ done 的联动语义与 /task.update 相同**（goal/progress/自动关闭生成子任务）。

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
| 验收人=完成人、成员非队长、leadId 悬空（v0.3） | 400 | invalid-input |
| 无匹配路由 | 404 | not-found（message: `no route: GET /x`） |
| 服务端异常 | 500 | internal |
