# Task Planner 实现与优化 - 开发记录

> 本文档记录了 Task Planner（任务规划器）的完整实现过程、架构设计及后续迭代优化。

***

## 一、整体架构

### 1.1 Plan-and-Execute 模式

```
用户输入 → TaskPlanner(任务分解) → TaskPlan(结构化计划) → AgentRuntime(逐步执行) → ReActEngine(每步独立循环)
```

- **TaskPlanner**：使用 LLM 将复杂任务分解为多个步骤，生成 `TaskPlan` JSON
- **AgentRuntime**：协调执行流程，按顺序执行每个步骤，传递上下文
- **ReActEngine**：每个步骤内独立运行 Thought→Action→Observation 循环

### 1.2 核心数据流

```
TaskPlan (后端)
  ↓ taskPlanToTodoItems()
TodoItem[] (前端 UI)
  ↓ 渲染
TodoCard / TodoContainer (任务看板)
```

### 1.3 文件清单

| 文件                                                                        | 职责                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [agent/types.ts](src/agent/types.ts)                                      | TaskPlanStep, TaskPlan, ToolCallProgress, ReasoningStep 类型定义 |
| [agent/planner/TaskPlanner.ts](src/agent/planner/TaskPlanner.ts)          | LLM 任务分解核心逻辑                                                 |
| [agent/planner/index.ts](src/agent/planner/index.ts)                      | 模块导出                                                         |
| [agent/runtime/AgentRuntime.ts](src/agent/runtime/AgentRuntime.ts)        | 执行引擎，协调 Plan→Execute 流程                                      |
| [agent/runtime/ReActEngine.ts](src/agent/runtime/ReActEngine.ts)          | ReAct 循环引擎，含循环检测、节流、工具进度                                     |
| [hooks/useAgentExecution.ts](src/hooks/useAgentExecution.ts)              | React Hook，桥接后端状态到前端 UI                                      |
| [components/TodoCard.tsx](src/components/TodoCard.tsx)                    | 任务看板 UI 组件                                                   |
| [components/ChatView.tsx](src/components/ChatView.tsx)                    | 对话视图，渲染消息/思考过程/任务看板                                          |
| [components/AgentExecutionView.ts](src/components/AgentExecutionView.tsx) | 工具授权弹窗等 Agent 执行相关 UI                                        |
| [types.ts](src/types.ts)                                                  | TodoItem, TodoStep 前端类型定义                                    |
| [App.tsx](src/App.tsx)                                                    | 主应用，连接所有组件与回调                                                |

***

## 二、数据结构

### 2.1 TaskPlan（后端）

```typescript
interface ToolCallProgress {
  toolName: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  summary?: string;
  result?: string;           // 工具返回内容（截断至500字符）
  error?: string;            // 错误信息
  observationData?: Array<{ title: string; url: string; snippet?: string }>; // 搜索结果
}

interface TaskPlanStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  toolHint?: string;
  dependsOn?: string[];
  result?: string;
  error?: string;
  toolCalls?: ToolCallProgress[];
}

interface TaskPlan {
  id: string;
  goal: string;
  steps: TaskPlanStep[];
  status: 'planning' | 'executing' | 'completed' | 'failed';
  currentStepIndex: number;
  createdAt: number;
  completedAt?: number;
}
```

### 2.2 TodoItem（前端）

```typescript
interface TodoStep {
  label: string;
  status: 'pending' | 'working' | 'completed' | 'failed';
  result?: string;
  error?: string;
  observationData?: Array<{ title: string; url: string; snippet?: string }>;
}

interface TodoItem {
  id: string;
  title: string;
  status: 'pending' | 'working' | 'completed' | 'failed';
  progress: number;
  description?: string;
  steps?: TodoStep[];
}
```

### 2.3 ReasoningStep（思考过程）

支持 8 种类型：

| type          | 标签   | 图标             | 颜色  | 用途       |
| ------------- | ---- | -------------- | --- | -------- |
| `thought`     | 思考   | 🧠 Brain       | 蓝色  | LLM 推理过程 |
| `action`      | 行动   | 🔧 Wrench      | 琥珀色 | 工具调用（旧）  |
| `observation` | 观察   | 👁 Eye         | 紫色  | 工具结果（旧）  |
| `planning`    | 规划   | 📋 ListTodo    | 靛蓝色 | 任务规划阶段   |
| `tool_start`  | 调用工具 | 🔧 Wrench      | 青色  | 工具开始执行   |
| `tool_result` | 工具结果 | ✅ CheckCircle2 | 翠绿色 | 工具执行完成   |
| `error`       | 错误   | ⚠ AlertCircle  | 红色  | 执行出错     |
| `summary`     | 总结   | 📄 FileText    | 青蓝色 | 步骤总结     |

***

## 三、关键实现细节

### 3.1 循环检测机制（ReActEngine）

实现了 **4 层** 循环检测：

