# Tasks

## 1. 基础与 Spike

- [ ] 1.1 跑通四个 spike：setup 内注册工具并确认首轮可见、SSE 经 `webServer.register` 持续写出、会话权限降/锁到 `workspace-write`、resume 已归档会话的错误形态；每个 spike 留下可复现脚本或日志，结论补进 design.md 的 Open Questions
- [x] 1.2 惰性解析 `agents`（不进 `ctx.inject`，避免宿主缺服务时整个插件不加载；cordis 没有可选依赖），卸载时 dispose 所有句柄；验证：加载/卸载日志无报错，重复加载不泄漏句柄
- [x] 1.3 `store.mjs` 归一化新字段：`Member.sessions`（工作区 id → ≤200 字符，最多 4 个）、`Member.agentState`、`Task.agentSessionId`、`Task.agentState`；验证：store 测试覆盖缺省、非法值、超限截断、旧数据迁移
- [x] 1.4 `limits.mjs` 增加 `sessionsPerMember=4` 与 `agentState` 枚举；验证：limits 单测与 service 引用处编译通过
- [x] 1.5 `docs/domain.md` 补 `Member.sessions/agentState` 与 `Task.agentSessionId/agentState`；验证：字段表与 store 归一化一致

## 2. 会话生命周期

- [x] 2.1 实现 `ensureSession(member, workspaceId)`：按映射复用，缺失时 create（cwd=工作区路径、成员 provider/model、空则继承、权限 workspace-write、不设 parentSession），失败时 resume，仍失败则重建；验证：注入假 agents 服务的单测覆盖 create/resume/rebuild 三条路径
- [x] 2.2 实现销毁：删除成员、成员归档、插件卸载、LRU 淘汰四处 dispose 并清映射；验证：单测断言 dispose 调用次数与映射状态
- [x] 2.3 启动恢复：对有 `in_progress` 任务的成员 resume，失败则重建并补投简报、写 history「会话已重建」；验证：team 测试用预置 state 模拟重启
- [x] 2.4 降级：`agents` 缺失或 create/resume 抛错时派单仍成功、成员 `agentState="unavailable"`、返回 `agent.available=false`；验证：单测断言任务已指派且接口 ok
- [x] 2.5 `docs/api.md` 补会话字段、`/team` 的 agent 状态与降级返回；验证：接口示例与实现字段逐一对照

## 3. 工具与角色

- [x] 3.1 在会话 setup 中按角色注册工具：队长 6 个、成员 3 个；验证：集成测试列出两会话的实际工具名，成员侧不含建卡/派单/验收
- [x] 3.2 实现 `board_read` 与 `member_list`：压缩字段、按项目/状态过滤、硬上限；验证：单测断言输出字段与截断行为
- [x] 3.3 实现队长工具 `task_create/task_update/dispatch/review`，复用现有 service 函数与校验；验证：service 测试覆盖成功、400、409 与 history
- [x] 3.4 实现成员工具 `task_get/report/artifact_add`，从会话上下文取 memberId 并校验 `assigneeId`；验证：越权访问他人任务被拒、任务不变
- [x] 3.5 会话提示词：角色、计划闸门、简报字段、完成后必须 report 并停止、不得操作他人任务；验证：首轮 transcript 含提示词段，且工具调用受角色限制

## 4. 派单与队列

- [x] 4.1 派单主流程：`assertStartable` → 确保会话 → 写 assignee/`in_progress`/`agentSessionId` → 投递或排队；验证：测试覆盖前置未完成 409 且不写 assigneeId、成功派单、降级派单
- [x] 4.2 工作区串行与成员串行：已有 `agentState="running"` 时新任务置 `queued`，结束后按 `updatedAt` 取下一个投递；验证：两个任务同工作区的顺序测试
- [ ] 4.3 重启队列重建：`running` 先 resume 不重复投递，`queued` 继续排队；验证：预置 state + 重启测试断言 followup 次数
- [x] 4.4 看门狗：任务执行超过阈值未汇报 → 置 blocked、写 history、唤醒队长；验证：可注入时钟的单测
- [x] 4.5 `docs/api.md` 与 `docs/manual.md` 补派单/排队/串行/降级行为；验证：文档步骤与接口字段一致

## 5. 汇报、验收与唤醒

- [x] 5.1 `report` 工具复用 `/member.report` 逻辑并写 `agentSessionId`/history；验证：progress/blocked/done 三类测试
- [x] 5.2 done → `reviewStatus=pending` + `reviewNote`，唤醒队长；同一成员 30 秒窗口合并、progress 不唤醒；验证：限流窗口测试断言 followup 次数
- [x] 5.3 队长 `review`：accept 置 accepted，changes 置回 `in_progress` 并向原会话补投意见；验证：两条分支的服务测试与 followup 内容断言
- [x] 5.4 人工优先：人工拖 done 仍走 `settleReviewOnStatus`，覆盖 pending；验证：既有测试保持通过并新增覆盖
- [x] 5.5 `docs/domain.md`、`docs/api.md`、`docs/architecture.md`（决策 20 改写 + 新决策）同步；验证：与 spec 的 scenario 逐条对照

## 6. 客户端

- [ ] 6.1 队长抽屉：消息流、流式增量、工具调用折叠、SSE 不可用时 1 秒轮询兜底；验证：`node --check client.js` + 手动打开/重连
- [x] 6.2 计划确认：计划消息附「执行」操作，确认前不建卡；验证：手动走一遍计划 → 执行 → 卡片出现
- [x] 6.3 成员卡：agent 状态徽标（可用/不可用/排队/执行中）与 transcript 只读查看；验证：手动检查三种状态与刷新
- [x] 6.4 i18n 与样式：中英词条、抽屉布局、状态色；验证：中英切换无缺失键
- [x] 6.5 `docs/ui.md` 与 `docs/manual.md` 补抽屉、成员状态、计划确认；验证：文档描述与界面一致

## 7. 集成与验收

- [x] 7.1 全量 `npm test`：新增用例全绿；`tests/workspaces.test.mjs:32` 为既有 POSIX 环境失败，需在结果中注明；验证：命令输出
- [x] 7.2 端到端 smoke：预置队长与成员 → 队长计划 → 确认 → 建卡派单 → 成员 report done → 队长 review；验证：脚本输出 `AGENT-SMOKE-PASS`
- [x] 7.3 `docs/verify.md` 增「Agent 团队」验收节、`CHANGELOG.md` 未发布条目；验证：文档含可勾选项与命令
- [ ] 7.4 桌面走查：重启插件验证恢复、拔掉 agents 服务验证降级、人工拖 done 验证优先；验证：verify.md 勾选

## Workflow follow-up

- 全部任务完成后运行 `openspec validate "agent-team" --strict` 并归档。
- 归档前把 `specs/agent-sessions` 与 `specs/team-orchestration` 同步进主 specs。
