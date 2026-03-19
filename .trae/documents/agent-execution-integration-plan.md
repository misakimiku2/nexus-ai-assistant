# Agent 执行视图集成与联网搜索结果展示计划

## 需求分析

### 1. AgentExecutionView 集成到思考折叠面板
**当前状态：**
- `AgentExecutionView` 组件独立显示在 `App.tsx` 中，位于 ChatView 下方
- ChatView 中已有 `CollapsibleSection` 组件用于显示"思考过程"折叠面板
- 思考折叠面板目前只显示 `msg.thinking` 内容

**目标：**
- 将 Agent 执行过程中的推理步骤（reasoningSteps）和工具调用（toolCalls）集成到思考折叠面板中
- 支持流式输出，实时更新显示
- 保持现有的思考内容显示功能

### 2. web_search 工具结果集成到右侧面板
**当前状态：**
- ToolPanel 右侧面板已有"联网搜索结果"区域
- 当前搜索结果来自 `App.tsx` 中的 `invoke('search')` 调用
- Agent 执行时的 `web_search` 工具结果未同步到右侧面板

**目标：**
- 当 Agent 使用 `web_search` 工具时，搜索结果同步显示在 ToolPanel 的"联网搜索结果"区域
- 搜索结果按会话分组显示

---

## 实现步骤

### 步骤 1: 扩展 Message 类型支持 Agent 执行数据
**文件：** `src/types.ts`

添加以下字段到 `Message` 接口：
- `agentExecution?: AgentExecutionData` - 存储 Agent 执行数据

```typescript
interface AgentExecutionData {
  reasoningSteps: ReasoningStep[];
  toolCalls: ToolCallRecord[];
  iterationCount: number;
  status: AgentStatus;
}
```

### 步骤 2: 修改 ChatView 思考折叠面板
**文件：** `src/components/ChatView.tsx`

修改 `CollapsibleSection` 中的思考面板：
1. 接收 Agent 执行数据作为 props
2. 在思考内容下方显示推理步骤列表
3. 显示工具调用记录
4. 显示迭代计数和状态
5. 支持流式更新时的自动展开

### 步骤 3: 修改 App.tsx 传递 Agent 执行数据
**文件：** `src/App.tsx`

1. 在 `handleAgentExecution` 中实时更新消息的 `agentExecution` 字段
2. 将 `agentExecution` 状态传递给 ChatView
3. 移除底部独立的 `AgentExecutionView` 组件

### 步骤 4: 修改 useAgentExecution Hook
**文件：** `src/hooks/useAgentExecution.ts`

1. 添加回调函数支持实时更新
2. 当 `web_search` 工具执行成功时，触发回调将结果传递出去

### 步骤 5: 实现 web_search 结果同步
**文件：** `src/App.tsx` 和 `src/hooks/useAgentExecution.ts`

1. 在 `useAgentExecution` 中添加 `onWebSearchResult` 回调
2. 当检测到 `web_search` 工具调用成功时，解析结果并调用回调
3. 在 `App.tsx` 中接收回调，更新 `searchGroups` 状态

### 步骤 6: 优化流式输出体验
**文件：** `src/components/ChatView.tsx`

1. 使用 `useEffect` 监听 Agent 执行状态变化
2. 当有新的推理步骤时自动滚动到底部
3. 添加动画效果增强用户体验

---

## 详细实现方案

### 1. 类型定义扩展

```typescript
// src/types.ts
import { AgentStatus, ReasoningStep, ToolCallRecord } from './agent/types';

export interface AgentExecutionData {
  reasoningSteps: ReasoningStep[];
  toolCalls: ToolCallRecord[];
  iterationCount: number;
  status: AgentStatus;
}

export interface Message {
  // ... 现有字段
  agentExecution?: AgentExecutionData;
}
```

### 2. ChatView 组件修改

在 `CollapsibleSection` 内部添加 Agent 执行视图：

```tsx
{msg.agentExecution && msg.agentExecution.reasoningSteps.length > 0 && (
  <div className="agent-execution-view">
    {/* 推理步骤列表 */}
    {/* 工具调用记录 */}
    {/* 状态指示器 */}
  </div>
)}
```

### 3. web_search 结果同步

在 `useAgentExecution` 中检测 web_search 结果：

```typescript
onToolCall: (record) => {
  if (record.toolName === 'web_search' && record.status === 'success') {
    const results = parseSearchResults(record.result?.output);
    onWebSearchResult?.(results);
  }
}
```

---

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/types.ts` | 添加 `AgentExecutionData` 类型，扩展 `Message` 接口 |
| `src/components/ChatView.tsx` | 修改思考折叠面板，集成 Agent 执行视图 |
| `src/App.tsx` | 传递 Agent 执行数据，处理 web_search 结果同步 |
| `src/hooks/useAgentExecution.ts` | 添加 web_search 结果回调，支持实时更新 |
| `src/context/GlobalStateContext.tsx` | 可能需要更新消息类型定义 |

---

## 预期效果

1. **思考折叠面板增强**：
   - 显示 AI 的思考过程（原有功能）
   - 显示 Agent 的推理步骤（Thought → Action → Observation）
   - 显示工具调用状态和结果
   - 流式输出时实时更新

2. **联网搜索结果同步**：
   - Agent 使用 web_search 工具时，结果自动显示在右侧面板
   - 与手动触发的搜索结果统一管理
   - 按会话分组，支持展开/折叠

---

## 注意事项

1. 保持向后兼容，非 Agent 模式下思考面板正常工作
2. 流式输出时避免频繁重渲染导致性能问题
3. web_search 结果解析需要处理不同格式的返回数据
