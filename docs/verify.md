# dsh-iicp-kanban 验收清单（verify）

> v0.4（2026-11-19）：成员模型的填写方式改为从宿主现有模型目录里选，空值 = 「继承工作区」。新增 `GET /models` 与 `tests/model-catalog.test.mjs`。

## 自动化验收

- [x] `npm test`（`node --test --test-isolation=none tests/**/*.test.mjs`）：**73 通过 / 0 失败**（store 10、auth 7、workspaces 6、service 24、team 18、**model-catalog 8**；v0.2.0 起含 v2 模型迁移与 agent 语义用例，v0.2.6 起含项目 dueDate/workspaceId 与 DSH 现行 workspace 布局用例，v0.2.7 起含项目删除历史、乐观锁、工作区唯一绑定与失效绑定自愈用例，v0.3 起含团队/派单/提交/验收/迁移用例，**v0.4 起含模型目录与「空串=继承」用例**）。
- [x] `node --check client.js` 及全部 server/*.mjs 语法通过。
- [x] store：原子写往返、损坏备份（`state.json.corrupt-*`）、迁移钳制（非法枚举/缺 id 条目丢弃/settings 白名单）。
- [x] auth：owner 放行、非 owner 403、rejection 归一化、缺 admit/抛异常/非对象返回均 fail-closed。
- [x] service：ping、404、member/task/project 全生命周期、删除级联（成员删→任务未指派+历史；项目删→任务脱钩）、workload 含未指派桶、非对象体 400。

## v2 数据模型验收（0.2.0，AI AGENT 执行语义）

- [x] **v1→v2 迁移**：字符串 goal 自动迁 `{text,status,source:"task"}`（done 任务迁 status:"done"）；字符串子任务迁 `source:"manual"`；progress 非法值钳 0-100 或 null（store 用例 ×2）。
- [x] **agent 式创建**：`origin:"session"` + `goal.source:"session"` + subtasks 2/6 完成 → task.progress=33（service 用例）。
- [x] **goal 部分对象合并**：update 只传 `{text}` 保留原 status/source（service 用例）。
- [x] **done 联动**：拖 done → 非 manual 未完成子任务自动关闭（manual 保留）、progress=50、goal.status="done"、history 出现 `kind:"subtask"`（service+冒烟双验证）。
- [x] **人工保护**：`lockedFields:["subtasks"]` 时 done 不自动关子任务；manual 子任务永不被自动关。
- [x] **上限**：subtasks >12 截断、空文本丢弃；lockedFields 非白名单项过滤。
- [x] **进程内冒烟**：`node scripts/smoke-v2.mjs` → **SMOKE-V2-PASS**（ping version=2、agent 创建 progress=33、拖 done 联动、state.json roundtrip）。

## 安装冒烟

- [x] **安装落盘**（2026-11-17 17:09 本地）：`plugin_manager install_bundle` → `application:"applied" changed:true`；操作日志 `C:\Users\Administrator\AppData\Roaming\@deepseek-ai\dsh-desktop\plugin-operations\operations.jsonl` 尾行 `target=dsh-iicp-kanban stage=enable version=0.1.0 phase=settled application=applied`。
- [x] **profile 注册**：`C:\Users\Administrator\.dsh\profiles\desktop\package.json` bundles 含 `"dsh-iicp-kanban"`（:21）、dependencies `"link:F:/realhud/dsh-iicp-kanban"`（:31）；`node_modules\dsh-iicp-kanban` 为指向工作区的符号链接（源码改动即时生效）。
- [x] **服务半边进程内冒烟**（DSH_HOME=临时目录，真实 req/res 双替身走 service.handle 全链路）：ping→`{"ok":true,plugin:"dsh-iicp-kanban"}`；task.create/member.create/task.update 指派/task.move→in_progress；GET /state → tasks[0].assigneeName="张三"、stats.byStatus.in_progress=1、history 含 status 条目；GET /member.workload → `张三:1,未指派:0`；空标题 task.create → HTTP 400 `invalid-input`；`$DSH_HOME/storages/iicp-kanban/state.json` 落盘且内容正确（**SMOKE-PASS，exit 0**）。
- [x] **路由挂载佐证**：`http://127.0.0.1:8326/iicp-kanban/api/ping`、`/super-kanban/api/ping`、`/不存在插件/api/ping`、`/` 均返回统一 HTTP 401 —— 请求进入 DSH webserver 鉴权层（owner 凭证校验前置），带浏览器 owner 会话即可透传到插件路由。
- [x] **UI 冒烟（2026-11-17 17:56 本地，桌面取证）**：发现初版 client.js 只注入 `main` slot、无侧边栏入口（旧版 super-kanban 靠 `sidebar.panellist` slot 注入侧边栏项，F:\realhud\dsh-super-kanban\client.js:8728）→ 补齐 `SidebarKanbanIcon` + `ctx.slots.inject("sidebar.panellist", …, {label: t("一体化智能协作平台"), order: 3})`（client.js:720-770），Ctrl+R 刷新后：侧边栏「全局面板」出现「一体化智能协作平台」项（三色柱状图标），点击后主区域渲染四列看板+筛选器+新建任务按钮（截图 docs/ui-smoke-panel.png、ui-smoke-toolbar.png）；端到端 UI 新建任务「冒烟验证任务」（弹窗截图 ui-smoke-modal.png / ui-smoke-modal-actions.png）→ 卡片出现在「待办」列、计数「共 1 项 未指派 1」（ui-smoke-task-created.png）；`$USERPROFILE/.dsh/storages/iicp-kanban/state.json` 落盘 tasks=1 title=冒烟验证任务 status=backlog。面板 DOM `data-plugin="iicp-kanban"`（client.js PageTeamBoard 根节点硬编码）与样式 `ensureStyle()` 的 `<style id="iicp-kanban-style">` 随面板渲染注入。
- [x] **新建任务 → 出现在「待办」列，计数徽章 +1**（UI 冒烟中实际完成，见上）。
- [x] **v2 done 联动 UI 验证（2026-11-18 08:58 本地，桌面取证）**：运行实例（DSH 2026-11-18 08:08 重启后加载 v2 服务端）编辑弹窗含全部 v2 字段（目标/验收标准 ≤600 字/子任务/交付物，截图 docs/ui-v2-modal-edit.png）；状态下拉改「已完成」→ 保存 → `state.json`：status=done、goal={"text":"v2 目标联动验证","status":"done","source":"task"}、progress=100、history 追加 kind:"status"（历史链 create→edit→status(拖拽)→status）；UI 卡片移入「已完成」列并显示 100% 进度条（截图 docs/ui-v2-done-card2.png）。

## v2.1 新建任务表单验收（0.2.1，对齐 dsh-super-kanban）

- [x] **代码与自动化**：node --check 通过；node --test 38 用例全绿；进程内冒烟 **DUE-SMOKE PASS**（dueDate create→update「编辑：到期日」history→清除→state.json roundtrip）；SMOKE-V2-PASS 无回归。
- [x] **表单渲染（2026-11-18 09:25 本地，桌面取证，截图 docs/ui-v21-newtask-modal.png）**：新建任务弹窗字段与占位符全部生效——标题 placeholder「要做什么？」、目标（可选）「这项任务要实现什么？」、验收标准（可选，≤600 字）「写下可检查的结果或验证步骤」、折叠区「▶ 项目、到期日与备注」、状态 seg 按钮组（待办 on）、优先级 seg（P2 on）、子任务 (0/0)+添加框、交付物 (0)+路径框、取消/保存（primary）。
- [x] **端到端创建（2026-11-18 09:33 本地）**：UI 填标题「到期日验证任务」→ 保存 → 卡片出现在「待办」列（P2 pill、未指派），`state.json` 落盘 t_49332002c title=到期日验证任务 status=backlog。
- [x] **布局佐证**：工具栏右侧「共 1 项 · 未指派 1」+「新建任务」按钮（全屏 UI 树 (1839,223)）确认可见；此前截图未见系 region 截图 x 上限截断，无布局 bug。
- [ ] **dueDate/tags UI 落库复核**（遗留）：桌面自动化下 Chrome 原生日期选择器「今天」按钮设值与标签输入未能稳定写入 React 受控 input（代码复核 client.js:575-704 受控组件 value+onChange 正确；服务端契约已由 DUE-SMOKE 覆盖）——人工操作验证待用户确认。

## v2.3 任务卡片验收（0.2.3，对齐 dsh-super-kanban v3 卡片）

- [x] **代码与自动化**：node --check 通过；node --test 38 用例全绿（316ms）。
- [x] **卡片结构渲染（2026-11-18 10:10 本地，桌面取证）**：待办卡片=灰点 + 13px/600 标题「到期日验证任务」+ 元信息行「未归属 · 38 分钟前」+ 右侧 `P2`，截图 docs/ui-card-v3.png、docs/ui-card-v3-zoom.png。
- [x] **摘要行与子任务计数（2026-11-18 10:14 本地）**：弹窗填验收标准「卡片需展示验收标准摘要行与子任务计数」+ 添加子任务「改造卡片结构」→ 保存 → 卡片出现该摘要行（2 行截断）与 `✓ 0/1` 计数，截图 docs/ui-card-v3-fields.png。
- [x] **勾选后进度与计数（2026-11-18 10:19 本地）**：勾选子任务 → 保存 → `state.json` progress=100、subtasks[0].done=true；卡片 `✓ 1/1` 转绿 + 底部进度条，截图 docs/ui-card-v3-progress.png。
- [x] **进行中态配色（2026-11-18 10:22 本地）**：状态 seg 切「进行中」→ 保存 → 卡片落进行中列，蓝点 + 蓝色进度条，截图 docs/ui-card-v3-inprogress.png。
- [x] **已完成态收敛（2026-11-18 10:10 本地）**：已完成卡片绿点 + 标题 500 字重 + 摘要行，隐藏指标组与进度条，截图 docs/ui-card-v3-done2.png。
- [x] **布局缺陷修复**：`.iicp-field input{width:100%}` 导致子任务 checkbox 撑满整行、弹窗出现横向滚动条 → 新增 `input[type="checkbox"]{width:auto;height:auto;padding:0;border:none}` 覆盖后布局正常，截图 docs/ui-card-v3-subtask-fixed.png / docs/ui-card-v3-checkbox2.png。

## v2.4 任务详情抽屉验收（0.2.4）

- [x] **代码与自动化**：node --check 通过；node --test 38 用例全绿（289ms，无回归）。
- [x] **单击卡片打开抽屉（2026-11-18 10:42 本地，桌面取证）**：点击「到期日验证任务」卡片 → 右侧滑出 540px 抽屉，含返回按钮、「任务详情」kicker、标题；四节齐全：任务概览（`进行中 · P2 中 · 进度 100%` + 目标/验收标准/指派给/项目/到期日/标签/备注 网格）、子任务 `1/1`「改造卡片结构」勾选态、交付物 `0`「暂无交付物」、变更历史 4 条（状态变更 / 编辑：子任务 / 编辑：验收标准、子任务 / 创建任务）+ 创建与更新时间；底部 `[打开编辑][关闭任务详情]`。截图 docs/ui-drawer-v1.png。
- [x] **抽屉内「打开编辑」**：点击后抽屉关闭、原编辑弹窗打开且字段带值（标题「到期日验证任务」、验收标准、子任务勾选、状态 seg「进行中」on、优先级 P2 on），弹窗布局与 v2.2/v2.3 一致。
- [x] **双击卡片仍走编辑弹窗**：单击/双击改用自行计时（350ms 内第二次点击=双击）后，双击卡片直接打开编辑弹窗、不先闪抽屉。
- [x] **关闭方式**：返回按钮、遮罩点击、Esc 均可关闭（Esc 用捕获阶段监听，不会冒泡到 DSH）。

## v2.5 看板对齐验收（0.2.5，对齐 dsh-super-kanban 看板与任务交互）

- [x] **代码与自动化**：`node --check client.js` SYNTAX-OK；`node --test --test-isolation=none "tests/**/*.test.mjs"` → **39/39 全绿**（318ms；新增 `task pin toggles through task.update and records history`：create `pinned=false` → update `true`（`changed=true` + history `kind:"pin"` note「置顶任务」）→ update `false`（「取消置顶」）→ 重复 `false` 时 `changed=false`）；`node scripts/smoke-v2.mjs` → **SMOKE-V2-PASS**（无回归）。
- [x] **页头 + 统计行（2026-11-18 11:30 本地，桌面取证，截图 docs/ui-v25-slimbar.png）**：`一体化智能协作平台` 20px/500 + 统计行「2 项 ● 1 进行中 ● 1 已完成」+ 右上「搜索任务」输入框与「新建任务」按钮。
- [x] **slimbar 与视图分段**：`[看板|项目|成员]` 分段按钮组（看板 on）+ 项目「全部项目」+ 指派给「全部成员」+ 计数「2 / 2」+ 右侧「筛选」（截图 docs/ui-v25-filter-dropdown.png 显示两个 select 与计数）。
- [x] **筛选浮层**：点「筛选」弹出浮层——优先级 chips（全部/P0/P1/P2/P3）、来源 chips（全部/手动/AI）、`含归档` chip、右下「清空筛选」，符合 super-kanban 的 filter popover 结构（截图 docs/ui-v25-filter-popover.png）。
- [x] **搜索过滤**：搜索框输入「冒烟」→ 计数变为「1 / 2」、仅已完成列保留「冒烟验证任务」、其余列显示空态；「筛选」按钮出现 `1` 角标；清空后恢复「2 / 2」（截图 docs/ui-v25-search.png）。
- [x] **卡片更多菜单**：卡片 hover 显现 `…` 按钮，点击弹出菜单——查看详情 / 置顶任务 / 归档任务 / 移至「待办」「进行中」「受阻」/ 删除任务（红色），当前状态不列（截图 docs/ui-v25-card-menu2.png）。
- [x] **列头操作**：每列列头右侧出现「+」（在该状态新建任务）与已完成列的「折叠已完成列」按钮（UI 树 (1487,286)/(1834,286)/(1869,286) 证实）。
- [x] **卡片点击语义**：卡片为整体可点区域，title 提示「冒烟验证任务 / 单击查看详情，双击编辑」（截图 docs/ui-v25-pinned-toast.png 的浏览器 tooltip 佐证），焦点落 `.iicp-card-open`。
- [ ] **置顶/归档/移动/删除的实际落盘复核**（遗留）：桌面自动化下点击菜单项时被用户接管或选中偏差，`state.json` 未观察到 `pinned:true`；服务端已由新增测试用例覆盖（`task.update` 传 `pinned` → 历史与 `changed` 断言），UI 层菜单项渲染已在截图中确认，端到端点击待人工复核。
- [ ] **分页（>30 条）与 toast 视觉**（遗留）：当前数据 2 条未触发分页；toast 需在真实操作成功后观察 2.6s 提示，本次未截到（点击目标被遮挡）。

