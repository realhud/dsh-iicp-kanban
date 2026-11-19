# Proposal: 团队成员 Agent 化

## Why

看板现在只记录任务，不执行任务：`Member.provider/model` 是画像字段，`sessionId` 是预留位，服务端从不创建会话（architecture.md 决策 20）。但团队成员本来就应该是独立 agent——队长负责澄清需求、拆解任务、派单与验收，成员在自己的会话里真正执行。把会话接上之后，看板不再只是记录工具，而是人、队长、成员三方共用的运行协议。

## What Changes

- **成员 ↔ 会话映射**：`Member.sessions` 按工作区保存 `sessionId`；首次派单时懒创建，重启时 `agents.resume`，成员删除/插件卸载/超限时 `dispose`。
- **队长会话**：聊天抽屉就是队长会话；队长先给计划，用户确认后一次性建卡并派单（计划闸门）。
- **角色工具**：队长拿到 `board_read`、`task_create`、`task_update`、`dispatch`、`review`、`member_list`；成员只拿到 `task_get`、`report`、`artifact_add`，且只能写自己名下的任务。
- **派单协议**：`dispatch` 向成员会话投递任务简报；成员忙碌时简报排队；同一 workspace 同时只允许一个 agent 任务 `in_progress`。
- **汇报与验收**：成员 `report(done)` 置 `reviewStatus=pending` 并唤醒队长（按成员合并、限流）；队长 `review` 接受或打回，人工仍可随时推翻（决策 22）。
- **权限**：队长与成员均为 `workspace-write`，不使用 `danger-full-access`。
- **降级**：`agents` 服务不可用或创建失败时，派单仍成立、任务可由人执行，看板功能不退化。
- **BREAKING**：`provider/model` 从纯画像变为真实会话路由；架构决策 20「不接 agent」被取代。此前规划的 intake 草稿与批量提交流程取消——计划留在对话里，确认后直接建卡。

## Capabilities

### New Capabilities

- `agent-sessions`: 成员与 agent 会话的身份映射、创建/恢复/销毁、工作区 cwd、模型路由、权限档位，以及 agents 不可用时的降级。
- `team-orchestration`: 队长会话的计划闸门、按角色注册的任务工具、派单简报与排队、成员汇报与队长验收、事件唤醒与工作区串行。

### Modified Capabilities

无。`task-dependencies` 的既有要求不变，本变更只在其上增加执行侧行为。

## Impact

- **server**：`index.mjs` 注入 `agents`/`sessionPersistence` 并管理句柄生命周期；`service.mjs` 新增会话管理、工具注册、dispatch/report/review 的 agent 分支；`store.mjs` 新增 `Member.sessions` 与 `Task.agentSessionId` 的归一化与迁移；`limits.mjs` 新增上限。
- **client**：队长聊天抽屉（消息流、工具调用折叠、计划确认）、成员卡上的会话状态、成员会话 transcript 查看。
- **docs**：architecture.md 决策 20 改写并新增决策；domain.md 增字段与状态；api.md 增接口与工具契约；manual/ui/verify 同步。
- **deps**：使用宿主已安装的 `@deepseek-ai/dsh-agent`，不新增第三方依赖。
- **tests**：service/team 增加会话生命周期、派单排队、汇报验收、降级路径；client 加 UI 状态。
