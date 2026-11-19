# Design

## Context

看板服务是零构建的 DSH 插件：`index.mjs` 只做 `ownerAdmission` 与 `webServer.register` 前缀转发，状态是单个 `state.json`，所有请求都按 owner 一个身份放行。`Member` 已有 `provider/model`（空串表示继承工作区）与预留的 `sessionId`，但服务端从不创建会话；`docs/architecture.md` 决策 20 明确记录了「不接 agent」的五个理由。

宿主 DSH 0.2.2-rc.5 提供 `@deepseek-ai/dsh-agent`，已核实：

- `agents.create(CreateAgentOptions)`：`meta` 全部可选（含 `parentSession`），`agentOptions` 支持 `provider/model/reasoningEffort/maxTokens`，`setup` 可在首轮前注册工具与提示词。
- `agents.resume({ resumeSessionId, agentOptions, setup })`：从持久化会话恢复，`cwd` 等 meta 在创建时固化。
- `Agent.followup(message)` 投递消息；事件含 `agent/status`、`agent/assistant-stream`、`agent/created`、`agent/disposed`。
- 权限档存在 `read-only`、`workspace-write`、`danger-full-access` 三档。

约束：单进程、单 owner 身份，服务端无法从请求区分人/agent，因此**角色边界只能靠工具注册与工具处理函数里的二次校验**，不能靠 HTTP 身份。

## Goals / Non-Goals

**Goals:**

- 每个成员 × 工作区一个可恢复会话，派单即可执行。
- 队长会话承担澄清、计划、建卡、派单、验收。
- 派单、汇报、验收全部落在现有任务状态机上，不另造一套状态。
- agents 不可用时看板完整可用。

**Non-Goals:**

- 不做 git worktree / 分支隔离；同一工作区靠串行避让。
- 不做成员之间直接发消息，成员只通过任务字段汇报。
- 不做成员会话的独立聊天面板（v1 只读 transcript）。
- 不做无人值守轮询或自动领取任务，派单是唯一触发。
- 不接入 `@deepseek-ai/dsh-agent-team`，避免与看板团队模型双写。

## Decisions

### D1 建根会话，不挂父会话

`meta.parentSession` 可选，因此成员会话不挂在用户会话下。这样绕开 `archived-session-gate` 的子树连坐，也避免 `delegationDepth` 递归预算。备选「挂到 owner 当前会话下」被否：父会话归档会连带阻塞整棵子树，参考实现出现过 453 blocked / 0 completed。

### D2 会话按（成员 × 工作区）建

`cwd` 在 create 时固化，resume 不能改，所以不能一个成员一个会话跑多个工作区。`Member.sessions` 用 `{ [workspaceId]: sessionId }` 存，`""` 键表示未绑定工作区的任务，使用默认工作区。每成员最多 4 个，LRU 淘汰并 dispose。

### D3 工具按角色注册，处理函数再校验一次

队长在 setup 里拿到 `board_read / task_create / task_update / dispatch / review / member_list`；成员只拿到 `task_get / report / artifact_add`。成员工具的处理函数从会话上下文取 memberId，并校验目标任务 `assigneeId === memberId`，越权返回错误文本。这样即使模型被提示词诱导，也调不到建卡工具、改不了他人任务。

### D4 两个队列：工作区串行 + 成员串行

派单先把任务写成 `in_progress`，再决定投递还是排队：

- 工作区内已有 `agentState:"running"` 的任务 → 新任务 `agentState:"queued"`，不投递。
- 成员正在执行上一轮 → 简报在 agent inbox 排队（`followup` 本身会排队），任务仍是 `queued`。
- 前者结束（done/blocked/人工改状态）→ 工作区锁释放，按 `updatedAt` 取下一个 queued 投递。

队列状态落在 `Task.agentState` 上，重启可重建，不依赖内存队列。

### D5 汇报与验收复用现有状态机

成员 `report` 调用的就是 `/member.report` 背后的函数：done → `reviewStatus:"pending"` + `reviewNote`，blocked → 任务与成员受阻，progress → notes/progress。队长 `review` 复用 `/member.review` 的接受/打回分支；打回把任务置回 `in_progress` 并向原会话补投意见。人工拖拽仍走 `settleReviewOnStatus`，优先于 agent。

