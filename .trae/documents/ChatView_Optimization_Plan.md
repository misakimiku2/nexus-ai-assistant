# ChatView 组件优化计划

## 问题分析

### 当前问题
1. 用户发送消息后立即出现空白的"思考折叠卡片"，显示"步骤0"和"模型正在处理prompt"
2. 同时出现AI模型的空对话气泡
3. 推理步骤中行动、观察突然蹦出，没有思考过程
4. 有单独的"工具调用"卡片显示在折叠卡片下方
5. **步骤计数始终显示为0，从未更新**

### 期望的流程
1. 用户发送消息
2. 只显示"模型正在处理prompt..."动画状态
3. 模型处理完prompt后，出现推理折叠卡片
4. 折叠卡片流式输出：思考 -> 行动（工具调用）-> 观察 -> 思考（再次思考）
5. 最终回答用户问题（流式输出）
6. 步骤计数应正确显示当前迭代次数

---

## 实施步骤

### 步骤 1：修改消息状态显示逻辑（ChatView.tsx）

**目标：** 在模型开始思考前，只显示"模型正在处理prompt"状态，不显示任何卡片

**修改位置：** ChatView.tsx 第 628-679 行

**具体修改：**
- 移除在 `isWaitingForResponse` 时显示空白思考卡片的逻辑
- 只保留"模型正在处理prompt"的动画提示
- 思考折叠卡片应在 `msg.thinking` 或 `msg.agentExecution.reasoningSteps.length > 0` 时才显示

---

### 步骤 2：优化推理步骤显示条件

**目标：** 只有当有实际推理步骤时才显示折叠卡片

**修改位置：** ChatView.tsx 第 439 行

**原逻辑：**
```tsx
{(msg.thinking || msg.agentExecution) && (
```

**新逻辑：**
```tsx
{(msg.thinking || (msg.agentExecution && msg.agentExecution.reasoningSteps.length > 0)) && (
```

---

### 步骤 3：移除单独的"工具调用"卡片

**目标：** 行动步骤已经包含工具调用信息，不需要单独显示工具调用卡片

**修改位置：** ChatView.tsx 第 515-563 行

**具体修改：**
- 删除整个 `msg.agentExecution.toolCalls.length > 0` 的显示块
- 工具调用信息应该融合在"行动"步骤的显示中

---

### 步骤 4：优化 defaultOpen 条件

**目标：** 折叠卡片只在有实际内容时才默认展开

**修改位置：** ChatView.tsx 第 461 行

**原逻辑：**
```tsx
defaultOpen={isStreaming && msg.id === messages[messages.length - 1]?.id}
```

**新逻辑：**
```tsx
defaultOpen={isStreaming && msg.id === messages[messages.length - 1]?.id && (msg.thinking || (msg.agentExecution && msg.agentExecution.reasoningSteps.length > 0))}
```

---

### 步骤 5：修复步骤计数不更新问题

**问题分析：**
- 步骤计数在 ChatView.tsx 第 451-455 行显示
- 数据通过 `handleExecutionUpdate` 回调从 `useAgentExecution` hook 更新
- `iterationCount` 通过定时器从 `agentStateManager.getState()` 获取
- `handleExecutionUpdate` 正确更新 `msg.agentExecution.iterationCount`

**可能原因：**
1. `useAgentExecution` hook 中的 `onExecutionUpdate` 回调没有正确触发
2. `iterationCount` 状态更新后 React 没有重新渲染

**检查点（App.tsx）：**
- `handleExecutionUpdate` 在第 143-169 行正确定义
- 依赖项包含 `setMessages`
- 回调通过 `useMemo` 正确传递给 `useAgentExecution`

**验证 App.tsx 第 206-210 行：**
```tsx
useMemo(() => ({
  onWebSearchResult: handleWebSearchResult,
  onExecutionUpdate: handleExecutionUpdate,
  onContentChunk: handleContentChunk,
}), [handleWebSearchResult, handleExecutionUpdate, handleContentChunk])
```

**需要添加的修复：**
在 `handleExecutionUpdate` 中添加调试日志，确认回调被调用。如果确认回调正常但 UI 不更新，需要检查 `useAgentExecution` 中的 `notifyExecutionUpdate` 是否在 `iterationCount` 变化时被调用。

---

### 步骤 6：调整"模型正在处理prompt"显示位置

**目标：** 这个状态应该在正确的位置显示，而不是作为空白气泡

**修改位置：** ChatView.tsx 第 648-679 行

**具体修改：**
- 确保这个提示只在没有任何内容时显示（无 content、无 thinking、无 reasoningSteps）
- 提示应该显示在正确的消息气泡区域内

---

## 代码修改详细说明

### ChatView.tsx 修改点

#### 修改点 1：第 439 行 - 折叠卡片显示条件
```tsx
// 原：
{(msg.thinking || msg.agentExecution) && (

// 改：
{(msg.thinking || (msg.agentExecution && msg.agentExecution.reasoningSteps.length > 0)) && (
```

#### 修改点 2：第 451-455 行 - 步骤计数显示
确保 `msg.agentExecution.iterationCount` 被正确显示。

#### 修改点 3：第 461 行 - defaultOpen 条件
```tsx
// 原：
defaultOpen={isStreaming && msg.id === messages[messages.length - 1]?.id}

// 改：
defaultOpen={isStreaming && msg.id === messages[messages.length - 1]?.id && (msg.thinking || (msg.agentExecution && msg.agentExecution.reasoningSteps.length > 0))}
```

#### 修改点 4：第 515-563 行 - 移除工具调用单独卡片
删除整个 `msg.agentExecution.toolCalls.length > 0` 块。

#### 修改点 5：第 628-679 行 - 处理"模型正在处理prompt"
调整条件确保只在没有其他内容时显示。

---

## 预期效果

1. 用户发送消息后，底部显示"模型正在处理prompt..."动画
2. 收到首个推理步骤后，展开思考折叠卡片
3. 折叠卡片内流式显示：思考 -> 行动（含工具信息）-> 观察 -> 思考
4. 折叠卡片标题右侧正确显示当前步骤数（如"步骤1"、"步骤2"等）
5. 推理完成后，开始流式输出最终回答
6. 不再显示空白卡片或单独的"工具调用"区块
