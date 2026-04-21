# 诊断与修复：长任务中途停止但看板显示"已完成"

## 问题诊断

### 结论：这是 ReActEngine（单 Agent）的问题，不是 TaskPlanner 的问题

经过对代码的深入分析，问题根源在 **ReActEngine 的循环终止状态标记逻辑**，而非 TaskPlanner 的任务分解逻辑。

---

### 根因分析

#### 根因 1：ReActEngine 的 5 种强制终止全部标记为 `completed`（最关键）

在 [ReActEngine.ts](file:///c:/Users/Misaki/Desktop/git/nexus-ai-assistant/src/agent/runtime/ReActEngine.ts) 的 `run()` 方法中，以下 5 种场景虽然任务并未真正完成，但状态全部被设为 `completed`：

| 终止条件 | 代码位置 | 当前状态 | 返回内容 |
|---------|---------|---------|---------|
| 连续相同调用 ≥ 3 次 | 第 182-188 行 | `completed` ❌ | "任务执行因检测到重复操作而终止" |
| 连续空/无效结果 ≥ 3 次 | 第 212-218 行 | `completed` ❌ | "任务执行因连续空结果而终止" |
| 连续同类工具 ≥ 5 次 | 第 228-234 行 | `completed` ❌ | "任务执行因检测到重复操作模式而终止" |
| 单步骤迭代 ≥ 10 次 | 第 236-242 行 | `completed` ❌ | "当前步骤执行超过最大迭代限制" |
| 全局最大迭代次数 | 第 264-266 行 | `completed` ❌ | "Maximum iterations reached..." |

这些场景的返回字符串虽然包含了"终止"提示，但 **AgentRuntime 不检查返回内容**，直接执行：

```typescript
// AgentRuntime.ts 第 221 行
plan = planner.updateStepStatus(plan, step.id, 'completed', stepResult);
```

只要 `engine.run()` 不抛异常，步骤就被标记为 `completed`。

#### 根因 2：LLM 流中断可能导致静默"完成"

在 `callLLMStream()` 中（第 407-443 行），如果网络连接在流传输中途断开且未抛出异常（例如连接超时、代理中断），`for await` 循环会自然结束，`callLLMStream` 返回已累积的部分内容，`finishReason` 为 `'stop'`。这会让 `run()` 误判为 LLM 正常完成，从而标记任务为 `completed`。

#### 根因 3：AgentRuntime 缺少结果验证层

`executePlannedTasks()` 中，步骤完成/失败的判定完全依赖 `engine.run()` 是否抛异常。没有任何机制来：
- 检查返回内容是否包含"终止"关键词
- 区分"自然完成"和"强制终止"
- 将强制终止传播为步骤级别的 `failed` 状态

---

### TaskPlanner 为什么没问题

TaskPlanner 的职责是**将复杂任务分解为多个步骤**，它正确地完成了这个工作：
- `plan()` 方法生成结构化的 TaskPlan
- `updateStepStatus()` 方法正确地根据传入的 status 参数更新步骤状态
- 状态转换逻辑（`executing` → `completed`/`failed`）是正确的

问题出在 **AgentRuntime 传给 `updateStepStatus` 的 status 值不正确**——它总是传 `'completed'`，因为 ReActEngine 没有告诉它"我其实是被迫终止的"。

---

## 修复方案

### 方案核心：引入 `TaskResult` 返回类型，区分"自然完成"和"强制终止"

#### 步骤 1：定义 `TaskResult` 类型

在 `agent/types.ts` 中新增：

```typescript
export type TaskCompletionType = 'completed' | 'incomplete';

export interface TaskResult {
  content: string;
  completionType: TaskCompletionType;
  reason?: string;  // 强制终止的原因
}
```

#### 步骤 2：修改 ReActEngine.run() 返回类型和终止逻辑

将 `run()` 的返回类型从 `Promise<string>` 改为 `Promise<TaskResult>`。

5 种强制终止场景返回 `{ content: ..., completionType: 'incomplete', reason: '...' }`：
- 重复调用检测终止
- 连续空结果终止
- 连续同类工具终止
- 单步骤迭代超限终止
- 全局最大迭代次数终止

1 种自然完成场景返回 `{ content: ..., completionType: 'completed' }`：
- LLM 无工具调用（正常结束）

用户中止和 LLM 错误仍然抛出异常（保持现有行为）。

#### 步骤 3：修改 AgentRuntime.executePlannedTasks() 的步骤状态判定

根据 `TaskResult.completionType` 决定步骤状态：

```typescript
const stepResult = await this.engine.run(stepInput);

if (stepResult.completionType === 'completed') {
  plan = planner.updateStepStatus(plan, step.id, 'completed', stepResult.content);
} else {
  // incomplete - 强制终止，标记为 failed 并附带原因
  plan = planner.updateStepStatus(plan, step.id, 'failed', stepResult.content, stepResult.reason);
}
```

#### 步骤 4：修改 AgentRuntime.executeSingleTask() 的返回逻辑

单步骤任务也需要适配新的返回类型。

#### 步骤 5：修改 useAgentExecution.ts 中的结果处理

`execute()` 函数中需要从 `TaskResult` 中提取 `content` 用于显示。

#### 步骤 6：修改 ReActEngine 的状态标记

强制终止时 `updateStatus('completed')` 改为 `updateStatus('failed')`，使 AgentStatus 与 TaskPlanStep.status 保持一致。

#### 步骤 7：增强 callLLMStream 的流中断检测

在 `callLLMStream()` 返回前，检查是否收到了 `done` chunk。如果没有收到 `done` chunk 就结束了流，应该抛出异常而非静默返回部分内容。

---

## 涉及文件

| 文件 | 修改内容 |
|------|---------|
| `src/agent/types.ts` | 新增 `TaskResult`、`TaskCompletionType` 类型 |
| `src/agent/runtime/ReActEngine.ts` | `run()` 返回 `TaskResult`；5 种强制终止改为 `incomplete`；`updateStatus('failed')` |
| `src/agent/runtime/AgentRuntime.ts` | 根据 `completionType` 判定步骤状态；适配 `TaskResult` |
| `src/hooks/useAgentExecution.ts` | 从 `TaskResult` 提取 `content` |

## 风险评估

- **低风险**：`TaskResult` 是新增类型，不影响现有接口的消费者（只需从 `.content` 取值）
- **中风险**：将强制终止从 `completed` 改为 `failed` 可能影响 UI 显示逻辑（TodoCard 中失败步骤的展示），但这是期望的行为修正
- **需验证**：`executeSingleTask()` 路径的兼容性