## v2.6 项目模块验收（0.2.6，对齐 dsh-super-kanban 项目模块）

- [x] **代码与自动化**：`node --check client.js` 与全部 `server/*.mjs` 通过；`node --test --test-isolation=none "tests/**/*.test.mjs"` → **43/43 全绿**（新增 4 用例：项目 dueDate 合法/非法回环、workspaceId 与 archived 落盘、归档项目拒收新任务、DSH `tables.workspaces` 布局解析）；`node scripts/smoke-project.mjs` → **SMOKE-PROJECT-PASS**；`node scripts/smoke-v2.mjs` → **SMOKE-V2-PASS**（无回归）。
- [x] **工作区发现修复（2026-11-18 12:44 本地）**：DSH 现行 `workspace.json` 为 `{unit, global, tables:{workspaces:{<uuid>:{path,title}}}}`，旧解析按裸 map 会把 `unit`/`global`/`tables` 当工作区 —— `server/workspaces.mjs` 改为优先读 `tables.workspaces`；修复后项目视图「工作区项目」只显示 **default-workspace** 与 **dsh-iicp-kanban** 两张真卡片（截图 docs/ui-v26-projects6.png）。
- [x] **项目视图结构（2026-11-18 12:56 本地，桌面取证）**：引导文案 + 「工作区项目 / 按 DSH 工作区自动生成」+「自建项目 / 手动创建，可跨工作区」+「已归档项目（N）」折叠区；卡片含名称、指标行（`近期 done/total 已完成`、`N 项受阻`、`N 项逾期`、`N 项进行中`，无任务时「暂无近期任务」）、进度条、「看板」按钮（自建项目另有 编辑/归档/删除）。
- [x] **新建项目端到端**：弹窗字段 名称/备注(600)/到期日+关联工作区并排/归档 checkbox；填「项目模块验收」+ 备注「验证项目卡片指标、进度条与看板联动」+ 到期日 2026-11-21 → 保存 → `state.json` 落盘 `p_f1e2ekpf | 项目模块验收 | due=2026-11-21`，自建项目段出现卡片（截图 docs/ui-v26-project-modal.png、ui-v26-project-edit.png）。
- [x] **归档 / 恢复 / 删除**：卡片「归档」→ 移入 `▼ 已归档项目（1）`，`state.json` `archived:false → true`（截图 docs/ui-v26-project-archive-open.png）；按钮转为 看板/编辑/恢复/删除。
- [x] **看板范围联动**：自建项目卡片「看板」→ 切回看板且「项目」下拉自动选中该项目、计数 `0 / 2`、筛选角标 `1`（截图 docs/ui-v26-board-scope2.png）；工作区卡片「看板」→「工作区」下拉自动选中 `dsh-iicp-kanban`（截图 docs/ui-v26-board-ws-scope2.png、ui-v26-board-scope3.png、ui-v26-board-scope4.png）。
- [x] **服务端契约（进程内冒烟覆盖）**：workspaces 发现（title 取 registry、缺失回落 basename）、project.create 带 dueDate/workspaceId、非法日期 `2026-02-31 → ""`、任务归入项目、归档项目 task.create → 400、恢复后 delete 使任务 `projectId=""`、新实例 reload 后字段持久化。

