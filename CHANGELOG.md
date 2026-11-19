# Changelog

## 未发布

**队长恒定：不可删除、不可卸任，空队自动种子（breaking）**：队长从「可换的职务」变为团队的恒定角色，换队长路径整体关闭——

- **服务端守卫**：`/member.delete` 删 lead → `400`「队长不可被删除」；`/member.update` lead→worker（卸任）→ `400`「队长不可被卸任」。两个操作从「无破坏换人」变为领域不变量违例（`server/service.mjs`；取代 v0.3 决策 24 的「删队长不级联删工人 / 卸任不连坐」语义）。队长资料字段（名称/职位/人格/技能/模型等）仍可正常编辑；worker→lead 晋升与建队长的 409 挡板保持不变。
- **启动种子**：成员表为空时 `settleTeam()` 自动创建默认队长「队长」（`kind:"lead"`、`role:"owner"`、画像字段空串），分支顺序：种子 → 提升最早成员（v0.2.7 老数据迁移）→ 清悬空 leadId；`/member.create` 的 kind 推导保留作兜底，正常安装下恒得到 worker。
- **客户端删分支**：成员弹窗移除「成员类型」下拉与「新建成员成为队长」标题；团队视图移除「还没有队长」空态、「团队里还没有成员…」引导、「队长已卸任」标注、orphan 提示条（`.iicp-team-banner`）与 `.is-orphan` 琥珀描边；全员明细表队长行不再渲染删除按钮，与服务端守卫构成双层防护。
- **测试** 73→**75/75**（`tests/team.test.mjs` 重写团队生命周期用例：种子、删/卸任 400、资料可编辑、新成员挂种子队长；`tests/service.test.mjs` 补 `start()` 调用对齐生产语义；`scripts/smoke-team.mjs` 增加空安装种子链路）。
- **文档**：`docs/api.md`（400 错误行与错误码表）、`docs/domain.md`（不变量 11「每队恰一名队长」）、`docs/architecture.md`（决策 28）、`docs/manual.md`、`docs/ui.md`、`docs/verify.md`（新增 v0.5 队长恒定验收节）。

**「新增成员」按钮恢复正常尺寸**：队长卡内的该按钮此前被 `.iicp-team-lead-add .iicp-btn` 的 `flex:1` 拉成全宽、31px 高（v0.3 移入队长卡时的旧设计）；现改为与卡内「编辑」按钮同规格（26px 高、`padding:0 9px`、11px 字号、去掉字距拉伸），不再横向撑满卡片（client.js `.iicp-board .iicp-team-lead-add .iicp-btn`）。

**产品名统一为「一体化智能协作平台」**：侧边栏入口文案（`client.js` 的 `sidebar.panellist` `label`）、主区域页头标题（`.iicp-title`）与 `EN_MESSAGES` 词条（新键 `一体化智能协作平台: "Integrated Collaboration Platform"`）一并改名，不再使用旧名「团队看板」；README / `docs/manual.md` / `docs/ui.md` / `docs/verify.md` / `docs/acceptance-review-2026-11-18.md` 与 `package.json` 的 description 同步统一口径。英文词条改为显式映射，英文界面不会回落显示中文。

看板、项目、团队三个视图与任务抽屉/弹窗统一换成「深空 HUD」视觉：深海军蓝网格背景、青色全息描边与辉光、深色玻璃列面板/任务卡/项目卡、青蓝渐变主按钮与进度条；状态色统一为待办灰蓝 / 进行中青 / 受阻粉 / 已完成绿，成员状态「空闲 / 工作中 / 受阻中」黄/绿/粉。团队视图保留 `SQUAD STATUS` 总览 + CSS 雷达、四列成员卡与发光连接线，并把队长卡里的四项任务指标抽成左侧「任务总监」面板（`TASK FLOW` 占比条 + 任务总数/已完成），队长卡居中，形成「任务总监 / 队长 / 团队总览」三栏指挥区；`≤840px` 时按队长 → 任务总监 → 团队总览堆叠。「新增成员」从顶栏移到队长卡内、原任务指标位置，改为全宽主按钮；「全部成员」明细表改为团队总览右上角按钮打开的 `.iicp-roster-modal` 弹窗（横向可滚动，保留编辑/删除）。响应式：`≤980px` 隐藏工具栏装饰字，`≤760px` 看板列改为 236px 横向滚动。

成员模型的填写方式改为**从宿主已有的模型目录里选**，默认「继承工作区」：