```typescript
// 层级 1: 完全相同的工具调用（相同名称 + 相同参数）
const MAX_CONSECUTIVE_IDENTICAL_CALLS = 3;

// 层级 2: 连续无有效结果的工具调用
// 包括: 无输出、JS-only页面、权限拒绝、返回错误
const MAX_CONSECUTIVE_EMPTY_ACTIONS = 3;

// 层级 3: 连续使用同类工具（按类别分组）
// info_retrieval: web_search, fetch_url, http_request, scrape 等
const MAX_CONSECUTIVE_SIMILAR_ACTIONS = 5;

// 层级 4: 单步骤最大迭代次数（仅在有 TaskPlan 时生效）
const MAX_STEP_ITERATIONS = 10;
```

工具分类函数 `getToolCategory()`：

- `info_retrieval`: web\_search, fetch\_url, http\_request, scrape 等
- `filesystem`: read\_file, list\_directory
- `file_write`: write\_file, create\_file, edit\_file
- `shell`: execute\_shell, run\_command

**终止时的清理**：调用 `finalizeExecutingToolCounts()` 将所有 `executing` 状态的 toolCall 更新为 `failed`。

### 3.2 性能优化

#### ReActEngine 侧 - 节流更新

```typescript
const REASONING_UPDATE_THROTTLE_MS = 100;

// 使用 setTimeout 节流 reasoning step 更新
private throttledReasoningStepUpdate(step: ReasoningStep): void {
  this.pendingReasoningUpdate = step;
  if (!this.reasoningUpdateTimer) {
    this.reasoningUpdateTimer = setTimeout(() => {
      this.flushReasoningUpdate();
    }, REASONING_UPDATE_THROTTLE_MS);
  }
}
```

#### useAgentExecution 侧 - RAF 批量更新

```typescript
// 使用 requestAnimationFrame 合并同一帧内的多次 setState
function scheduleReasoningUpdate() {
  if (!reasoningUpdatePendingRef.current) {
    reasoningUpdatePendingRef.current = true;
    requestAnimationFrame(() => {
      setReasoningSteps([...reasoningStepsRef.current]);
      reasoningUpdatePendingRef.current = false;
    });
  }
}
```

### 3.3 内容累积防丢失

```typescript
// ReActEngine.run() 中维护 allContent 变量
let allContent = '';
// 每次 LLM 迭代时追加 response.content
allContent += response.content || '';

// App.tsx 中取较长者作为最终内容
const finalContent = streamedContent.length > result.length ? streamedContent : result;
```

### 3.4 Step Context 防 LLM 回显

将 Markdown 标题格式改为 `[INSTRUCTION:]` 标记格式：

```
// ❌ 会被 LLM 回显的格式
## Current Task
搜索Deepseek API价格信息

## Remaining Steps
- 搜索Kimi API价格

// ✅ 不会被回显的格式
[INSTRUCTION: Your current task is below. Focus ONLY on completing this specific task. Do NOT echo the task description back.]
搜索Deepseek API价格信息

[Context: Other remaining steps in the overall plan]
- 搜索Kimi API价格
```

### 3.5 MCP 文件系统工具回退策略

当配置了 MCP filesystem 服务器时：

1. **文件系统类内置工具不再被排除**（write\_file, read\_file, list\_directory）
2. **MCP 工具描述中添加限制提示**："此工具受允许目录限制。如果失败请使用内置 write\_file"
3. **内置工具描述中标注优势**："此工具无目录限制，可写入任意路径"

### 3.6 Token 统计修正

```typescript
// functionCalling.ts 中估算 token 时包含 reasoning_content
const totalOutputLength = accumulatedContent.length + accumulatedReasoningContent.length;
const estimatedOutputTokens = Math.ceil(totalOutputLength / 4);
```

GLM 等模型的思考过程可能非常长，不计算会导致估算严重偏低。

***

## 四、UI 设计规范

### 4.1 任务看板（TodoCard）

- 有 `todos` 时 AI 消息容器始终使用 `max-w-[85%] w-full`
- 每个 TodoStep 可点击展开查看详情
- 错误步骤显示红色圆点和 ❌ 图标
- 进行中步骤显示"进行中"标签和脉冲动画
- 搜索结果标题可点击跳转外部链接（使用 Tauri Shell 插件）
- 步骤失败时显示 ⚠️ "部分工具调用失败"警告

### 4.2 思考过程折叠卡片

- 当消息有 `todos` 时简化显示：
  - `tool_result` → "结果已记录到任务看板"
  - `error` → 截断的错误信息（60 字符）
  - 搜索结果不展开，只显示提示
- 当消息没有 `todos` 时保持完整显示

### 4.3 对话气泡显示条件

```tsx
// 只要消息有内容就显示，不受 agentExecution.status 影响
{msg.content || (...)}
```

这解决了"一闪而过"问题——之前只在 `responding`/`completed` 状态时显示，`acting`/`thinking` 时隐藏。

### 4.4 工具授权弹窗

与删除会话弹窗（ConfirmationModal）风格统一：

