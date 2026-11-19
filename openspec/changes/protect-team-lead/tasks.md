# Tasks

## 1. 服务端：队长保护守卫

- [x] 1.1 `/member.delete`（server/service.mjs:543）删除前检查 `removed.kind === "lead"` → `badRequest("队长不可被删除")`；补 `tests/team.test.mjs` 用例：删队长返回 400、成员仍在、任务与 worker 绑定不变；删 worker 用例保持通过。验证：`node --test tests/team.test.mjs`。
- [x] 1.2 `/member.update` 卸任分支（server/service.mjs:522–528 `body.kind === "worker" && member.kind === "lead"`）改为 `badRequest("队长不可被卸任")`；队长资料字段编辑（不传 kind）保持 200；改测试 `tests/team.test.mjs:297` 原卸任用例为断言 400。验证：`node --test tests/team.test.mjs`。
- [x] 1.3 确认 worker→lead 晋升 409 挡板（service.mjs:514–518）与 `/member.create` kind 推导（service.mjs:451）行为不变；补一个「唯一队长存在时显式建/升第二队长 → 409」的回归断言（若已有则跳过）。验证：`node --test tests/team.test.mjs`。

## 2. 服务端：启动种子默认队长

- [x] 2.1 `settleTeam()`（server/service.mjs:139–166）加种子分支：`members.length === 0` 时 push 默认队长（名称「队长」、`kind: "lead"`、`role: "owner"`、`leadId: ""`、画像字段空串、`createdAt/updatedAt = now()`），记 dirty 并打日志；分支顺序：种子 → 提升最早成员 → 清悬空 leadId。验证：新增用例——空 state 启动后 `GET /team` 返回队长「队长」，`tests/team.test.mjs` 通过。
- [x] 2.2 补种子幂等/共存用例：已有队长时启动不重复种子；已有成员无 lead（v0.2.7 老数据）走提升分支不种子。验证：`node --test tests/service.test.mjs tests/team.test.mjs`。
- [x] 2.3 冒烟脚本 `scripts/smoke-team.mjs` 增加空安装 → 自动出现队长 → 新建成员默认挂队长名下（kind=worker）链路。验证：`node scripts/smoke-team.mjs`。

## 3. 客户端：移除无队长 UI 分支

- [x] 3.1 成员弹窗（client.js:4409 起）：移除「成员类型」字段与「新建成员成为队长」标题逻辑，标题固定「新建成员/编辑」；确认保存 payload 不再传 `kind`。验证：`scripts/smoke-v2.mjs` 冒烟 + 浏览器打开团队视图人工确认。
- [x] 3.2 团队视图：移除「还没有队长」空态（client.js:3459/3634）、「团队里还没有成员…第一个成员自动成为队长」文案（client.js:195/3507，改为不提队长的新空态或直接渲染队长卡）、「队长已卸任」banner（client.js:235/3797/3811）；同步清理 `t()` 翻译表失效键（client.js:183–236）。验证：团队视图渲染无残留文案，`node --test` 全量通过。
- [x] 3.3 队长卡删除入口防护：队长卡不渲染删除按钮（若明细弹窗行内删除对 lead 可见则对 lead 隐藏），删除确认文案保持仅对 worker。验证：浏览器人工确认 + 人工调用 `/member.delete` 得 400。
- [x] 3.4 清理对应失效 CSS 类（`.iicp-team-banner` 等，若不再使用）。验证：样式无死代码，页面无视觉回归。

## 4. 文档与版本

- [x] 4.1 `docs/api.md`：`/member.delete`、`/member.update` 增补 400「队长不可被删除/卸任」错误行与版本标注；错误码表更新。验证：文档与实测响应一致。
- [x] 4.2 `docs/domain.md`：Member 不变式增补「队长不可删除/卸任、启动种子」；`docs/architecture.md` 决策 24 追加新决策编号记录本变更取舍。验证：与代码行为一致。
- [x] 4.3 `docs/manual.md` 与 `docs/ui.md`：开箱自带队长、成员弹窗字段变化、无队长文案移除的说明更新。验证：对照界面走查。
- [x] 4.4 `docs/verify.md` 新增验收清单（删队长 400 / 卸任 400 / 空安装种子 / 唯一队长下建成员为 worker）；`CHANGELOG.md` 顶部记 breaking 变更。验证：清单逐项可执行。

## 5. 集成验证

- [x] 5.1 全量 `node --test`（tests/ 全部测试文件）通过；`scripts/smoke-team.mjs`、`scripts/smoke-v2.mjs` 通过。验证：退出码 0。
- [ ] 5.2 桌面端到端走查：空安装 → 团队视图出现种子队长卡 → 新建工作成员 → 派单/提交/验收链路不受影响。验证：docs/verify.md 新清单逐项勾选。
