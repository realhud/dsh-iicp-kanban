# Spec Delta

## Purpose

让看板上的任务能声明前置关系，并在前置未完成时阻止开工；把「等 A 做完」从备注里的默契，变成可校验、可展示、可测试的约束，同时保留人工越权的通道与痕迹。

## ADDED Requirements

### Requirement: 前置关系的表示

任务可以包含 `dependsOn` 字段，值为同一看板内任务 id 的数组，最多 8 个。写入时 MUST 去重、丢弃空值与非字符串、保留前 8 个有效 id；前置允许属于其他项目或工作区。读取时每个任务 MUST 返回 `dependsOn`，没有前置时为 `[]`。

#### Scenario: 保存前置列表
- **WHEN** 创建或更新任务时提交 `dependsOn: [A, B, C]`，且三者都存在
- **THEN** 任务保存这三个 id，顺序与提交一致，`/state` 返回相同数组

#### Scenario: 去重与截断
- **WHEN** 提交 10 个不重复 id，且其中两个重复
- **THEN** 只保留去重后的前 8 个

#### Scenario: 空值与非字符串
- **WHEN** 提交 `[A, "", null, 42, B]`
- **THEN** 只保存 A 与 B

#### Scenario: 旧任务没有该字段
- **WHEN** 读取未包含 `dependsOn` 的旧状态
- **THEN** 该任务的 `dependsOn` 为 `[]`

### Requirement: 前置引用必须存在

写入 `dependsOn` 时，其中每个 id MUST 对应当前状态中存在的任务。引用不存在的 id MUST 返回 400，且 MUST NOT 产生任何修改。加载旧状态是唯一例外：悬空 id 被静默丢弃。

#### Scenario: 引用不存在的 id
- **WHEN** 更新任务时提交 `dependsOn: ["t_missing"]`
- **THEN** 返回 400，任务的 `dependsOn` 与其他字段保持原样

#### Scenario: 部分 id 不存在
- **WHEN** 提交 `dependsOn: [A, "t_missing"]`
- **THEN** 返回 400，不保存 A，也不保存其他字段的修改

### Requirement: 自依赖与环必须拒绝

任务的 `dependsOn` MUST NOT 包含自身；写入后 MUST NOT 形成环。自依赖返回 400，成环返回 409；两种情况都 MUST NOT 落盘。环检测 MUST 覆盖跨项目、跨工作区的依赖边。

#### Scenario: 自依赖
- **WHEN** 任务 A 的 `dependsOn` 包含 A 自身
- **THEN** 返回 400，A 的 `dependsOn` 不变

#### Scenario: 两任务互相依赖
- **WHEN** A 已依赖 B，再把 B 的 `dependsOn` 设为 `[A]`
- **THEN** 返回 409，B 的 `dependsOn` 仍为空，A 对 B 的依赖保留

#### Scenario: 三任务成环
- **WHEN** A 依赖 B、B 依赖 C，再把 C 的 `dependsOn` 设为 `[A]`
- **THEN** 返回 409，C 的 `dependsOn` 不变

#### Scenario: 跨项目成环
- **WHEN** 项目 P1 的任务 A 依赖项目 P2 的任务 B，再把 B 的 `dependsOn` 设为 `[A]`
- **THEN** 返回 409

#### Scenario: 菱形依赖是合法的
- **WHEN** D 依赖 B 与 C，B 与 C 都依赖 A
- **THEN** 保存成功，不视为环

### Requirement: 就绪状态由前置派生

服务端 MUST 按 `dependsOn` 计算只读字段 `ready`：每个前置的 `status` 均为 `done` 时为 `true`，没有前置时恒为 `true`。`ready` MUST NOT 持久化，MUST NOT 触发任何任务状态自动变化：前置完成后依赖方保持原状态。前置是否归档不影响判定——已完成并归档的前置算满足，归档但未完成的前置不算满足。

#### Scenario: 全部前置完成
- **WHEN** B 依赖 A，A 的状态为 `done`
- **THEN** B 的 `ready` 为 `true`

#### Scenario: 任一前置未完成
- **WHEN** B 依赖 A 与 C，A 为 `done`、C 为 `in_progress` 或 `blocked` 或 `backlog`
- **THEN** B 的 `ready` 为 `false`

