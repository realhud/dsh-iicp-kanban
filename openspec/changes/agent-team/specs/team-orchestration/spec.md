# Spec Delta

## Purpose

把队长会话、按角色的看板工具、派单、汇报与验收串成一条可审计的协作流程：人做决策，队长做编排，成员做执行。

## ADDED Requirements

### Requirement: 计划闸门

队长 MUST 先在对话中给出计划；在用户明确确认前 MUST NOT 创建任务或派单。确认后 MUST 在同一轮内完成建卡与派单，任一建卡失败时 MUST NOT 留下部分任务。

#### Scenario: 只给计划不建卡

- **WHEN** 用户要求队长先出方案
- **THEN** 队长只回复计划，看板任务数量不变

#### Scenario: 确认后执行

- **WHEN** 用户明确确认计划并要求执行
- **THEN** 队长创建全部任务并派单，任务进入 backlog 或 in_progress

#### Scenario: 建卡失败回滚

- **WHEN** 批量建卡中任一任务校验失败
- **THEN** 系统不创建任何任务，并向队长返回失败原因

### Requirement: 角色工具集

队长会话 MUST 获得建卡、改卡、派单、验收、读板与成员列表工具；成员会话 MUST 只获得读取自己任务、汇报、添加产物的工具。成员 MUST NOT 创建、删除或修改他人任务。

#### Scenario: 队长工具可用

- **WHEN** 队长会话创建完成
- **THEN** 其工具集包含建卡、改卡、派单、验收、读板与成员列表

#### Scenario: 成员越权改他人任务

- **WHEN** 成员对不属于自己的任务调用汇报或修改工具
- **THEN** 调用被拒绝，任务不变并返回错误说明

#### Scenario: 成员尝试建卡

- **WHEN** 成员会话请求建卡能力
- **THEN** 该工具不存在于其工具集，无法创建任务

### Requirement: 派单简报

派单 MUST 写入 assigneeId 并把任务置 in_progress（前置未完成时返回 409），MUST 向成员会话投递包含任务 id、标题、目标、验收标准、前置与工作区的简报；成员忙碌时简报 MUST 排队，任务状态不变。

#### Scenario: 简报内容完整

- **WHEN** 队长派单一个带前置与验收标准的任务
- **THEN** 成员收到的简报包含任务 id、标题、目标、验收标准、前置标题与工作区路径

#### Scenario: 前置未完成

- **WHEN** 任务存在未完成前置
- **THEN** 派单返回 409，任务保持 backlog 且不写 assigneeId

#### Scenario: 成员忙碌排队

- **WHEN** 目标成员正在执行另一个任务
- **THEN** 简报进入队列，任务仍为 in_progress，成员状态仍为 working

### Requirement: 工作区串行

同一工作区同一时间 MUST 只有一个成员会话在执行任务；其余已派单任务的简报 MUST 排队，轮到时投递；排队 MUST NOT 改变任务状态。

#### Scenario: 第二个任务排队

- **WHEN** 同一工作区已有成员在执行任务，队长又派单第二个任务
- **THEN** 第二个任务的简报排队，不启动新的会话回合

#### Scenario: 前一任务完成后投递

- **WHEN** 工作区内前一个执行任务结束
- **THEN** 系统向队列中下一个任务的成员投递简报

### Requirement: 汇报与验收

成员 MUST 通过汇报工具写自己任务的 progress、blocked 或 done；done MUST 置 reviewStatus=pending 并保留汇报说明；blocked MUST 置任务与成员为受阻；队长验收 MUST 能接受或打回，打回 MUST 把任务置回 in_progress 并向原成员投递修改意见。

#### Scenario: 汇报进度

- **WHEN** 成员报告进度与说明
- **THEN** 任务 notes 或 progress 更新，并写一条 agent history

#### Scenario: 汇报受阻

- **WHEN** 成员报告 blocked 并说明问题
- **THEN** 任务状态为 blocked，成员状态为 blocked，进入团队 attention

#### Scenario: 汇报完成

- **WHEN** 成员报告 done
- **THEN** 任务保持 done，reviewStatus 为 pending，汇报说明写入 reviewNote

#### Scenario: 队长接受

- **WHEN** 队长对 pending 任务执行 accept
- **THEN** reviewStatus 变为 accepted 并写 history

#### Scenario: 队长打回

- **WHEN** 队长对 pending 任务执行 changes 并附意见
- **THEN** 任务回到 in_progress，意见随简报投递给原成员

### Requirement: 事件唤醒

成员汇报 done 或 blocked 时，系统 MUST 唤醒队长会话；唤醒 MUST 按成员合并并限流；纯 progress 汇报 MUST NOT 唤醒队长。

#### Scenario: 完成唤醒队长

- **WHEN** 成员报告 done
- **THEN** 队长收到一条待验收提醒

#### Scenario: 合并限流

- **WHEN** 同一成员在短时间内多次报告 done 或 blocked
- **THEN** 队长在限流窗口内只收到一条合并提醒

#### Scenario: 进度不唤醒

- **WHEN** 成员只报告 progress
- **THEN** 队长不收到唤醒

### Requirement: 人工优先与审计

人工操作 MUST 始终优先于 agent 决定；任务 MUST 记录执行会话 agentSessionId，agent 的每次写入 MUST 产生带来源的 history。

#### Scenario: 人工拖完成

- **WHEN** 人工把 pending 任务拖到 done
- **THEN** 任务被接受并写「人工直接完成」history，agent 结论被覆盖

#### Scenario: 审计字段

- **WHEN** 任务被 agent 执行
- **THEN** 任务的 agentSessionId 指向该成员会话

#### Scenario: agent 写入留痕

- **WHEN** agent 修改任务状态或汇报
- **THEN** history 记录来源为 agent 与会话 id