### D6 事件唤醒合并限流

成员 done/blocked 时向队长会话 `followup` 一条摘要；同一成员 30 秒窗口内多次事件合并成一条，progress 不唤醒。队长忙时消息进 inbox，不打断当前回合。

### D7 新增持久字段

```js
Member.sessions   // { [workspaceId]: sessionId }，≤4
Member.agentState // "" | "unavailable"（仅用于 UI 标记，不参与成员状态派生）
Task.agentSessionId // 执行会话 id，审计
Task.agentState     // "" | "queued" | "running"，离开 in_progress 时清空
```

`Member.status` 仍由任务派生，不新增第四种状态；`agentState` 只表示宿主能力是否可用。

### D8 权限与身份边界

会话权限目标为 `workspace-write`，禁止 `danger-full-access`。`pinInitialPermission` 可能把新会话钉到 profile 默认档，若不能在 create/setup 时降档，则接受默认档但显式拒绝 danger，并把「工具级校验」当作真正的安全边界（单 owner 身份下 HTTP 层无法区分人/agent）。

### D9 恢复：懒恢复 + 进行中优先

启动时只对「有 `in_progress` 任务」的成员执行 resume；其余成员在下次派单时按需 resume。resume 失败 → 新建会话、替换映射、补投进行中任务简报，并在任务 history 记「会话已重建」。这样避免启动时批量拉起所有成员。

### D10 降级

`agents` 注入缺失或 create/resume 抛错时：派单照常写 assignee + in_progress，`Member.agentState="unavailable"`，接口返回 `agent:{available:false}`；下次派单重试。不自动重试、不阻塞其他成员。

### D11 客户端流式

队长抽屉订阅插件新增的 SSE `/agent/stream?sessionId`，服务端把 `agent/assistant-stream` 事件转发为文本增量；工具调用折叠为一行状态。SSE 不可用时退回 1 秒轮询 `/agent/messages?since=`。transcript 本身来自宿主会话日志，不另存。

### D12 决策 20 改写

`architecture.md` 决策 20 从「不接 agent」改为「成员会话由插件创建、根会话、按工作区隔离」，保留原五条理由作为风险清单，并说明各自如何被规避或接受。

## Risks / Trade-offs

- [会话归档或恢复失败] → 重建并补简报；任务状态不回退。
- [agent 失控循环] → 简报要求完成后必须 report 并停止；服务端 watchdog 超时把任务置 blocked 并唤醒队长；不做自动重试。
- [重启后重复执行] → 恢复时只补投 `queued`，对 `running` 先 resume 原会话，不重复 followup。
- [同一工作区文件冲突] → 仅串行 agent 任务；人工同时编辑仍可能冲突，v1 接受。
- [tool 调用绕过 assignee 校验] → 处理函数从会话上下文取身份，不信任模型传入的 memberId。
- [会话泄漏] → 插件卸载、成员删除、LRU 淘汰三处 dispose；启动时对映射中存在但不可恢复的会话做替换。
- [成本] → 每工作区并发 1、每成员会话 ≤4、无自动重试；模型走成员画像，空则继承工作区。

## Migration Plan

- `normalizeMember` 增加 `sessions` 白名单对象（键为工作区 id，值 ≤200 字符，最多 4 个）与 `agentState` 枚举；`normalizeTask` 增加 `agentSessionId` 与 `agentState` 枚举。
- 旧数据无这些字段 → 空映射/空串，不升 `STATE_VERSION`。
- 回滚：旧版本归一化会丢弃新字段，会话映射丢失但宿主会话仍在；插件卸载会 dispose，避免残留。回滚后派单退回纯人工模式。

## Open Questions

- 工具注册与提示词注入的确切 API（setup 里通过哪个服务注册、首轮是否可见）。
- `webServer.register` 的 handler 能否持续写 SSE，还是需要轮询兜底。
- 权限档位能否在 create/setup 时降到 `workspace-write`，还是只能继承 profile 默认。
- resume 已归档会话的具体错误形态，决定重建分支的判定条件。
