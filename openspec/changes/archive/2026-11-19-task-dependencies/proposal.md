# Proposal: 任务依赖（task-dependencies）

## Why

看板目前把每张卡当成彼此孤立的任务：四列全连通，任何卡在任何时候都能被拖进「进行中」。真实工作里 B 常常必须等 A 的产出，团队只能把「等 A」写进备注，或者提前开工再返工。看板既拦不住，也提示不了。用 `blocked` 表达等待同样不可行——`blocked` 会派生成员状态、进入团队的受阻 attention，把正常等待误报成异常。

## What Changes

- 任务新增 `dependsOn`（前置任务 id 数组，≤8），指向同一看板上的其他任务卡；允许跨项目/跨工作区，但界面必须显示前置所属项目。
- 新增派生只读字段 `ready`：`dependsOn` 中每个任务都 `done` 时为 `true`。不落盘、不自动改变任何任务状态。
- **BREAKING**：前置未完成时，所有会把任务写成 `in_progress` 的入口统一返回 409，错误信息列出未完成的前置（标题 + 当前状态）：`task.create`（带 status）、`task.update`、`task.move`、`member.dispatch`、`member.report`。旧的「任意卡随时开工」行为不再成立。
- 完成（→`done`）不拦：保留「人工越权优先」的既有决策，但在 history 记一条「越权完成：前置 A 未完成」，让越权可见而不是被禁止。
- 图完整性：禁止自依赖（400）、禁止成环（409，DFS 检测）；删除任务时从其他任务的 `dependsOn` 中摘除该 id 并写入 history；加载旧数据时静默丢弃悬空 id。
- `/member.report` 放行但记账：汇报意味着活已经干完，拦下来只会让真实产出无法登记。
- 成员状态收紧：只有 `in_progress` 或 `ready` 的 `backlog` 任务算 `working`；全是等待前置任务的成员显示 `idle`（可接别的活）。团队负载新增 `waiting` 计数。
- 客户端：卡片「等待前置 N」chip、抽屉前置列表、编辑弹窗任务选择器（排除自己与会成环的候选）、拖拽前预检与 409 提示、筛选「仅看可开工」、zh/en 文案。
- 同步文档（domain / api / architecture / manual / ui / verify / CHANGELOG）与测试。

## Capabilities

### New Capabilities

- `task-dependencies`: 任务间前置关系的表示与上限；`ready` 的派生规则；进入 `in_progress` 的强制守卫与错误契约；`done` 越权完成的记录；依赖图的完整性（自依赖、成环、删除级联、迁移自愈）；等待前置对成员状态与团队负载的影响；依赖在卡片、抽屉、编辑弹窗和拖拽路径上的呈现。

### Modified Capabilities

无。`openspec/specs/` 目前为空，本变更不修改既有 capability 的需求。

## Impact

- 代码：`server/limits.mjs`、`server/store.mjs`、`server/service.mjs`、`client.js`。
- 文档：`docs/domain.md`、`docs/api.md`、`docs/architecture.md`、`docs/manual.md`、`docs/ui.md`、`docs/verify.md`、`CHANGELOG.md`。
- 测试：`tests/service.test.mjs`、`tests/team.test.mjs`、`tests/store.test.mjs`。
- 数据：`state.json` 增加 `dependsOn` 字段，向后兼容（旧数据视为 `[]`）；`STATE_VERSION` 不变。
- 调用方：所有写 `in_progress` 的 HTTP 调用方与 UI 拖拽路径都会遇到新的 409，需要展示错误而不是静默回滚。
- 与进行中的 `protect-team-lead` 无重叠：它只改成员/队长约束，不涉及任务关系。
