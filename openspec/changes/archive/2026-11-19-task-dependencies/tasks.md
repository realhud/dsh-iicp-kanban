# Tasks

## 1. 数据模型与持久化

- [x] 1.1 在 `server/limits.mjs` 增加前置上限（8）、`normalizeDependsOn`（只留字符串、去重、截断），并把 `dependsOn` 加入 `LOCKABLE_FIELDS`；验证：`tests/store.test.mjs` 中归一化用例通过
- [x] 1.2 在 `server/store.mjs` 的 `normalizeTask` 输出 `dependsOn`，并在全部任务解析完成后做一次全局 pass 丢弃悬空 id；验证：`node --test tests/store.test.mjs` 通过，且旧数据中不存在于任何任务的 id 被移除
- [x] 1.3 补 `tests/store.test.mjs`：缺字段归一为 `[]`、去重、截断到 8、悬空 id 丢弃、迁移后任务状态不变；验证：`node --test tests/store.test.mjs`

## 2. 就绪判定与图校验

- [x] 2.1 在 `server/service.mjs` 增加任务索引与 `isReady(task, byId)`（缺失前置按未完成处理），供 payload 与守卫共用；验证：`/state` 用例断言有/无前置两种情况的 `ready`
- [x] 2.2 增加图校验：自依赖 400、引用不存在 400、DFS 检测环 409（跨项目边也遍历）、菱形依赖放行；验证：`tests/service.test.mjs` 对应用例通过
- [x] 2.3 `buildStatePayload` 为每个任务附加派生 `ready`，不写入存储；验证：创建/完成前置后 GET `/state`，`ready` 翻转且 `state.json` 中无 `ready` 字段

## 3. 写入口守卫

- [x] 3.1 增加 `assertStartable(state, task, nextStatus, nextDeps?)`，409 message 列出未完成前置的「标题（状态）」，且在任何字段修改前抛错；验证：`tests/service.test.mjs` 的 409 用例在请求后 GET 任务，所有字段与请求前一致
- [x] 3.2 `/task.create` 支持 `dependsOn`；`status` 为 `in_progress` 时先校验再创建，为 `done` 时放行并写越权 history；验证：`tests/service.test.mjs` 覆盖创建即开工被拒、创建即完成留痕、合法创建
- [x] 3.3 `/task.update` 对 `dependsOn` + `status` 两阶段处理：先归一化并校验图，再用候选依赖判就绪，全部通过后提交；验证：同一请求「加已完成前置 + 开工」成功，「加未完成前置 + 开工」409 且依赖与状态都不保存
- [x] 3.4 `/task.move` 进入 `in_progress` 前调用守卫，进入 `done` 时按未就绪情况写越权 history；验证：拖入进行中 409 且列不变，拖入完成成功且有 history
- [x] 3.5 `/member.dispatch` 把守卫放在函数第一行，确保 409 时 `assigneeId` 与状态都不变；验证：`tests/team.test.mjs` 断言派单未就绪任务返回 409 且任务仍归原负责人
- [x] 3.6 `/member.report` 不拦：未就绪时仍推 `in_progress`、置 `reviewStatus=pending`，并写「提交时前置未完成」history；验证：`tests/team.test.mjs` 断言提交成功且 history 含前置标题
- [x] 3.7 `/task.delete` 从所有任务的 `dependsOn` 摘除被删 id，给被改任务写 history 并更新 `updatedAt`，依赖方状态不变；验证：`tests/service.test.mjs` 删除被依赖任务后，依赖方 `dependsOn` 不含该 id 且 history 有记录

## 4. 成员状态与团队负载

- [x] 4.1 `refreshMemberStatus` 改为「`in_progress` 或 `ready` 的 `backlog` 才算 working」，`blocked` 仍优先；给 `refreshTeam` 复用一个索引，避免逐成员重建；验证：`tests/team.test.mjs` 覆盖只有等待任务 → `idle`、可开工 backlog → `working`、受阻优先
- [x] 4.2 `buildTeamPayload` 为每个 worker 加 `waiting`（已指派、`backlog`、未就绪），团队汇总加 `waiting` 总数，`inFlight` 口径不变；验证：`tests/team.test.mjs` 断言两个等待任务时 worker 与汇总的 `waiting` 都为 1/2
- [x] 4.3 更新受影响的既有团队用例与 fixture（原先「只有 backlog 即 working」的假设）；验证：`npm test` 全部通过

## 5. 客户端呈现

- [x] 5.1 在 `client.js` 增加依赖相关 zh/en 文案与共用小函数（未完成前置计数、前置状态标签）；验证：切到英文后新增文案无中文残留、无缺键
- [x] 5.2 卡片显示「等待前置 N」chip；任务抽屉列出前置的标题、状态、所属项目（跨项目才显示项目名）；验证：按 `docs/verify.md` 重启插件，用一张有 2 个未完成前置的卡检查
- [x] 5.3 编辑弹窗增加前置选择器，候选排除自身、已选中的与会成环的任务；验证：手动选择一个会成环的候选，确认不出现在列表里
- [x] 5.4 拖动前本地预检未就绪任务；服务端 409 时回滚乐观更新并 toast 服务端 message；验证：拖未就绪卡到「进行中」，卡回到原列且提示含前置标题
- [x] 5.5 增加「仅看可开工」筛选（客户端状态，不持久化）；验证：开启后未就绪任务从看板与列表消失，关闭后恢复

## 6. 文档与集成验证

- [x] 6.1 更新 `docs/domain.md`（字段、就绪规则、不变量）、`docs/api.md`（`dependsOn`、`ready`、四个 409 入口与 report 例外）、`docs/architecture.md`（依赖决策与理由）；验证：文档中的路由与错误码能在代码中逐一找到
- [x] 6.2 更新 `docs/manual.md`（怎么加前置、等待与越权完成）、`docs/ui.md`（chip/抽屉/选择器/筛选）、`docs/verify.md`（新增手动检查步骤）；验证：按 `docs/verify.md` 从空白状态走一遍流程不卡住
- [x] 6.3 在 `CHANGELOG.md` 的「未发布」节新增「任务依赖」小节，不改版本号；验证：顶部小节同时包含 v0.5 队长恒定与任务依赖
- [ ] 6.4 全量回归：`npm test` 通过；重启插件后按 `docs/verify.md` 完成一次「建前置 → 被拦 → 完成前置 → 开工 → 拖完成」的端到端检查

## Workflow follow-up

- 实现与手动验证完成后再归档本变更。
- 归档时把 `specs/task-dependencies/spec.md` 同步进主 specs，并确认 `openspec validate` 通过。