## v0.3 团队模块验收（0.3.0，队长 + 工作成员）

### 自动化与冒烟

- [x] **代码与自动化**：`node --check client.js` / `index.mjs` / 全部 `server/*.mjs` 通过；`node --test --test-isolation=none "tests/**/*.test.mjs"` → **65/65 全绿（1108ms）**；`node scripts/smoke-team.mjs` → **SMOKE-TEAM-PASS**；`node scripts/smoke-project.mjs` → SMOKE-PROJECT-PASS；`node scripts/smoke-v2.mjs` → SMOKE-V2-PASS（无回归）。
- [x] **tests/team.test.mjs 覆盖（18 个用例）**：首个成员自动成为 lead / 已有 lead 时再建 lead → 409 / 非法 kind 与悬空 leadId → 400 / skills 先去重再截断到 8 + personality 往返 / dispatch 认领（backlog→in_progress）/ report → pending 且重复提交 409 + review accepted → done / review changes → in_progress / review 参数校验（decision 非法 400、任务不存在 404、非 pending 409、worker 当 reviewer 400）/ 不能回报他人任务 / 拖到 done 视同验收 / worker 状态派生（working→blocked→idle）/ 卸任后 orphan、新 lead 接管 / lead 不能挂靠到其他成员 / `GET /team` 聚合断言 / 删 lead 不丢工人任务 / workload 含 kind 与 reviewing / pre-0.3 数据启动时提升 lead / 旧任务 reviewStatus 默认 none。

