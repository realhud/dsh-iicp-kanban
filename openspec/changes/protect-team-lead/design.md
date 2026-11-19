# Design: protect-team-lead

## Context

队长当前是「写路径软约束 + 读路径宽容」的模型（docs/architecture.md 决策 23/24）：`/member.create`、`/member.update` 挡第二队长（409），但 `/member.delete` 可删队长、`/member.update` 可卸任（lead→worker），删除/卸任后团队进入 orphan 状态，靠 `start()` 时的 `settleTeam()`（server/service.mjs:139）在下次重启自愈——运行期间团队可以长期处于「无队长」状态。`/member.create` 在无队长时把第一个成员推导为 lead（service.mjs:451），全新安装的团队在用户手工建成员前完全为空。

用户已确认（2026-11-19）：同时禁止删除与卸任；种子采用「启动时 members 为空即自动创建默认队长」（不仅限全新安装，已有数据的空成员团队也补种）。

## Goals / Non-Goals

**Goals:**
- 队长成为恒定角色：不可删除、不可卸任，服务端强制。
- 任何时刻读取团队状态都有唯一队长（启动种子保证）。
- 客户端移除所有「无队长」分支 UI，成员弹窗简化为固定工作成员。
- 保持 v0.2.7 老数据迁移路径（无 lead 时提升最早成员）不回退。

**Non-Goals:**
- 不改变「一队一队长」唯一性模型本身（仍单队长）。
- 不做队长「转让/换人」功能（升级或重装之外的队长变更不在本变更范围）。
- 不接 DSH agents/subagents 真实 spawn（保持决策 20 的边界）。
- 不改 worker 的删除/编辑语义。

## Decisions

1. **删除与卸任都在服务端硬拒绝（400），而非静默忽略或级联。**
   静默忽略会让用户以为操作成功；级联删团队违背「保数据」的既有决策 24。错误信息用中文业务文案「队长不可被删除」「队长不可被卸任」，与既有 409「团队已经有队长（X）…」风格一致。客户端删除按钮对队长直接隐藏，形成双层防护。

2. **种子放在 `settleTeam()` 内、以「members 为空」为条件，而非只在首次安装写盘时注入。**
   `settleTeam()` 已在 `start()` 时运行（service.mjs:1078），且已有「提升最早成员」与「清理悬空 leadId」两个自愈分支；把种子作为第三个分支（`members.length === 0` → push 默认队长）复用同一入口与 dirty 标记，不新增启动阶段。种子队长字段复用 `normalizeMember` 的结构（id `m` 前缀、`createdAt = now()`、`role: "owner"`、画像字段空串）。用户选择的语义是「启动时自动种子」，即每次启动检查、空则补，不只第一次安装。

3. **种子队长的名称用「队长」，role 用 `owner`。**
   与默认任务指派（settings.defaultAssigneeId）和 owner 凭证语义对齐；名称可被用户后续编辑（资料字段仍开放编辑）。备选「首次建成员时引导命名」被否：用户要求开箱即有队长。

4. **`/member.create` 的 kind 推导保留，但实际永远产出 `worker`。**
   种子后 `findLead(state)` 恒非空，`existingLead ? "worker" : "lead"`（service.mjs:451）自然走 worker 分支；显式传 `kind: "lead"` 仍被 409 挡住。这行代码不改，行为由种子保证——比删掉推导逻辑更稳（若种子失败，仍有兜底语义）。

5. **客户端删减「无队长」UI 分支而不是加判断。**
   成员弹窗移除「成员类型」select（client.js:4409 附近标题逻辑「新建成员成为队长」随之消失，固定「新建成员」）；服务端保证新成员恒为 worker 并自动挂靠现任队长（既有 requestedLeadId 默认逻辑，service.mjs:457）。`client.js:3797/:3811` 的「队长已卸任」banner、`client.js:3459/:3507/:3634` 的无队长空态文案移除。CSS 对应类清理。

6. **文档按 MEMORY.md 约定的六分册同步。**
   manual.md（用户操作：队长不可删/卸任、开箱自带队长）、api.md（`/member.delete`、`/member.update` 400 语义）、domain.md（Member 状态机与不变式）、ui.md（弹窗与视图变化）、verify.md（新增验收项），CHANGELOG 记 breaking。

## Risks / Trade-offs

- [用户误以为可以换队长，发现既不能删也不能卸任后没有出口] → 文案与文档明确「队长不可变更」；若未来需要换人，需新的变更（如「转让」接口）。
- [种子队长占用了「第一个成员成为队长」的隐含预期，用户首次建成员发现自己是 worker 而非队长] → 团队视图首屏即显示种子队长卡，弹窗标题不再暗示「第一个成员成为队长」；manual.md 明确说明。
- [v0.2.7 老数据（有成员无 lead）与种子分支叠加] → `settleTeam()` 分支顺序：先种子（空则补），再迁移提升，再清悬空 leadId；三个分支互斥/幂等，`node --test` 全量回归。
- [客户端仍缓存旧 bundle 引用被删文案] → 删除分支时同步清理 `t()` 翻译表中失效键（client.js:183–236 一带），避免死键。
- [BREAKING：依赖「可删队长重建团队」的自动化脚本会开始收到 400] → api.md 错误码表标注 v0.3.x 起生效；CHANGELOG 顶部标注。

## Migration Plan

单插件升级，无独立部署步骤：实现后跑 `node --test`（tests/team.test.mjs、tests/service.test.mjs 全绿）+ `scripts/smoke-team.mjs` 冒烟；老 state.json 无需手工迁移（种子/提升/清悬空三分支在启动时幂等处理）。回滚 = 回退插件版本，state.json 中被种子出的队长成员在旧版本下表现为普通成员（kind 字段被旧 normalizeMember 容忍），无锁死风险。
