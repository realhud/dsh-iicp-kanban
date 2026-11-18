# 验收复核：参照 dsh-super-kanban 搭建项目模块（0.2.6）

复核时间：2026-11-18 13:40–14:00（Asia/Shanghai）
复核对象：`F:\realhud\dsh-iicp-kanban`（工作区 dsh-iicp-kanban，版本 0.2.6）
验收目标（任务卡原文）：依照 dsh-super-kanban 项目模块实现 Project 的 dueDate/notes/归档/级联删除及卡片墙 UI，并通过端到端取证。

复核方式：**本轮重新执行**命令 + 读源码逐条对照 + 只读检查线上 `state.json`；不采信历史结论。
本报告全部命令均在 `F:\realhud\dsh-iicp-kanban` 下执行，Node v24.22.1，DSH_HOME 未污染（冒烟脚本用 `mkdtemp` 临时目录）。

---

## 一、逐项验收结论

| # | 验收条件 | 结论 | 依据 |
|---|---|---|---|
| 1 | Project 支持 `dueDate` 字段（严格 `YYYY-MM-DD`，非法回落 `""`） | **通过** | 见 §2.1 —— 6 组输入全部符合预期 |
| 2 | Project 支持 `notes` 字段，上限 600 | **通过** | 见 §2.2 —— 700 字输入落库 600 |
| 3 | 归档语义：归档后项目仍在 `/state`、已有任务归属保留、**不能**接收新任务 | **通过** | 见 §2.3 —— create 与 update 两条入口均 400 |
| 4 | 级联删除：删项目后其任务 `projectId` 置空，其它项目任务不受影响 | **通过**（附一致性瑕疵 §3.2） | 见 §2.4 |
| 5 | 卡片墙 UI：工作区项目 / 自建项目 / 已归档项目 三段 + 卡片指标/进度/到期/备注/按钮 | **通过** | 见 §2.5（代码 + 13 张截图） |
| 6 | 端到端取证（创建→编辑→归档→看板联动） | **通过** | 见 §2.6（含 state.json 实证） |
| 7 | 自动化回归（语法/单测/冒烟） | **通过** | 见 §2.7 —— 43/43 + 2 个 SMOKE-PASS |
| 8 | 持久化（新进程读回 dueDate/notes/workspaceId/archived） | **通过** | 见 §2.8 |
| 9 | 线上数据与当前代码一致（无脏引用） | **失败（遗留脏数据）** | 见 §3.1，可复现 |
| 10 | 与 super-kanban 项目模块完全对齐（时间线/日程、工作区唯一绑定、乐观锁） | **未实现（已知边界）** | 见 §3.3，非回归 |

---

## 二、通过项的证据

### 2.1 dueDate 严格校验（`server/limits.mjs:83` `normalizeDateOnly`）

进程内脚本直接调用 `createKanbanService`，POST `/project.update` 逐个写值：

```
PASS | dueDate 2026-02-31 不存在 | in=2026-02-31 out=""
PASS | dueDate 2026-2-3 格式非严格 | in=2026-2-3 out=""
PASS | dueDate 20260203 无分隔 | in=20260203 out=""
PASS | dueDate 2026-13-01 月份越界 | in=2026-13-01 out=""
PASS | dueDate 2026-12-31 合法 | in=2026-12-31 out="2026-12-31"
PASS | dueDate 2028-02-29 闰日合法 | in=2028-02-29 out="2028-02-29"
```

关键点：`2026-02-31` 没有被 `new Date()` 静默滚到 3 月 3 日，而是回环比对失败后回落空串（实现见 `normalizeDateOnly`：正则 + `toISOString().slice(0,10) !== text` 双重判定）。

### 2.2 notes 上限 600

```
PASS | notes 700→600 | len=600
```

实现：`server/service.mjs:191` `notes: clipText(body.notes, TEXT_LIMITS.projectNotes)`，`TEXT_LIMITS.projectNotes = 600`（`server/limits.mjs:36`）。

### 2.3 归档语义