### 服务端规则

- [x] **一队一队长**：`/member.create` 第二次 lead 返回 `409 conflict`「团队已经有队长（X），请先解除再指定新队长」。
- [x] **做的人不验收**：worker `/member.report` 后 `reviewStatus="pending"` 但 `status` 仍是 `in_progress`；只有 lead 能 `/member.review`；reviewer === assignee 时 400「自己完成的任务不能自己验收，请移交队长」。
- [x] **人工越权记账**：owner 把 worker 任务拖到 done → `reviewStatus="accepted"` + `reviewNote="人工直接完成（视同验收）"`，不留「done 但待验收」的矛盾态。
- [x] **改派清验收**：`/member.dispatch` 与 `/task.update` 改 assignee 都清空 `reviewStatus`/`reviewNote`。
- [x] **启动自愈**：pre-0.3 数据（无 kind）`start()` 后提升最早成员为 lead、清理悬空 leadId。
- [x] **删队长不连坐**：`member.delete` 只把名下 worker 的 `leadId` 置空，任务与历史保留。

### UI

- [ ] **团队视图渲染（待桌面取证）**：队长卡片（头像/名字/职位·模型/`N 门下`/人格/技能/四项指标）+ 待验收队列 + 工作成员卡片网格 + 全员明细表 7 列；空态引导文案。
- [ ] **派单端到端（待桌面取证）**：工作成员卡「派单」→ 选任务 → 卡片消失于候选列表、任务进「进行中」、成员状态转「工作中」。
- [ ] **验收端到端（待桌面取证）**：工人提交 → 队长卡「待验收」计数 +1、队列出现一行 → 点「验收」→「通过并标为完成」→ 任务进已完成列、队列清空。
- [ ] **成员弹窗新字段（待桌面取证）**：成员类型/队长/人格/技能/提供方/模型/状态七项渲染与保存；无队长时标题显示「新建成员成为队长」。