#### Scenario: 前置完成不自动流转
- **WHEN** B 在 `backlog` 等待 A，随后 A 被改为 `done`
- **THEN** B 仍为 `backlog`，`ready` 变为 `true`

#### Scenario: 已完成但已归档的前置
- **WHEN** 前置 A 的状态为 `done` 且 `archived` 为 `true`
- **THEN** 依赖方的 `ready` 仍为 `true`

#### Scenario: 已归档但未完成的前置
- **WHEN** 前置 A 已归档且状态不是 `done`
- **THEN** 依赖方的 `ready` 为 `false`

#### Scenario: 前置被重新打开
- **WHEN** A 从 `done` 改回 `in_progress`，B 已依赖 A 且 B 处于 `in_progress`
- **THEN** B 的状态不变，`ready` 变为 `false`

### Requirement: 未就绪任务不得开工

当前置未全部完成时，任何把任务状态写成 `in_progress` 的请求 MUST 返回 409，错误信息 MUST 包含每个未完成前置的标题与当前状态。该守卫 MUST 覆盖 `task.create`（`status` 为 `in_progress`）、`task.update`、`task.move`、`member.dispatch`。被拒绝的请求 MUST NOT 修改任务的任何字段，包括 `assigneeId`。同一请求同时提交 `dependsOn` 与 `status` 时，MUST 先按新的 `dependsOn` 判定就绪。守卫只在进入 `in_progress` 的那一刻判定：已经处于 `in_progress` 的任务，不因新增或回退前置而被改回 `backlog`。

#### Scenario: 创建时直接开工
- **WHEN** 创建任务时设置 `status: "in_progress"`，且 `dependsOn` 含未完成前置
- **THEN** 返回 409，不创建任务

#### Scenario: 更新状态被拒
- **WHEN** 任务 B 的未完成前置为 A，`task.update` 把 B 改为 `in_progress`
- **THEN** 返回 409，B 的状态与其他字段保持原样

#### Scenario: 拖动被拒
- **WHEN** 把一个未就绪任务拖到「进行中」列
- **THEN** 返回 409，任务仍留在原列

#### Scenario: 派单被拒且不换人
- **WHEN** 把未就绪任务派给 worker
- **THEN** 返回 409，任务的 `assigneeId` 与状态都不变

#### Scenario: 同一请求先加已完成前置再开工
- **WHEN** 一次更新同时把 `dependsOn` 设为已完成的 A，并把状态改为 `in_progress`
- **THEN** 请求成功，两个字段都保存

#### Scenario: 同一请求加了未完成前置
- **WHEN** 一次更新同时把 `dependsOn` 设为未完成的 A，并把状态改为 `in_progress`
- **THEN** 返回 409，`dependsOn` 与状态都不保存

#### Scenario: 已开工任务新增前置
- **WHEN** 任务 B 已处于 `in_progress`，再把未完成的 A 加入 `dependsOn`
- **THEN** 保存成功，B 仍为 `in_progress`，`ready` 变为 `false`

### Requirement: 汇报完成不受守卫阻止

`member.report` MUST 在前置未完成时仍然允许提交：任务被推成 `in_progress`，`reviewStatus` 置为 `pending`。同时 MUST 在任务 history 记录未完成的前置标题。理由是汇报代表真实产出，拦下来只会让已完成的工作无法登记。

#### Scenario: 汇报未就绪任务
- **WHEN** worker 汇报一个前置未完成的任务
- **THEN** 提交成功，`reviewStatus` 为 `pending`，history 含未完成前置的标题

#### Scenario: 前置全部完成时汇报
- **WHEN** worker 汇报一个已就绪任务
- **THEN** 提交成功，history 不含「前置未完成」提示

### Requirement: 越权完成必须留痕

前置未完成时 MUST 允许把任务改为 `done`，以保留「人工越权优先」的既有决策；同时 MUST 在 history 写一条越权记录，包含未完成前置的标题。前置全部完成时完成不产生该记录。

#### Scenario: 拖到已完成
- **WHEN** 任务 B 的未完成前置为 A，owner 把 B 改为 `done`
- **THEN** 请求成功，history 含「越权完成」与 A 的标题

#### Scenario: 创建即完成
- **WHEN** 创建任务时设置 `status: "done"` 且含未完成前置
- **THEN** 创建成功，history 含越权完成记录