```
PASS | 归档后 task.create 被拒 | status=400 error=invalid-input
PASS | 归档后 task.update 改归入被拒 | status=400 error=invalid-input
PASS | 归档项目仍在 /state.projects | archived 项目数=1
PASS | 归档项目内已有任务保留 projectId | 原有归属未被打断
PASS | 恢复归档 | archived=false
```

机制（读码确认）：`server/service.mjs:62-64` 的 `findProject` 只返回 `!project.archived` 的项目 → `assertProject` 对归档项目抛 `project not found`（400）。`task.create` 与 `task.update` 都过这道闸。这是**比 super-kanban 更严格**的行为（super-kanban 的 `projectAssignment` 允许"当前已属于该项目"的任务保留）。

### 2.4 级联删除

```
PASS | delete 返回 deleted=id | status=200 body={"ok":true,"deleted":"p_..."}
PASS | 任务A 解绑 | projectId 已置空
PASS | 任务B 解绑 | projectId 已置空
PASS | 任务C 不受影响 | projectId=p_...（另一项目）
PASS | 项目已移除 | 剩余=notes 上限/保留项目
PASS | 重复删除 404 | status=404 error=not-found
PASS | 磁盘 projects 已删 | state.json 同步
```

实现：`server/service.mjs:219-231`。

### 2.5 卡片墙 UI

代码位置与结构（本轮重读）：

- `client.js:1679-1749` `ProjectCard`：`h4` 名称 → `.iicp-project-metrics`（`近期 done/total 已完成`、`N 项受阻`、`N 项逾期`、`N 项进行中`，无任务时「暂无近期任务」）→ `.iicp-project-progress[role=progressbar]`（`aria-valuenow/min/max` + `title="done / total"`）→ 到期日（`overdue` 时红字「已逾期 · 日期」）→ 备注 → 按钮组（工作区卡片只有「看板」，自建项目另有 编辑/归档·恢复/删除）。
- `client.js:1751-1860` `ProjectsView`：引导文案 → 「工作区项目 / 按 DSH 工作区自动生成」→「自建项目 / 手动创建，可跨工作区」→「已归档项目（N）」折叠区；归档/删除均带 toast。
- 截图证据（`docs/`）：`ui-v26-projects6.png`（三段结构，工作区只剩 default-workspace 与 dsh-iicp-kanban）、`ui-v26-project-modal.png` / `ui-v26-project-edit.png`（弹窗字段）、`ui-v26-project-archive-open.png`（归档折叠区）、`ui-v26-board-scope2.png` / `ui-v26-board-ws-scope2.png`（看板联动）。

### 2.6 端到端取证（历史 + 本轮数据复核）

- 创建：弹窗填「项目模块验收」+ 备注 + 到期日 2026-11-21 → 保存 → `state.json` 出现 `p_f1e2ekpf`（截图 `ui-v26-project-modal.png`）。
- 归档：卡片「归档」→ 落盘 `archived: false → true`，卡片移入折叠区（截图 `ui-v26-project-archive-open.png`）。
- 看板联动：自建项目「看板」→ 项目下拉自动选中、计数 `0 / 2`、筛选角标 1；工作区卡片「看板」→ 工作区下拉自动选中 `dsh-iicp-kanban`（截图 `ui-v26-board-scope2.png`、`ui-v26-board-ws-scope2.png`）。

### 2.7 自动化回归（本轮重跑）

```
node --check client.js / index.mjs / server/*.mjs  → 全部 exit 0
node --test --test-isolation=none "tests/**/*.test.mjs"
  ℹ tests 43   ℹ pass 43   ℹ fail 0   ℹ duration_ms 551.5973   → EXIT=0
node scripts/smoke-project.mjs → SMOKE-PROJECT-PASS   EXIT=0
node scripts/smoke-v2.mjs      → SMOKE-V2-PASS        EXIT=0
```

项目相关单测用例：`project lifecycle and task detachment on delete`、`project due date accepts a real date and rejects an impossible one`、`project keeps workspace binding and archive flag across updates`、`archived project cannot receive new tasks`；工作区解析 `reads the live DSH tables.workspaces registry without leaking other tables`。

