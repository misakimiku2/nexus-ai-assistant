# 思考过程 UI 优化文档

## 概述

本文档记录了对 AI Agent 思考过程显示界面的优化改进，包括推理步骤显示、流式输出、滚动行为、执行状态等多个方面的改进。

---

## 1. 推理步骤显示优化

### 1.1 移除嵌套标题

**问题**: 推理步骤被包裹在一个单独的 `<div>` 中，标题是"推理步骤"，造成视觉冗余。

**解决方案**: 移除"推理步骤"子标题，将推理步骤直接放在思考过程折叠卡片中。

**修改文件**: `src/components/ChatView.tsx`

**修改前结构**:
```
思考过程 (折叠卡片)
├── thinking 内容 (单独渲染)
└── 推理步骤 (嵌套div)
    ├── 思考: xxx
    ├── 行动: xxx
    └── 观察: xxx
```

**修改后结构**:
```
思考过程 (折叠卡片)
├── 思考: thinking内容 (如果有)
├── 思考: reasoningStep内容 (如果有)
├── 行动: xxx
└── 观察: xxx
```

### 1.2 整合 thinking 内容

**问题**: `msg.thinking` 和推理步骤中 `type === 'thought'` 的内容本质上是相同的，分开显示造成重复。

**解决方案**: 将 `thinking` 作为第一个"思考"步骤渲染，与后续推理步骤统一格式。

### 1.3 取消高度限制

**问题**: 思考过程内容被 `max-h-60 overflow-y-auto` 限制高度，内容被截断。

**解决方案**: 移除高度限制，让内容完整显示。

**修改**: `src/components/ChatView.tsx` 第463行，移除 `max-h-60 overflow-y-auto` 样式。

### 1.4 取消文本截断

**问题**: 思考步骤内容被 `line-clamp-3` 限制为3行，超出部分被截断。

**解决方案**: 移除 `line-clamp-3` 类，让内容完整显示。

---

## 2. 步骤数显示修正

### 2.1 问题

显示的是 `iterationCount`（迭代次数），而不是实际的推理步骤数。

### 2.2 原因分析

- `iterationCount` 在每次循环+1
- `stepCounter` 在每添加一个推理步骤+1
- 每次迭代可能产生多个步骤（思考、行动、观察）

### 2.3 解决方案

将显示的步骤数从 `iterationCount` 改为 `(msg.thinking ? 1 : 0) + (msg.agentExecution?.reasoningSteps?.length || 0)`

**修改文件**: `src/components/ChatView.tsx` 第451-455行

---

## 3. 流式输出支持

### 3.1 推理步骤流式输出

**问题**: 推理步骤是在内容完全累积后才添加的，用户无法看到实时的思考过程。

**解决方案**: 实现推理步骤的流式更新。

**修改文件**:
- `src/agent/types.ts` - 添加 `isStreaming` 字段和 `onReasoningStepUpdate` 回调
- `src/agent/runtime/ReActEngine.ts` - 实现流式推理步骤
- `src/hooks/useAgentExecution.ts` - 添加步骤更新处理
- `src/agent/runtime/AgentRuntime.ts` - 传递新回调
- `src/agent/runtime/AgentState.ts` - 添加 `updateReasoningStep` 方法

**新增类型定义**:
```typescript
export interface ReasoningStep {
  id: string;
  type: 'thought' | 'action' | 'observation';
  content: string;
  timestamp: number;
  toolCallId?: string;
  isStreaming?: boolean;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  observationData?: Array<{ title: string; url: string; snippet?: string }>;
  executionStatus?: 'executing' | 'completed';
}
```

### 3.2 最终回复流式输出

**问题**: 最终回复没有流式输出，而是一次性显示。

**解决方案**: 添加 `responding` 状态，在最终回复时启用流式显示。

**修改文件**:
- `src/agent/types.ts` - 添加 `responding` 状态
- `src/agent/runtime/ReActEngine.ts` - 在收到 content 时设置 responding 状态
- `src/components/ChatView.tsx` - 在 responding 状态时显示流式内容

**状态流程**:
```
thinking → 思考过程（流式显示推理步骤）
acting → 执行工具调用
responding → 输出最终回复（流式显示内容）
completed → 完成
```

---

## 4. 回复气泡显示控制

### 4.1 问题

思考过程中，模型返回的 `content`（如"我将调用web_search工具..."）会显示在一个气泡中，但此时思考过程还未完成。

### 4.2 解决方案

只在以下情况下显示回复气泡：
1. 思考过程完成后：`msg.content` 存在 + `msg.agentExecution?.status === 'responding'` 或 `'completed'`
2. 普通对话模式：`msg.content` 存在 + 没有 `agentExecution`

**修改文件**: `src/components/ChatView.tsx` 第574行

---

## 5. 等待动画恢复

### 5.1 问题

发送消息后，"模型正在处理 Prompt..."的等待动画消失了。

### 5.2 原因

在 Agent 模式下，`isWaitingForResponse` 在 `handleExecutionUpdate` 回调时没有被设置为 false。

### 5.3 解决方案

在 `handleExecutionUpdate` 中，当推理步骤开始或状态变为 `responding` 时，设置 `setIsWaitingForResponse(false)`。

**修改文件**: `src/App.tsx` 第149-152行

---

## 6. 滚动行为优化

### 6.1 问题

流式输出时强制滚动到底部，用户无法自由查看历史消息。

### 6.2 解决方案

实现智能滚动检测：
1. 检测用户向上滚动时，停止自动滚动
2. 检测用户滚动到底部时，恢复自动滚动
3. 发送新消息时重置滚动状态
4. 使用平滑滚动动画