#### Scenario: 正常完成
- **WHEN** 前置全部完成后把任务改为 `done`
- **THEN** 成功，history 不含越权记录

### Requirement: 删除任务必须清理依赖边

删除任务时 MUST 从所有任务的 `dependsOn` 中移除该 id，并在每个被修改的任务 history 写一条记录。依赖方的状态 MUST NOT 因删除而改变，`ready` 按剩余前置重新派生。

#### Scenario: 删除被依赖的任务
- **WHEN** 删除任务 A，B 的 `dependsOn` 含 A
- **THEN** A 被删除，B 的 `dependsOn` 不再含 A，B 的 history 含移除记录

#### Scenario: 删除有前置的任务
- **WHEN** 删除任务 B，B 的 `dependsOn` 含 A
- **THEN** B 被删除，A 与其他任务不受影响

#### Scenario: 删除后不自动就绪
- **WHEN** B 依赖 A 与 C，A 未完成，删除 C
- **THEN** B 的 `dependsOn` 只剩 A，`ready` 仍为 `false`

### Requirement: 旧数据迁移自愈

加载状态时，`dependsOn` 中不存在的 id MUST 被静默丢弃，MUST NOT 阻止服务启动或让读取请求失败；去重与 8 个上限同样适用。迁移 MUST NOT 修改依赖方状态。

#### Scenario: 悬空 id
- **WHEN** 旧 `state.json` 中某任务的 `dependsOn` 含已不存在的 id
- **THEN** 服务正常启动，该任务只保留仍存在的 id

#### Scenario: 迁移不改状态
- **WHEN** 旧数据中依赖方为 `in_progress` 且前置已不存在
- **THEN** 启动后该任务仍为 `in_progress`

### Requirement: 等待前置影响成员状态与团队负载

成员状态 MUST 只把 `in_progress` 任务或 `ready` 的 `backlog` 任务视为 `working`；成员的全部未完成任务都在等待前置时 MUST 显示 `idle`（可接别的活）；存在 `blocked` 任务时仍优先显示 `blocked`。团队负载 MUST 为每个 worker 提供 `waiting` 计数——已指派、仍为 `backlog`、未就绪的任务数——并在团队汇总中提供 `waiting` 总数。

#### Scenario: 只有等待前置的任务
- **WHEN** worker 唯一未完成的任务是未就绪的 `backlog`
- **THEN** 成员状态为 `idle`，`waiting` 为 1

#### Scenario: 可开工的待办
- **WHEN** worker 有已就绪的 `backlog` 任务
- **THEN** 成员状态为 `working`

#### Scenario: 受阻优先
- **WHEN** worker 同时有 `blocked` 任务与等待前置的任务
- **THEN** 成员状态为 `blocked`

#### Scenario: 团队汇总
- **WHEN** 两名 worker 各有 1 个等待前置的任务
- **THEN** 团队汇总的 `waiting` 为 2

### Requirement: 界面呈现等待与阻止

看板 MUST 在所有展示任务的位置标出等待状态：卡片显示未完成前置数量，任务抽屉列出前置的标题、状态与所属项目，编辑弹窗可选择前置并排除自己及会成环的候选。开工被 409 拒绝时 MUST 展示服务端错误信息并回滚乐观更新，MUST NOT 静默失败。筛选器 MUST 提供「仅看可开工」。

#### Scenario: 卡片等待标记
- **WHEN** 任务有 2 个未完成前置
- **THEN** 卡片显示「等待前置 2」

#### Scenario: 抽屉展示前置
- **WHEN** 打开任务抽屉，其前置属于另一个项目
- **THEN** 前置条目显示标题、状态与所属项目名

#### Scenario: 弹窗候选排除非法项
- **WHEN** 在编辑弹窗选择前置
- **THEN** 候选列表不含任务自身，也不含会导致成环的任务

#### Scenario: 拖动被拒的反馈
- **WHEN** 拖动未就绪任务，服务端返回 409
- **THEN** 卡片回到原列，并显示含前置标题的错误提示

#### Scenario: 仅看可开工
- **WHEN** 启用「仅看可开工」筛选
- **THEN** 未就绪的任务从列表与看板中隐藏