- **新增 `GET /models`**（`server/model-catalog.mjs`）：从 DSH 活着的 `llm` 服务枚举 `listProviders()` + 逐个 `listModels(id)`，并带上 `agentDefaultModel.currentSelection()` 作为宿主默认模型。**不塞进 `/state`**——`/state` 被客户端 8s 轮询，把目录放进去等于每 8 秒枚举一遍适配器；客户端只在打开成员弹窗时取一次。`llm` 未挂载时返回 `ok:true, available:false`（**不是 HTTP 错误**），表单退回手填；单个 provider 枚举失败仍保留该行并附 `error`，否则成员上已有的 model id 会被静默改写。
- **提供方/模型两个自由文本输入换成 select**：首项空值文案「继承工作区」，副标题随宿主默认模型显示为「跟随工作区默认模型 · provider/model」。选 provider 时若当前 model 仍属于它则保留，否则优先取该 provider 的宿主默认模型、再退首个模型；只选 model 而 provider 为空时自动补上归属 provider，保证存下来的一定是真实路由。
- **不在目录里的旧值不静默清空**：provider/model 已从宿主目录消失时，下拉里 unshift 一条「`<id>`（当前值不在目录里）」并保持选中——本机存量数据里就有 `deepseek/deepseek-v4.1-flash` 这种目录外历史值。
- **空串 = 继承工作区，不是「未配置」**：服务端不校验白名单，`""` 原样存；队长卡与工作成员卡副标题在 model/provider 都为空时显示「继承工作区」，否则「继承」和「从没配过」在界面上无法区分。
- **测试** 65→**73/73**（新增 `tests/model-catalog.test.mjs` 8 例：缺 llm 降级、目录枚举与默认模型、单 provider 失败保留、跳过非法行、`listProviders` 抛错、非法默认选择回落 null、空串往返、显式值更新）；`tests/team.test.mjs` 的 `withService` 增加可选 `ctx` 注入以便驱动假 llm 服务。
- **文档**：`docs/api.md`（`GET /models` 契约与三条降级语义）、`docs/domain.md`（provider/model 的「空 = 继承」语义）、`docs/ui.md`（成员弹窗字段表与副标题）、`docs/manual.md`（怎么选模型）、`docs/verify.md`（新增 v0.4 验收项）、`docs/architecture.md`（决策 27：为什么单独开接口 + 为什么留空表示继承）。

## 0.3.0 — 2026-11-18

成员模块从「一张成员表」升级为**一个队长 Agent 带领多个工作 Agent**的团队模型：队长派单、工作成员提交、队长验收，做的人不能验收自己的活。参考 `Contexera/dsh-agent-team` 的团队语义（Lead / Worker / 做的人不验收 / 账本化），但**不接 DSH 的 agents/subagents 服务**——协作规则全部落在本地原子写的 `state.json` 上。