### 2.8 持久化

```
PASS | 重启后 dueDate 持久 | dueDate=2028-02-29
PASS | 重启后 notes 持久 | len=600
```

方式：新建第二个 `createKanbanService` 实例（同 DSH_HOME）后读 `/state`。

---

## 三、失败项与问题（含复现）

### 3.1 【失败】线上一份项目数据带已失效的 `workspaceId`

**现象**：`C:\Users\Administrator\.dsh\storages\iicp-kanban\state.json` 当前唯一项目

```
p_f1e2ekpf | 项目模块验收 | due=2026-11-21 | ws=unit | archived=True | notes=17
```

`ws=unit` 不是任何真实工作区 id。真实工作区（`~/.dsh/storages/workspace.json` → `tables.workspaces`）只有：

```
80f1790c-1685-450e-bdb5-4fc1c59ffbff => default-workspace
0de986e8-8812-4db7-b908-6f42b3b0ede9 => dsh-iicp-kanban
```

**成因**：这份数据写入于工作区解析修复（`server/workspaces.mjs` 改为优先 `tables.workspaces`）之前，旧解析把 `workspace.json` 顶层的 `unit` / `global` / `tables` 当成了工作区，`unit` 被存进项目。修复只改了**读取**侧，没有做数据迁移，`normalizeProject` 对 `workspaceId` 只做字符串类型校验，不校验存在性。

**复现**：
1. 打开「团队看板」→ 切到「项目」视图；
2. 展开「已归档项目（1）」→ 对「项目模块验收」点「编辑」；
3. 「关联工作区」下拉显示为空选中（值 `unit` 不在选项里），而不是 `dsh-iicp-kanban`。
（本轮为只读取证，未点开该弹窗，属代码推断 + state.json 实证；如需要可以按上述三步在 UI 上确认。）

**影响面**：仅展示与统计。工作区过滤走 `task.workspaceId` / `project.workspaceId` 比对，不会命中 `unit`，因此不会错误地挡住任务。但用户重新保存该项目时，`workspaceId` 会被写成空串（下拉回落到「不关联工作区」），原绑定丢失且无提示。

**建议修复**（任选，均属小改动）：
- A. 启动迁移：`store.mjs` 加载后把不在 `workspaces` 列表里的 `project.workspaceId` 置空（幂等，能一并清掉其它历史脏值）；
- B. 保存前校验：`service.mjs` `/project.create|update` 用 `listWorkspaces()` 校验 `workspaceId` 存在，不存在则 400；
- C. 最小修补：直接在手头这份 state.json 上把 `unit` 改为 `0de986e8-...`（只救这一条，不防未来）。

推荐 A + B 组合：A 清历史，B 防新增。

### 3.2 【一致性瑕疵】项目删除的级联没有写 history/updatedAt

同一份代码里，`member.delete` 解绑任务时会写历史并刷新时间：

```js
task.assigneeId = "";
addHistory(task, "assignee", `成员已移除，任务改为未指派（原成员：${removed.name}）`);
task.updatedAt = now();
```

而 `project.delete` 只做裸赋值：

```js
for (const task of state.tasks) if (task.projectId === removed.id) task.projectId = "";
```

实证：

```
FAIL | 解绑后 history 是否记录 | history=["创建任务"]
FAIL | 解绑后 updatedAt 是否变化 | before=…22.295Z after=…22.295Z
```

**影响**：任务详情抽屉里看不到"项目被删除"这条线索，卡片相对时间也不变，用户难以解释归属为何消失。功能正确，属可观测性缺口。

**复现**：新建项目 → 建一个归入它的任务 → 删项目 → 打开该任务详情抽屉 → 「变更历史」只有「创建任务」。

**建议**：与成员删除对齐，写 `addHistory(task, "project", "项目已删除，任务改为无项目（原项目：X）")` + `task.updatedAt = now()`。

### 3.3 【未实现，已在已知边界记录，非回归】