### v0.4 模型目录

- [x] **`GET /models` 契约**：缺 `llm` 服务 → HTTP 200 + `available:false` + `E_RUNTIME_UNAVAILABLE`；正常 → `providers[]`/`providerCount`/`modelCount`/`defaultModel`；单 provider `listModels` 抛错 → 该行保留且带 `error`；`listProviders` 抛错 → `E_MODEL_DIRECTORY`。
- [x] **目录清洗**：无 id 的 provider/模型被跳过；重复模型 id 去重；`name` 与 id 相同时省略 `name`。
- [x] **默认模型回落**：`currentSelection()` 返回空串/缺字段/非字符串/抛错 → `defaultModel:null`，`ok` 仍为 `true`。
- [x] **空串即继承**：`member.create`/`member.update` 传 `provider:""/.model:""` 原样存、原样取回；显式 `provider/model` 对保存与更新均不改写。
- [ ] **下拉渲染（待桌面取证）**：成员弹窗两块 `<select>` 首项「继承工作区」；切 provider 时模型按「保留 → 该 provider 默认 → 首个」顺序联动；只选模型自动补 provider。
- [ ] **目录外旧值保留（待桌面取证）**：把成员 model 改成宿主目录里不存在的 id 后重开弹窗，下拉仍选中「`<id>`（当前值不在目录里）」且保存不丢。
- [ ] **卡片副标题（待桌面取证）**：`provider/model` 都有值 → `provider/model`；都为空 → 「继承工作区」；团队视图队长卡与工作成员卡一致。
- [ ] **降级手填（待桌面取证）**：停用/未就绪 llm 服务时两块退回 `<input>`，提示「模型目录不可用可手填」，保存仍成功。
- [ ] **slimbar 文案（待桌面取证）**：第三段由「成员」变为「团队」。

