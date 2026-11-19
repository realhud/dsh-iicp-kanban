# Spec Delta

## Purpose

让每个团队成员拥有独立的 agent 会话，并负责这些会话的创建、复用、恢复与销毁，使看板上的任务有真正的执行者，同时在宿主能力不可用时保持看板可用。

## ADDED Requirements

### Requirement: 成员会话按工作区唯一映射

系统 SHALL 为每个成员在每个工作区至多维护一个会话，并把会话 id 持久化到成员记录；同一成员在同一工作区再次派单时 MUST 复用已有会话。

#### Scenario: 首次派单创建会话

- **WHEN** 队长把一个工作区的任务派给尚无该工作区会话的成员
- **THEN** 系统创建会话，把 sessionId 写入该成员该工作区的映射，并向会话投递任务简报

#### Scenario: 同工作区复用会话

- **WHEN** 同一成员再次收到同一工作区的任务
- **THEN** 系统复用已有 sessionId，不创建新会话

#### Scenario: 跨工作区各自建会话

- **WHEN** 成员先后收到两个不同工作区的任务
- **THEN** 系统为两个工作区分别创建会话，互不覆盖

### Requirement: 会话创建参数

会话 MUST 以任务所属工作区路径为 cwd，使用成员画像的 provider/model（两者为空时继承工作区默认模型），权限档 MUST 为 workspace-write，MUST NOT 使用 danger-full-access；创建时 MUST NOT 指定 parentSession。

#### Scenario: 继承工作区模型

- **WHEN** 成员的 provider 与 model 都为空
- **THEN** 会话使用宿主当前默认模型

#### Scenario: 使用成员画像模型

- **WHEN** 成员配置了 provider 与 model
- **THEN** 会话的 agentOptions 使用该组合

#### Scenario: 创建根会话

- **WHEN** 插件创建成员会话
- **THEN** 请求不携带 parentSession，会话不隶属于任何用户会话

#### Scenario: 权限档

- **WHEN** 会话创建完成
- **THEN** 其权限为 workspace-write，且不含 danger-full-access

### Requirement: 重启恢复

插件启动后 SHALL 在首次需要时恢复已持久化的成员会话；对重启时存在进行中任务的成员，MUST 在启动阶段恢复。恢复失败时 MUST 重建会话并重放该成员当前进行中任务的简报，且 MUST 在任务 history 记录重建。

#### Scenario: 恢复成功

- **WHEN** 插件重启且成员会话仍可用
- **THEN** 系统 resume 原会话，原有对话历史保留

#### Scenario: 恢复失败后重建

- **WHEN** resume 抛错（会话已归档或不可读）
- **THEN** 系统创建新会话、替换映射，并为每个进行中任务补投简报

#### Scenario: 无进行中任务

- **WHEN** 恢复失败且该成员没有进行中任务
- **THEN** 系统只替换映射，不投递简报

### Requirement: 会话上限与淘汰

每个成员最多保留 4 个工作区会话；超出时 MUST 按最近使用时间淘汰最旧会话并 dispose，且 MUST NOT 因此改动任务状态。

#### Scenario: 超限淘汰

- **WHEN** 成员创建第 5 个工作区会话
- **THEN** 系统 dispose 最久未使用的会话并从映射移除

### Requirement: agents 不可用时降级

当 agents 服务不可用或会话创建、恢复失败时，系统 MUST 仍完成派单（assigneeId 与 in_progress 照常写入），MUST 标记该成员 agent 不可用，并 MUST NOT 阻断看板其他操作。

#### Scenario: 创建失败仍派单

- **WHEN** dispatch 时会话创建抛错
- **THEN** 任务仍被指派并进入 in_progress，接口返回成功并带降级标记

#### Scenario: 看板不受影响

- **WHEN** 某成员的 agent 不可用
- **THEN** 其他成员的任务、拖拽与验收仍正常工作

### Requirement: 会话销毁

成员被删除、成员被归档或插件卸载时，系统 MUST dispose 该成员名下全部会话，并从映射中移除。

#### Scenario: 删除成员

- **WHEN** 删除一个成员
- **THEN** 其全部会话被 dispose，会话映射清空

#### Scenario: 卸载插件

- **WHEN** 插件卸载
- **THEN** 所有成员会话被 dispose