- **成员模型扩展**：`Member` 新增 `kind`（`lead`/`worker`）、`leadId`、`personality`(≤200)、`skills`(≤8×20，先去重再截断)、`provider`/`model`(≤60)、`status`（`idle`/`working`/`blocked`）、`sessionId`。迁移缺省 `kind="worker"`，其余为空。
- **任务验收字段**：`Task` 新增 `reviewStatus`（`none`/`pending`/`accepted`/`changes`）与 `reviewNote`(≤160)，旧任务迁移为 `none`。
- **一队一队长**：第一个成员自动成为 lead；已有 lead 时再建 lead → 409「团队已经有队长（X），请先解除再指定新队长」。新 lead 上任自动接管所有 orphan worker；lead 卸任只清空名下 worker 的 `leadId`，不删人也不解绑任务；删 lead 同理。
- **派单 / 提交 / 验收**：新增 `POST /member.dispatch`（指派+认领，backlog→in_progress）、`POST /member.report`（worker 提交 → `reviewStatus="pending"`，**状态列不动**）、`POST /member.review`（lead 判定：`accepted` → done + 自动关闭非 manual 子任务；`changes` → in_progress + 返工意见）。三条硬校验挡在服务端：reviewer 必须是 lead、任务必须 pending、**reviewer 不能是 assignee**。
- **人工越权记账**：owner 直接把 worker 任务拖到 done 视同验收，`settleReviewOnStatus` 补记 `reviewStatus="accepted"` + 「人工直接完成（视同验收）」，避免界面出现「done 但卡在待验收」的矛盾态。
- **成员状态派生**：worker 的 `status` 在每次任务写操作后由 `refreshMemberStatus` 重算（有 blocked→blocked；有 backlog/in_progress→working；否则 idle）；lead 允许手工设置。
- **启动自愈**：`settleTeam()` 在 `start()` 时若全队无 lead，把 `createdAt` 最早的成员提升为 lead，并清理指向已删 lead 的悬空 `leadId`——v0.2.7 老数据升级后不会是「没有队长的死队」。
- **团队聚合**：新增 `GET /team`，`/state` 末尾也带 `team` 字段：`lead`（含 `workerCount`）/`workers`（含 `taskTotal`/`inFlight`/`blocked`/`awaitingReview`/`orphan`）/`pendingReviews`/`unassigned`/`blocked`/`inFlight`/`orphanWorkers`。客户端不再自己算指标。
- **客户端团队视图**：成员视图重写为「队长卡片 + 待验收队列 + 工作成员卡片网格 + 全员明细表 7 列」，新增 `DispatchModal`（派单）与 `ReviewModal`（验收）、`MemberAvatar`/`MemberStatusTag` 子组件、约 40 条 `.iicp-team*` 样式；slimbar 第三段文案「成员」→「团队」（视图 key 仍是 `members`）。
- **成员弹窗扩展**：成员类型 / 队长归属 / 人格 / 技能 / 提供方 / 模型 / 成员状态七个字段，补齐 saving 态与失败 alert（对齐项目弹窗）；无队长时标题显示「新建成员成为队长」。
- **修复**：`task.update` 改指派时 history 的 `from` 误用改后值（历史里显示「X → X」），改用 `previousId` 保存改前值；改派同时清空 `reviewStatus`/`reviewNote`，旧结论不跟着新负责人走。
- **修复**：`normalizeSkills` 先截断后去重，重复技能会白白占名额；改为先去重再 `slice(0, 8)`。
- **测试** 47→**65/65**（新增 `tests/team.test.mjs` 18 个用例，自带每个用例独立 `DSH_HOME` 的夹具）；新增 `scripts/smoke-team.mjs` → **SMOKE-TEAM-PASS**；`SMOKE-PROJECT-PASS` / `SMOKE-V2-PASS` 无回归。
- **文档**：`docs/domain.md`（Member 全字段表、Task 验收字段、团队协作语义表、reviewStatus 状态机、不变量 9-10）、`docs/api.md`（`/team`、`member.dispatch|report|review`、扩展的 member.create/update、错误码）、`docs/architecture.md`（决策 20-26，「为什么不做真实 spawn」边界表）、`docs/ui.md`（团队视图节重写、成员弹窗字段）、`docs/manual.md`（团队怎么用五步 + 已知边界改 v0.3）、`docs/verify.md`（v0.3 节，UI 待取证项如实标 `[ ]`）。
- **边界**：`provider`/`model`/`sessionId` 目前是画像与预留字段，**不会真的拉起 AI 会话**；理由见 `docs/architecture.md`「为什么不做真实 spawn」。

## 0.2.7 — 2026-11-18

修复验收复核发现的两项缺陷，并补齐与 dsh-super-kanban 的两项项目能力（工作区唯一绑定、乐观锁）。