### v0.5 产品名与视觉

- [x] **「新增成员」按钮尺寸（2026-11-19 本地，桌面取证，截图 docs/ui-add-member-btn-compact-v3.png）**：团队视图队长卡内按钮由全宽 31px 恢复为 26px 常规尺寸（与「编辑」按钮同规格），刷新后实测不再撑满卡片。

### v0.5 产品名（改名）

- [x] **全库口径统一（2026-11-19 本地，桌面取证，截图 docs/ui-rename-full.png、ui-rename-sidebar.png）**：`client.js` 三处（`EN_MESSAGES` 词条、`.iicp-title` 页头、`sidebar.panellist` 的 `label`）由「团队看板」改为「一体化智能协作平台」，README / `docs/manual.md` / `docs/ui.md` / `docs/verify.md` / `docs/acceptance-review-2026-11-18.md` 与 `package.json` description 同步；`rg "团队看板|团队任务看板|Team board"` 除本节改名说明外全库 0 命中；`node --check client.js` 通过，`node --test` 73/73。
- [x] **侧边栏入口渲染**：Ctrl+R 后侧边栏「全局面板」出现「一体化智能协作平台」项（三色柱状图标），9 字完整显示未省略；点击进入后页头标题同为「一体化智能协作平台」。
- [x] **英文词条**：`EN_MESSAGES` 新键映射 `Integrated Collaboration Platform`，`t()` 在英文界面取词条而非回落中文；旧键「团队看板」已无任何引用。

## 功能验收（人工走查）

- [x] 新建任务 → 出现在「待办」列，计数徽章 +1。
- [ ] 拖拽任务到「进行中」→ 列变化；任务历史含「看板拖拽：backlog → in_progress」。
- [ ] 双击卡片 → 编辑弹窗；改指派 → 历史含「指派：未指派 → X」。
- [ ] 指派给/项目筛选生效；「未指派」筛出无主任务。
- [ ] 新建成员（角色/职位/联系方式）→ 成员表格出现。（v0.3 起为团队视图的卡片网格 + 明细表）
- [ ] 删除有任务的成员 → 其任务变「未指派」，历史含「成员已移除…」。
- [x] 新建项目 → 项目卡片出现（v2.6 已由「项目模块验收」节覆盖）；删除项目 → 其任务「无项目」。
- [ ] 长标题（>80 字）输入 → 保存后截断不报错。
- [ ] 断网/后端 500 → 面板显示「加载失败: …」且轮询恢复后自动恢复。

