# Spec Delta: team-lead-protection

## Purpose

保证任何时刻团队都有且仅有一个不可变更的队长：队长不可被删除、不可被卸任，首次使用时自动初始化一个默认队长，团队视图不再出现「无队长」状态。

## ADDED Requirements

### Requirement: 队长不可被删除
服务端 SHALL 拒绝删除 `kind === "lead"` 的成员，返回 400 与明确错误信息「队长不可被删除」。删除普通工作成员的既有语义（任务解绑、history 记录）不变。

#### Scenario: 删除队长被拒绝
- **WHEN** 客户端调用 `/member.delete` 且目标成员的 `kind` 为 `lead`
- **THEN** 服务端返回 400 invalid-input，错误信息为「队长不可被删除」，该成员仍存在于团队中，名下任务与 worker 绑定不变

#### Scenario: 删除工作成员不受影响
- **WHEN** 客户端调用 `/member.delete` 且目标成员的 `kind` 为 `worker`
- **THEN** 服务端按既有语义删除该成员：其任务改为未指派并写入 history，`defaultAssigneeId` 若指向该成员则清空

### Requirement: 队长不可被卸任
服务端 SHALL 拒绝把队长成员的 `kind` 改为 `worker`（卸任），返回 400。队长的其他资料字段（名称、职位、人格、技能、提供方、模型、状态、联系方式等）仍可正常编辑。worker→lead 的晋升请求 SHALL 继续被「一队一队长」唯一性约束拒绝（409）。

#### Scenario: 卸任队长被拒绝
- **WHEN** 客户端调用 `/member.update` 试图把 `kind` 为 `lead` 的成员改为 `worker`
- **THEN** 服务端返回 400 invalid-input，错误信息为「队长不可被卸任」，该成员 `kind` 保持 `lead`

#### Scenario: 队长资料仍可编辑
- **WHEN** 客户端调用 `/member.update` 只修改队长的名称/职位/人格/技能等资料字段（不传 `kind`）
- **THEN** 服务端正常保存并返回 200

#### Scenario: 唯一队长下晋升第二队长被拒绝
- **WHEN** 客户端调用 `/member.update` 试图把某工作成员 `kind` 改为 `lead`（现任队长仍在任）
- **THEN** 服务端返回 409 conflict「团队已经有队长（X），请先解除再指定新队长」

### Requirement: 启动时种子默认队长
服务端启动时 SHALL 保证团队恒有队长：若 `members` 为空，自动创建一个默认队长成员（名称「队长」、`kind: "lead"`、`role: "owner"`，其余画像字段为空）。若成员存在但无 lead（v0.2.7 老数据），SHALL 沿用既有迁移语义把 `createdAt` 最早的成员提升为 lead。

#### Scenario: 全新安装自动出现队长
- **WHEN** 插件第一次安装启动（`state.json` 无 `members` 或 members 为空数组）
- **THEN** 服务端自动创建默认队长「队长」（kind=lead），`GET /team` 返回该队长，客户端团队视图直接呈现队长卡片而非「还没有队长」空态

#### Scenario: 老数据迁移提升队长
- **WHEN** 启动时已有成员但全队无 lead（v0.2.7 升级数据）
- **THEN** `createdAt` 最早的成员被提升为 lead，orphan worker 被其接管，行为与 v0.3 迁移一致

### Requirement: 团队视图不再出现无队长状态
由于服务端恒定存在唯一队长，客户端 SHALL 移除「无队长」相关 UI 状态：成员弹窗不再提供成员类型切换（新建成员恒为工作成员），「队长已卸任」提示与无队长空态文案不再可达，团队视图恒渲染队长卡。

#### Scenario: 新建成员固定为工作成员
- **WHEN** 用户在团队视图打开成员弹窗新建成员
- **THEN** 弹窗不显示「成员类型」切换，创建的成员 `kind` 为 `worker` 并自动挂到现任队长名下

#### Scenario: 团队视图恒有队长卡
- **WHEN** 用户打开团队视图（无论是否已有工作成员）
- **THEN** 视图渲染队长卡片（来自种子或既有队长），不出现「还没有队长」空态或「队长已卸任」提示条
