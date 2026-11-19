# Proposal: protect-team-lead

## Why

当前队长只是「第一个成员自动推导 + 409 挡第二队长」的软约束：`/member.delete` 可以直接删掉队长，`/member.update` 可以把队长卸任成工作成员，删除后团队进入「无队长 + orphan worker」状态，只能等下一次重启靠 `settleTeam()` 自愈。团队模型（v0.3）的核心承诺是「一个队长带领多个工作 Agent」，队长应是一个恒定存在的角色，而不是可以随手清掉的数据；同时第一次安装时团队完全为空，用户必须先手工创建队长才能开始派单。

## What Changes

- **BREAKING**：`/member.delete` 拒绝删除 `kind === "lead"` 的成员（400「队长不可被删除」）。队长成为不可删除成员；其名下任务与 worker 绑定因此恒定存在。
- **BREAKING**：`/member.update` 拒绝把队长 `kind` 改为 `worker`（卸任）（400）。队长身份一经确定不可变更，仍可编辑名称、职位、人格、技能、提供方/模型等资料字段。
- 「一队一队长」唯一性约束保持不变：唯一队长不可删除/卸任后，`/member.update` 中 worker→lead 的晋升路径在 UI 上不可达（界面不再出现第二队长），服务端 409 挡板保留作为防御。
- 启动自愈 `settleTeam()` 简化为**恒定种子**：`start()` 时若 `members` 为空，自动创建一个默认队长（名称「队长」、`kind: "lead"`、role `owner`），保证任何时刻读取团队状态都有且仅有一个队长；原「全队无 lead 时提升最早成员」迁移分支保留（兼容 v0.2.7 老数据），「清理悬空 leadId」分支保留。
- 客户端团队视图适配：空态文案（「还没有队长」「团队里还没有成员…」）改为不再出现无队长场景的引导；成员弹窗在唯一队长场景下隐藏「成员类型」切换（队长恒为队长、新建成员恒为工作成员）；「队长已卸任」orphan 提示条不再出现（服务端保证不会产生 orphan）。
- 文档（docs/manual.md、api.md、domain.md、ui.md、verify.md）同步更新，CHANGELOG 记入 breaking 变更。

## Capabilities

### New Capabilities

- `team-lead-protection`: 队长角色的恒定性——不可删除、不可卸任、启动时种子默认队长，以及客户端对「无队长」状态的移除。

### Modified Capabilities

<!-- 首个 capability，暂无既有 spec -->

## Impact

- **服务端** `server/service.mjs`：`/member.delete`（约 :543）加队长守卫；`/member.update`（约 :486–532）卸任分支改为拒绝；`settleTeam()`（约 :139–166）改为「空则种子默认队长」+ 保留迁移/清理分支。
- **服务端** `server/store.mjs`：`normalizeMember`（约 :191–201）无需改动，种子队长走既有 member 结构。
- **客户端** `client.js`：团队视图空态文案（约 :3459/:3507/:3634）、成员弹窗成员类型字段（约 :4409/:4440–4445）、「队长已卸任」banner（约 :3797/:3811）。
- **测试** `tests/team.test.mjs`、`tests/service.test.mjs`：现有「删队长/卸任」用例改为断言拒绝，新增种子队长与唯一队长下的成员创建/派单/验收链路用例。
- **文档** `docs/manual.md`、`docs/api.md`、`docs/domain.md`、`docs/ui.md`、`docs/verify.md`、`CHANGELOG.md`。
- 兼容性：v0.2.7 老数据迁移路径保留（无 lead 时提升最早成员）；已有 orphan worker 在唯一队长上任时由 `adoptOrphanWorkers` 接管，不再产生新 orphan。