## 数据验收

- [ ] `$DSH_HOME/storages/iicp-kanban/state.json` 存在且为合法 JSON；手工写坏它再刷新 → 备份 `.corrupt-<ts>` 生成、看板回到空态可用。
- [ ] `$DSH_HOME/storages/workspace.json` 中的工作区出现在 /state.workspaces（若该文件存在）。

## 项目模块验收复核（2026-11-18，详见 acceptance-review-2026-11-18.md）

本轮按任务卡验收条件重跑命令 + 读码 + 只读检查线上数据，不采信历史结论。

- [x] **dueDate 严格校验**：`2026-02-31` / `2026-2-3` / `20260203` / `2026-13-01` 全部回落 `""`，`2026-12-31` 与闰日 `2028-02-29` 保留（进程内脚本 6 组断言全 PASS）。
- [x] **notes 上限 600**：700 字输入落库 600。
- [x] **归档语义**：归档后 `/task.create` 与 `/task.update` 改归入均 400；项目仍在 `/state.projects`；已有任务归属保留；恢复后 `archived=false`。
- [x] **级联删除**：删项目后其全部任务 `projectId=""`，其它项目任务不受影响；重复删除 404；磁盘 `state.json` 同步。
- [x] **卡片墙 UI**：三段结构 + 卡片指标/进度条/到期日/备注/按钮（代码 `client.js:1679-1860`，截图 ui-v26-projects6.png 等 13 张）。
- [x] **自动化回归（本轮重跑）**：`node --check` 全绿；`node --test --test-isolation=none "tests/**/*.test.mjs"` → 47/47；`smoke-project.mjs` → SMOKE-PROJECT-PASS；`smoke-v2.mjs` → SMOKE-V2-PASS。
- [x] **持久化**：新实例读回 `dueDate=2028-02-29`、`notes.len=600`。
- [x] **线上数据一致性（v0.2.7 修复）**：`state.json` 中 `p_f1e2ekpf` 的脏 `workspaceId="unit"` 已由启动迁移自动清除为 `""`（2026-11-18 14:11 重载插件后实证：`ws=''`，projects/tasks 数量不变）；写路径对未知 id 返回 400 `unknown workspace`；编辑弹窗对残余失效值显式渲染「（已失效）」并提示保存后解绑。
- [x] **级联删除一致性（v0.2.7 修复）**：`project.delete` 解绑任务时写入 `kind:"project"` 历史「项目已删除，任务改为无项目（原项目：X）」并刷新 `updatedAt`；用例「project delete detaches tasks and leaves a history trail」断言 `projectId===""`、`updatedAt` 变化、history 末条 note 匹配。
- [x] **工作区唯一绑定（v0.2.7 新增，对齐 super-kanban）**：同一工作区同时只允许一个未归档项目，冲突 409；归档即让出。用例「one live project per workspace」覆盖。
- [x] **项目编辑乐观锁（v0.2.7 新增，对齐 super-kanban）**：`expectedUpdatedAt` 不符 → 409；`project.update` 无变化早返回 `changed:false` 且不推进 `updatedAt`。用例「project update honours expectedUpdatedAt (optimistic lock)」覆盖。
- [x] **失效绑定自愈（v0.2.7）**：独立 `DSH_HOME` 下写含 `workspaceId:"unit"` 的 state.json → `service.start()` 后清空；用例「stale project workspace bindings are healed on start」覆盖。
- [x] **UI 取证（v2.7）**：项目视图三段结构正常（截图 `docs/ui-v27-projects.png`）；归档项目「编辑」弹窗中「关联工作区」显示「不关联工作区」（自愈后语义正确，截图 `docs/ui-v27-project-edit.png` / `docs/ui-v27-project-edit-ws.png`）。
- [ ] **UI 侧 409 提示未截取**：唯一绑定冲突与乐观锁冲突的 alert 文案在桌面自动化下未单独取证（服务端行为由单测覆盖，客户端 `catch` 分支代码在 `client.js` ProjectModal submit 内）；需在真实多窗口场景或手工构造冲突后补一张截图。