- **修复：项目 `workspaceId` 脏值自愈**（验收复核 §3.1）。成因是 v2.6 的工作区解析修复只改了读取侧——旧解析曾把 `workspace.json` 顶层的 `unit`/`global`/`tables` 当工作区，落盘的项目仍带着 `"unit"` 这类失效 id。v2.7 三条路径补齐：`service.start()` 里 `migrateWorkspaceBindings` 清掉解析不到的绑定并写 warn 日志 + 落盘；写路径 `normalizeWorkspaceBinding` 遇到未知 id 返回 400 `unknown workspace`；编辑弹窗把不在选项里的值显式渲染成「`<id>`（已失效）」并提示「该工作区已不在 DSH 中，保存后会解除绑定」。**工作区发现返回空集时三者一律放行/不动**，避免 workspace.json 缺失时误清数据。
- **修复：项目删除的级联不写历史**（验收复核 §3.2）。`project.delete` 解绑任务时现在写 `kind:"project"` 历史「项目已删除，任务改为无项目（原项目：X）」并刷新 `updatedAt`，与 `member.delete` 对齐；此前任务详情抽屉里看不到归属消失的原因。
- **新增：同一工作区唯一绑定**（对齐 super-kanban `duplicateBinding`）。`project.create`/`project.update` 在项目**未归档**时校验该工作区是否已被别的未归档项目占用，冲突返回 409；归档即让出绑定。
- **新增：项目编辑乐观锁**。`/project.update` 接受可选 `expectedUpdatedAt`，与当前 `updatedAt` 不符则 409「项目已被其他窗口修改，请刷新后重试」；客户端编辑弹窗自动带上该版本号，冲突时 alert 并重新拉取最新数据。同时 `project.update` 增加「无变化早返回」（`changed:false`，不刷新 `updatedAt`），避免空保存把其他窗口变成 stale。
- **测试** 43→**47/47**（新增：删除项目写历史并刷新 `updatedAt`、`expectedUpdatedAt` 乐观锁与无变化早返回、一工作区一项目与归档让出、启动时清理失效绑定 + 未知 id 400）；`SMOKE-PROJECT-PASS` / `SMOKE-V2-PASS` 均无回归。
- **文档**：`docs/domain.md`（workspaceId 校验/唯一绑定/不变量 7-8）、`docs/api.md`（409 冲突与 `expectedUpdatedAt`、`changed` 返回值）、`docs/architecture.md`（决策 17-19）、`docs/ui.md`（失效绑定提示与冲突反馈）、`docs/manual.md`（已知边界改 v0.2.7）、`docs/verify.md`（本轮复核项改 [x] 并新增 v2.7 节）。

## 0.2.6 — 2026-11-18

参照 dsh-super-kanban 的项目模块搭建完整项目视图（原表格换成卡片网格 + 工作区项目分组 + 归档区 + 看板范围联动）。

- **项目视图重构**：卡片网格（`auto-fill minmax(min(100%,268px),1fr)`），分「工作区项目（按 DSH 工作区自动生成）」与「自建项目（手动创建，可跨工作区）」两段，外加 `▼ 已归档项目（N）` 折叠区；卡片 = 名称 + 指标行（`近期 done/total 已完成 · N 项受阻 · N 项逾期 · N 项进行中`）+ 进度条 + 到期日 + 备注 + `看板/编辑/归档/删除`（工作区卡片只有「看板」）。
- **项目字段扩展**：`dueDate`（严格 `YYYY-MM-DD`，`normalizeDateOnly` 拒绝 `2026-02-31` 之类非法回环）、`workspaceId`（关联 DSH 工作区，空串表示不关联）、`notes` 上限 280→600。
- **看板范围联动**：项目/工作区卡片点「看板」→ 切回看板并自动带入 `scope`（自建项目选「项目」下拉；工作区选「工作区」下拉，任务自身 workspaceId 命中或归属该工作区项目即显示）。
- **工作区发现修复（关键）**：DSH 现行 `$DSH_HOME/storages/workspace.json` 是 `{unit,global,tables:{workspaces:{<uuid>:{path,title}}}}`，旧解析按裸 map 会把 `unit`/`global`/`tables` 当成工作区并丢失真实 id —— `server/workspaces.mjs` 改为**优先读 `tables.workspaces`**，其余表不参与。
- **弹窗**：项目弹窗新增到期日 + 关联工作区并排一行、编辑态「归档」checkbox、saving 态与失败提示。
- **测试** 43/43（新增：项目 dueDate 合法/非法、workspaceId 与 archived 持久化、归档项目拒收新任务、DSH `tables.workspaces` 布局解析）；`SMOKE-PROJECT-PASS` 新增、`SMOKE-V2-PASS` 无回归；截图 `docs/ui-v26-project*.png`、`docs/ui-v26-board-scope*.png`。

## 0.2.5 — 2026-11-18

看板与任务相关 UI/交互全面对齐 dsh-super-kanban（v3 单色设计语言下的信息密度与操作路径）。