- 背景：`bg-white dark:bg-zinc-700` + 圆角 `rounded-xl` + 阴影 `shadow-2xl`
- 动画：`animate-in fade-in zoom-in duration-200`
- 关闭按钮：右上角 X 按钮
- 确认按钮：半透明橙色 `bg-orange-500/10 text-orange-600`
- 工具名根据类型显示对应图标（Globe/FileEdit/Terminal/Wrench）

### 4.5 命令模式布局

- Chat 容器添加 `overflow-hidden` 防止溢出
- Resize handle z-index 提升至 `z-30`
- AI 消息添加 `min-w-0` 防止 flex 子项溢出

***

## 五、已知问题与待改进

1. ~~**TaskPlanner 的 fallback 计划过于简单**~~：✅ 已修复（迭代 6）— 实现了 `heuristicDecompose` 基于关键词启发式分解，支持中英文复合任务模式匹配、多动词检测、连接词拆分三级回退
2. ~~**Token 估算仍不够精确**~~：✅ 已修复（迭代 6）— 统一了估算比例，区分 CJK/非 CJK 字符（CJK 约 1.5 字符/token，非 CJK 约 4 字符/token）；API 返回 usage 时仍优先使用真实数据
3. ~~**MCP 工具目录限制需要更好的 UX**~~：✅ 已修复（迭代 6）— 内置 read_file/list_directory 也标注了无目录限制优势；MCP 工具回退提示精确指向对应的内置工具
4. ~~**思考过程的 thought 内容可能很长**~~：✅ 已修复（迭代 6）— 新增 `ThoughtContent` 组件，超过 200 字符自动折叠，显示"展开全部 (N 字)"按钮
5. ~~**多步骤任务的上下文传递效率**~~：✅ 已修复（迭代 6）— `buildStepInput` 引入总字符数上限（4000）和自适应截断（步骤多时单步摘要 500 字符）；`currentMessages` 限制最多 12 条，超出时保留 system 消息 + 最近非 system 消息
6. ~~**命令模式下拖拽对话面板宽度严重掉帧**~~：✅ 已修复（迭代 7）— 移除 Chat 容器、ChatInput、CanvasWorkspace 中 `motion.div` 的 `layout` 属性；Chat 容器改用 CSS `transition` 替代 framer-motion 动画；resize mousemove 事件使用 `requestAnimationFrame` 节流；拖拽期间设置 `will-change: width` + `transition: none`
7. ~~**TodoCard 在命令模式下宽度溢出**~~：✅ 已修复（迭代 7）— 根本原因：`space-y-2` 容器上的 `items-start` 阻止 flex 子项拉伸到容器宽度，导致内容驱动的宽度溢出。修复：移除 `items-start`（改为默认 `items-stretch`），在 `flex-col gap-2` 容器添加 `min-w-0`，移除命令模式下的 `max-w-4xl` 限制
8. ~~**文件路径链接不可点击 / 含空格路径被截断**~~：✅ 已修复（迭代 7）— `ReActEngine.extractFilePath` 扩展支持 MCP 工具（检测 `path`/`file_path`/`destination` 参数中的绝对路径格式）；ChatView 和 TodoCard 新增 `linkifyFilePaths` 函数，使用前瞻正则 `(?:[^\s<>|*?"'。，！？；：（）、\]]| (?=[^\s<>|*?"'。，！？；：（）、\]]))+` 匹配含空格的路径；ReactMarkdown 的 `p`/`strong` 自定义组件中检测并链接化文件路径；链接样式统一为 `text-blue-500 text-xs`（比对话文本略小）

***

## 六、修改历史时间线

| 阶段   | 内容                                                    |
| ---- | ----------------------------------------------------- |
| 初始实现 | 创建 TaskPlanner + AgentRuntime Plan-and-Execute 架构     |
| 迭代 1 | 修复严重掉帧（RAF 节流）、无限循环（重复检测）、停止按钮无效                      |
| 迭代 2 | 修复对话气泡消失（status 条件放宽）、内容累积防丢失                         |
| 迭代 3 | 新增 8 种 ReasoningStep 类型、修复新循环模式（同类工具交替）、修复 context 回显 |
| 迭代 4 | 工具详情迁移到任务看板（ToolCallProgress 扩展）、TodoCard 可展开、思考过程简化  |
| 迭代 5 | 搜索结果超链接、循环终止状态清理、token 统计修正、宽度一致性、命令模式修复、弹窗样式统一       |
| 迭代 6 | fallback 启发式分解、CJK 感知 token 估算、MCP 回退提示精确化、thought 折叠组件、上下文传递效率优化 |
| 迭代 7 | 命令模式拖拽掉帧修复（移除 layout 动画+rAF 节流）、TodoCard 宽度溢出修复（items-start→items-stretch）、文件路径链接可点击化（含空格路径前瞻正则+MCP 工具支持）、Canvas 工作区 CodeMirror 6 重构（详见 [CANVAS_WORKSPACE.md](CANVAS_WORKSPACE.md)） |