**修改文件**:
- `src/components/ChatView.tsx` - 添加滚动检测逻辑
- `src/App.tsx` - 添加 `scrollResetKey` 状态

**核心逻辑**:
```typescript
const userScrolledRef = useRef(false);
const lastScrollTopRef = useRef(0);

// 检测用户滚动意图
useEffect(() => {
  const handleScroll = () => {
    const scrollDirection = currentScrollTop - lastScrollTopRef.current;
    const isAtBottom = currentScrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 30;
    
    if (scrollDirection < 0 && !isAtBottom) {
      userScrolledRef.current = true;  // 用户向上滚动
    } else if (isAtBottom) {
      userScrolledRef.current = false;  // 用户回到底部
    }
  };
}, []);

// 只在用户没有向上滚动时自动滚动
useEffect(() => {
  if (scrollRef.current && !userScrolledRef.current) {
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }
}, [messages, isStreaming]);
```

---

## 7. 行动步骤显示格式优化

### 7.1 问题

行动步骤显示原始的工具调用信息，如：
```
Calling tool: web_search({"query":"尘白禁区 2026 最新 动态","max_results":5})
```

### 7.2 解决方案

简化为友好的格式：
```
使用网络搜索：尘白禁区 2026 最新 动态
```

**修改文件**:
- `src/agent/types.ts` - 添加 `toolName`、`toolParams` 字段
- `src/agent/runtime/ReActEngine.ts` - 解析工具调用参数
- `src/components/ChatView.tsx` - 渲染优化后的显示格式

**工具名称映射**:
```typescript
const toolNames: Record<string, string> = {
  'web_search': '网络搜索',
  'http_request': 'HTTP请求',
  'calculate': '计算',
  'get_current_time': '获取时间',
};
```

---

## 8. 观察步骤显示格式优化

### 8.1 问题

观察步骤显示完整的 JSON 数据，包含标题、URL、snippet，信息过载。

### 8.2 解决方案

只显示可点击的标题列表，点击后在新标签页打开对应网页。

**修改文件**:
- `src/agent/types.ts` - 添加 `observationData` 字段
- `src/agent/runtime/ReActEngine.ts` - 解析搜索结果
- `src/components/ChatView.tsx` - 渲染可点击的标题

**外部链接处理**:
```typescript
const openExternalLink = async (url: string) => {
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};
```

---

## 9. 执行状态显示

### 9.1 问题

行动步骤没有显示执行状态，用户不知道工具是否正在执行。

### 9.2 解决方案

在行动步骤后显示执行状态标签：
- 执行中：黄色标签 `执行中...`
- 执行完成：绿色标签 `执行完成`

**修改文件**:
- `src/agent/types.ts` - 添加 `executionStatus` 字段
- `src/agent/runtime/ReActEngine.ts` - 更新执行状态
- `src/components/ChatView.tsx` - 显示状态标签

**显示效果**:
```
行动
使用网络搜索：尘白禁区 最近 动态  [执行中...]
```

执行完成后：
```
行动
使用网络搜索：尘白禁区 最近 动态  [执行完成]
```

---

## 10. 联网搜索结果同步

### 10.1 问题

web_search 的搜索结果没有同步到右侧面板的"联网搜索结果"中。

### 10.2 原因

`onToolCall` 回调在工具执行之前就被触发，此时 `record.status` 是 `pending`，没有结果数据。

### 10.3 解决方案

将 `onToolCall` 回调从工具执行前移动到工具执行后，确保 `record.result` 包含完整的执行结果。

**修改文件**: `src/agent/runtime/ReActEngine.ts`

**数据流**:
```
ReActEngine 执行 web_search 完成
    ↓
onToolCall(record) 包含 result 字段
    ↓
useAgentExecution 检查 toolRecord.result?.output
    ↓
parseWebSearchResults 解析结果
    ↓
onWebSearchResult(query, results)
    ↓
App.tsx handleWebSearchResult 添加到 searchGroups
    ↓
ToolPanel 显示联网搜索结果卡片
```

---

## 11. 折叠卡片交互优化

### 11.1 问题

点击"思考过程"折叠卡片的内容区域无法折叠卡片。

### 11.2 解决方案

给内容区域添加点击事件，点击任意位置可以折叠/展开卡片，同时阻止链接点击事件冒泡。

**修改文件**: `src/components/ChatView.tsx`

**修改内容**:
1. 内容区域添加 `onClick={toggleOpen}` 和 `cursor-pointer` 样式
2. 链接点击时调用 `e.stopPropagation()` 阻止事件冒泡

---

## 修改文件汇总

| 文件 | 修改内容 |
|------|----------|
| `src/agent/types.ts` | 添加 `isStreaming`、`toolName`、`toolParams`、`observationData`、`executionStatus` 字段；添加 `responding` 状态 |
| `src/agent/runtime/ReActEngine.ts` | 实现流式推理步骤；添加执行状态更新；移动 `onToolCall` 回调位置 |
| `src/agent/runtime/AgentRuntime.ts` | 传递 `onReasoningStepUpdate` 回调；添加 `result` 字段到回调 |
| `src/agent/runtime/AgentState.ts` | 添加 `updateReasoningStep` 方法 |
| `src/hooks/useAgentExecution.ts` | 添加步骤更新处理 |
| `src/components/ChatView.tsx` | UI 样式调整；滚动优化；折叠交互优化；外部链接处理 |
| `src/App.tsx` | 添加 `scrollResetKey` 状态；优化滚动重置 |

---

## 版本信息

- 文档创建日期: 2026-03-21
- 最后更新: 2026-03-21