- **页头重构**：20px/500 标题 + 统计行（`N 项` + 每个非零状态 `状态点 + N 状态名`）+ 右侧搜索框与当前视图的新建按钮；视图切换下移到 slimbar 首位。
- **slimbar（细分工具栏）**：分段视图切换（`aria-pressed`）+ 项目/指派给下拉 + 「可见 / 总数」计数 + 右侧「筛选」按钮（带生效条件角标）与筛选浮层（优先级 chips P0–P3、来源 chips 手动/AI、标签下拉、含归档 chip、清空筛选）。
- **搜索**：按标题、验收标准、目标、标签实时过滤；`/` 聚焦、`Esc` 清空。
- **列增强**：列头「+」按钮按状态直接建任务、已完成列折叠、超过 30 张分页（「起始–结束 / 总数」+ 上下页）、排序改为「置顶 → 优先级 → 最近更新」。
- **卡片增强**：整卡可点但焦点落在 `.iicp-card-open`（`aria-haspopup="dialog"`）；新增「置顶」/「已归档」徽章、`AI` 来源标记、hover 显现的「更多」菜单（查看详情 / 置顶 / 归档 / 移至其它状态 / 删除）；归档卡片 65% 不透明度。
- **服务端 `pinned`**：`server/store.mjs` 归一化布尔、`server/service.mjs` `task.create` 默认 `false` + `task.update` 接受 `pinned` 并写 `kind:"pin"` 历史（「置顶任务」/「取消置顶」），相同值不写盘。
- **乐观更新与 toast**：拖拽移动先本地更新再请求，失败回滚；置顶/归档/移动/删除结果用底部 toast（2.6s）反馈。
- **加载与错误态**：三行骨架（`aria-busy`）、「看板加载失败」+ 原因 + 重试 + 自动重连提示。
- **键盘**：`/` 搜索、`n` 新建、`Esc` 逐层关闭（筛选浮层 → 卡片菜单 → 编辑弹窗 → 详情抽屉 → 清空搜索），输入框聚焦时只响应 `Esc`。
- **测试** 39/39（新增 `task pin toggles through task.update and records history`）；`SMOKE-V2-PASS` 无回归；截图 `docs/ui-v25-*.png`。

## 0.2.4 — 2026-11-18

新增任务详情抽屉（对齐 dsh-super-kanban 的单击卡片详情框），原编辑弹窗保持不变。

- **单击卡片 → 详情抽屉**：右侧滑出 540px 抽屉（`role="dialog"` + `aria-modal` + `data-drawer="task-detail"`），遮罩点击/返回按钮/Esc 关闭；抽屉内容跟随 8 秒轮询实时刷新，任务被删除时自动关闭。
- **分节内容**：①任务概览（状态点+状态名+P 级+进度+指派人 → 目标/验收标准/指派给/项目/到期日/标签/备注 两列网格，空值显示「暂无」，逾期到期日标红）②子任务（done/total 计数 + 勾选态方框 + `ai`/`todo` 来源徽章）③交付物（名称 + 路径）④变更历史（倒序时间 + 说明，底部创建/更新时间）。
- **双击卡片 → 原编辑弹窗**（保留不动）；单击/双击用自行计时的 350ms 间隔判定（合成点击不派发 `dblclick`，`event.detail` 亦不可靠），卡片新增 `role="button"`/`tabIndex`/Enter 打开详情。
- **新组件/工具**：`TaskDrawer`、`fmtDate()`、`fmtDateTime()`；`Icon` 新增 `back`/`close`；EN 词典新增 20 项（任务详情、任务概览、变更历史等）。
- **测试** 38/38 无回归；截图 `docs/ui-drawer-v1.png`（抽屉全貌）。

## 0.2.3 — 2026-11-18

任务卡片按 dsh-super-kanban v3 卡片重做。

- **卡片结构**：状态圆点（6px，四状态各自配色）+ 13px/600 两行截断标题 → 元信息行（项目名/「未归属」+ `·` + 相对时间；右侧指标组：优先级、`👤` 指派、`📎` 交付物数、`✓ done/total` 子任务计数）→ 计划行（`📅 MM-DD` 到期日 + `#标签`）→ 摘要行（验收标准优先，否则目标，2 行截断）→ 3px 进度条。
- **状态着色**：进度条进行中蓝 75%、受阻橙 75%、其余墨色 20%；已完成卡片隐藏指标组与进度条、标题降为 500。
- **相对时间**：新增 `relTime()`（刚刚 / N 分钟前 / N 小时前 / N 天前 / M/D）；新增 `Icon` 组件（13x13 stroke：check/file/alert/user）。
- **修复**：`.iicp-field input{width:100%}` 把子任务 checkbox 撑满整行导致弹窗横向溢出滚动条，新增 `input[type="checkbox"]{width:auto;height:auto;padding:0;border:none}` 覆盖。
- **测试** 38/38 无回归；截图 docs/ui-card-v3-progress.png（摘要行+✓1/1）、docs/ui-card-v3-inprogress.png（蓝点+蓝进度条）、docs/ui-card-v3-done2.png（已完成卡片无指标/无进度条）。

