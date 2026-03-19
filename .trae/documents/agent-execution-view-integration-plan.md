# Agent 执行视图集成计划

## 目标

1. 将 `AgentExecutionView` 组件集成到 ChatView 的"思考过程"折叠面板中
2. 支持 Agent 推理步骤的流式输出
3. 将 `web_search` 工具的搜索结果同步到右侧面板的"联网搜索结果"中

## 当前状态分析

### 现有组件

1. **ChatView.tsx** - 消息列表组件
   - 已有 `CollapsibleSection` 组件用于显示"思考过程"
   - `msg.thinking` 字段存储思考内容
   - 使用 `<think/>` 标签提取思考内容

2. **AgentExecutionView.tsx** - Agent 执行视图
   - 显示推理步骤（Thought/Action/Observation）
   - 显示工具调用记录
   - 当前独立于消息显示

3. **ToolPanel.tsx** - 右侧工具面板
   - `SearchGroupCard` 组件显示搜索结果
   - `searchGroups` 状态管理搜索组

4. **ReActEngine.ts** - ReAct 推理引擎
   - 当前使用非流式 LLM 调用
   - 需要支持流式输出

## 实施步骤

### Phase 1: 修复 ReActEngine 语法错误

**文件**: `src/agent/runtime/ReActEngine.ts`

修复 `updateStatus` 方法调用语法错误。

### Phase 2: 集成 AgentExecutionView 到思考面板

**文件**: `src/components/ChatView.tsx`

1. 扩展 `Message` 类型，添加 Agent 执行相关字段：
   ```typescript
   interface Message {
     // ... 现有字段
     agentReasoningSteps?: ReasoningStep[];
     agentToolCalls?: ToolCallRecord[];
     agentStatus?: AgentStatus;
   }
   ```

2. 修改 `CollapsibleSection` 中的"思考过程"面板：
   - 合并 `msg.thinking` 和 Agent 推理步骤
   - 使用 `AgentExecutionView` 的内部组件渲染推理步骤
   - 支持流式更新动画

### Phase 3: 实现流式输出

**文件**: `src/agent/runtime/ReActEngine.ts`

1. 添加流式回调接口：
   ```typescript
   interface StreamCallbacks {
     onThought: (content: string) => void;
     onAction: (toolName: string, params: any) => void;
     onObservation: (result: string) => void;
     onStatusChange: (status: AgentStatus) => void;
   }
   ```

2. 修改 `run` 方法支持流式回调

**文件**: `src/agent/llm/functionCalling.ts`

1. 使用 `streamLLMWithTools` 替代 `callLLMWithTools`
2. 实时解析并返回推理内容

### Phase 4: 搜索结果同步到右侧面板

**文件**: `src/agent/tools/builtin.ts`

1. 修改 `createWebSearchTool`，添加回调机制：
   ```typescript
   interface SearchToolCallbacks {
     onSearchStart: (query: string) => void;
     onSearchResult: (results: SearchResult[]) => void;
   }
   ```

**文件**: `src/hooks/useAgentExecution.ts`

1. 添加搜索结果回调
2. 调用 `setSearchGroups` 更新搜索结果

**文件**: `src/App.tsx`

1. 传递 `setSearchGroups` 到 agentExecution hook
2. 在工具调用时更新搜索结果

### Phase 5: UI 细节优化

1. 推理步骤显示优化：
   - Thought: 蓝色，脑图标
   - Action: 橙色，工具图标
   - Observation: 紫色，眼睛图标

2. 流式输出动画：
   - 打字机效果
   - 加载动画

3. 搜索结果联动：
   - 自动展开右侧面板
   - 高亮新搜索结果

## 文件修改清单

| 文件 | 修改内容 |
|------|---------|
| `src/agent/runtime/ReActEngine.ts` | 修复语法错误，添加流式回调 |
| `src/agent/llm/functionCalling.ts` | 优化流式解析 |
| `src/agent/tools/builtin.ts` | 添加搜索结果回调 |
| `src/types.ts` | 扩展 Message 类型 |
| `src/components/ChatView.tsx` | 集成 Agent 执行视图到思考面板 |
| `src/hooks/useAgentExecution.ts` | 添加搜索结果同步逻辑 |
| `src/App.tsx` | 传递搜索结果回调 |

## 预期效果

1. 用户发送消息后，思考面板实时显示 Agent 推理过程
2. Agent 调用 `web_search` 时，搜索结果自动显示在右侧面板
3. 推理步骤支持流式输出，用户可以看到实时进展
4. 工具调用状态清晰可见（执行中/成功/失败）