对照 `F:\realhud\dsh-super-kanban`：

| super-kanban 有 | 本插件 | 说明 |
|---|---|---|
| 项目「时间线 / 日程 / 历史」子视图按钮 | 无 | `ProjectsView` 的卡片按钮只有 看板/编辑/归档/删除 |
| `server/projects.mjs` 的 `duplicateBinding`（同一工作区只能绑定一个未归档项目） | 无 | 本插件允许多个项目绑同一工作区 |
| `ProjectModal` 的 `expectedUpdatedAt` 乐观锁 + revision-conflict 提示 | 无 | `client.js:2130` 直接 POST body，多端并发后写覆盖 |
| **无**项目删除能力（命令表只有 `project.create` / `project.update`） | 有 `/project.delete` + 级联解绑 | 本插件是超集，属有意扩展 |

### 3.4 【预期差异，非缺陷】`id` 缺失返回 400 与 404

复核脚本最初断言"缺 `id` → 400"失败，实测为 404：

```
/project.delete 缺 id -> status=404 error=not-found
/task.delete    缺 id -> status=404 error=not-found
/member.delete  缺 id -> status=404 error=not-found
/project.delete 无 body -> status=400 error=invalid-input
/project.delete body=数组 -> status=400 error=invalid-input
```

`docs/api.md` 错误码表明确"id 未找到 → 404 not-found"，六个 delete/update 路由行为完全一致，是脚本断言写错而不是实现缺陷。

---

## 四、仍需处理的事项

1. **（建议做）** 修复 §3.1 的脏 `workspaceId`：推荐迁移 + 写入侧校验双管齐下，并补一条单测（"未知 workspaceId 不被保存 / 历史脏值被清理"）。
2. **（建议做）** 对齐 §3.2：项目删除时写 history + 刷新 `updatedAt`，补一条单测断言。
3. **（可选）** 按已知边界补齐与 super-kanban 的差距（时间线/日程子视图、工作区唯一绑定、`expectedUpdatedAt` 乐观锁）。
4. `docs/verify.md` 里仍有两类 `[ ]` 遗留与本次复核无关，保留原状：v2.1 的 dueDate/tags UI 落库复核、v2.5 的置顶/归档/移动菜单落盘复核与分页/toast 视觉。

---

## 五、结论

验收目标中的五项核心能力（dueDate / notes / 归档语义 / 级联删除 / 卡片墙 UI）**全部通过**，且有本轮重跑的自动化证据（43/43 + 2 个冒烟）与历史 UI 端到端截图。发现 1 项失败（线上遗留脏 `workspaceId`，成因明确、有可复现步骤、影响限于展示）、1 项一致性瑕疵（项目删除级联不写 history）、3 项已知未实现差距。整体判定为**验收通过，附 2 项待修小问题**。

---

## 六、后续（v0.2.7 已处理）

本报告 §3.1、§3.2 与 §四.3 中标注"建议做/可选"的项已在 v0.2.7 落地，复核结论不再作为未决事项：

- §3.1 脏 `workspaceId` → `service.start()` 的 `migrateWorkspaceBindings` 自动清理（2026-11-18 14:11 重载后线上 `ws=''` 实证）+ 写入侧 `normalizeWorkspaceBinding` 未知 id 返回 400 + 编辑弹窗「（已失效）」显式提示；用例「stale project workspace bindings are healed on start」。
- §3.2 级联删除不写历史 → `project.delete` 追加 `kind:"project"` 历史并刷新 `updatedAt`；用例「project delete detaches tasks and leaves a history trail」。
- §四.3 工作区唯一绑定与 `expectedUpdatedAt` 乐观锁 → 均已实现（409 冲突 + `changed:false` 早返回）；用例「one live project per workspace」「project update honours expectedUpdatedAt (optimistic lock)」。
- 测试总数 43 → 47，全部通过；`SMOKE-PROJECT-PASS` / `SMOKE-V2-PASS` 无回归。详见 CHANGELOG 0.2.7 与 docs/verify.md「项目模块验收复核」节。