## 0.2.2 — 2026-11-18

任务弹窗布局优化：两列排布。

- **状态与优先级并排一行**（.iicp-field-row 两列 grid）；seg 按钮改为 flex:1 自适应等宽（去掉 flex-wrap，半列宽下不再换行）。
- **指派给与到期日并排一行**（规划折叠区内重排：指派给+到期日 → 项目 → 标签 → 备注）。
- 测试 38/38 无回归；截图 docs/ui-v212-row-layout2.png（状态+优先级行）、docs/ui-v212-planning-row.png（指派给+到期日行）。

## 0.2.1 — 2026-11-18

新建任务表单对齐 dsh-super-kanban 的交互与样式，任务模型新增到期日。

- **新增字段 `dueDate`**（≤10 字符，YYYY-MM-DD）：store 归一化、/task.create 与 /task.update 支持、变更写 history「编辑：到期日」。
- **client 新建/编辑表单重构**（对齐旧插件 NewTaskModal）：标题 placeholder「要做什么？」+ Enter 直接提交；目标与验收标准标注（可选）与引导 placeholder；规划字段（指派给/项目/到期日/标签/备注）收进可折叠区「项目、到期日与备注」（编辑已有对应字段的任务时自动展开）；状态与优先级改为 seg 按钮组（aria-pressed）；保存按钮 saving 态（保存中…，禁用重复提交）+ 失败 alert 提示。
- **任务卡片**：到期日 pill（📅 MM-DD），过期未完成时红色高亮（overdue = dueDate < 今天且状态≠done）。
- **测试**：node --test 38 用例全绿；进程内冒烟 DUE-SMOKE PASS（dueDate create/update/清除 roundtrip）；SMOKE-V2-PASS 无回归。
- 已知边界：桌面自动化下 Chrome 原生日期选择器设值未稳定触发落库（人工操作正常；服务端契约已由进程内冒烟覆盖）。

## 0.2.0 — 2026-11-18

任务数据模型对齐 dsh-super-kanban（v2），支持 AI AGENT 执行语义。

- **goal 升级为对象** `{text ≤280, status∈active/done/none, source∈session/task}`；status 自动跟随任务状态；旧字符串数据自动迁移。
- **新增字段**：`acceptanceCriteria`（验收标准 ≤600）、`subtasks`（≤12 项可勾选步骤，source∈ai/todo/manual）、`artifacts`（≤10 项交付物路径）、`progress`（0-100，有子任务时自动推导）、`lockedFields`（agent 不可覆盖字段白名单）、`origin:"session"`+`sourceSessionId`（agent 会话挂靠）。
- **完成自动收尾**：任务状态→done 时，非 manual 且未锁定的未完成子任务自动关闭并写 history；manual 子任务永不被自动关闭。
- **API**：/task.create、/task.update 接受全部 v2 字段（goal 支持部分对象合并）；/task.move 与 /task.update 的 →done 联动一致；/ping version=2。
- **client**：任务卡片显示进度条+子任务计数+交付物计数；任务弹窗新增验收标准、子任务勾选/添加/删除、交付物路径管理。
- **测试**：node --test 38 用例全绿（新增 v2 模型迁移与 agent 语义用例）；scripts/smoke-v2.mjs 进程内冒烟通过。

## 0.1.0 — 2026-11-17

首个版本。基于 dsh-super-kanban 架构模式全新实现，MVP 范围（用户确认）：四列看板 + 任务 CRUD + 项目/工作区 + 成员与任务指派。

- host：`/iicp-kanban/api` 前缀路由，owner-only fail-closed 鉴权，state.json 原子写持久化，损坏自愈（备份 corrupt-*）。
- 团队管理：成员 CRUD（角色 owner/admin/member/guest）、任务指派、成员负载（含未指派桶）、删除级联（任务转未指派+历史）。
- 看板：四列拖拽改状态、指派/项目筛选、任务历史（create/status/assignee/archive/edit，≤20 条）。
- client：零构建 bundle（`__ModuleLoader__.load`），main slot 注入，8s 轮询，中英双语。
- 测试：node --test 29 用例全绿（`--test-isolation=none`，规避沙箱 spawn EPERM）。
- 未纳入（原 super-kanban 有）：AI 研判、快聊。
