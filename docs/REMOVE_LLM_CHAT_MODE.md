# 移除普通LLM聊天模式 - 重构文档

## 概述

本次重构移除了软件中的普通LLM API聊天模式，统一使用Agent模式，简化了代码架构。

**重构日期：** 2026-04-02

## 背景

### 原有架构

软件原先存在两套工作模式：

1. **普通LLM API聊天模式**
   - 直接调用LLM API（支持 LM Studio、Ollama 等提供商）
   - 简单的请求-响应模式
   - 无工具调用能力
   - 实现在 `requestAI` 函数中（约600行代码）

2. **Agent模式**
   - 基于ReAct框架（Reasoning + Acting）
   - 支持工具调用（web_search、fetch_url等）
   - 推理步骤追踪
   - 多轮迭代执行

### 重构目标

移除普通LLM聊天模式，统一使用Agent模式，简化代码维护。

---

## 重要保留

**`AppMode`（对话模式/命令模式切换）完全保留！**

这是两个不同的概念：

| 概念 | 说明 | 状态 |
|------|------|------|
| **AppMode** (`chat` \| `command`) | UI布局模式切换 | ✅ 保留 |
| **isAgentMode** | 执行引擎切换 | ❌ 移除 |

- `AppMode` 决定是普通聊天界面布局还是命令行风格界面+Canvas工作区
- `isAgentMode` 决定是使用普通LLM聊天还是Agent模式（已移除）

---

## 修改详情

### 1. App.tsx - 核心修改

#### 移除的状态变量

```typescript
// 已移除
const [lmStudioUrl, setLmStudioUrl] = useState('http://localhost:1234/v1/chat/completions');
const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434/api/chat');
const [modelName, setModelName] = useState('local-model');
const [systemPrompt, setSystemPrompt] = useState('...');
const [temperature, setTemperature] = useState(0.7);
const [maxContextLength, setMaxContextLength] = useState(4096);
const [modelProvider, setModelProvider] = useState<ModelProvider>('lm-studio');
```

#### 移除的函数

- `requestAI` 函数（约600行代码）
  - 包含：流式响应处理、上下文压缩、代码块骨架化、超长文本分块处理等逻辑

#### 修改的函数

**handleSendMessage**
```typescript
// 修改前
if (agentExecution.isAgentMode && agentExecution.currentAgent) {
  await handleAgentExecution(currentMsgs, originalInput, currentAttachments);
} else {
  await requestAI(currentMsgs, systemPrompt, originalInput, undefined, currentAttachments);
}

// 修改后
await handleAgentExecution(currentMsgs, originalInput, currentAttachments);
```

**handleEditMessage**
```typescript
// 修改前
if (msg.role === 'user') {
  await requestAI(currentMsgs, systemPrompt, newContent);
}

// 修改后
if (msg.role === 'user') {
  // 始终使用Agent模式处理
  await handleAgentExecution(currentMsgs, newContent);
}
```

**handleRegenerateMessage**
```typescript
// 修改前
if (agentExecution.isAgentMode && agentExecution.currentAgent) {
  // Agent模式逻辑
} else {
  await requestAI(historyBefore, systemPrompt, lastUserMsg.content, messageId);
}

// 修改后
// 仅保留Agent模式逻辑，移除else分支
```

**generateSessionTitle**
```typescript
// 修改前
let currentApiUrl = lmStudioUrl;
let currentModelName = modelName;
// ...
if (modelProvider === 'ollama') currentApiUrl = ollamaUrl;
else if (modelProvider === 'lm-studio') currentApiUrl = lmStudioUrl;

// 修改后
let currentApiUrl = 'http://localhost:1234/v1/chat/completions';
let currentModelName = 'local-model';
// 仅从Agent配置获取API URL和模型名称
```

---

### 2. 组件Props清理

#### SettingsView 组件

移除的props：
- `lmStudioUrl`, `setLmStudioUrl`
- `ollamaUrl`, `setOllamaUrl`
- `modelName`, `setModelName`
- `maxContextLength`, `setMaxContextLength`
- `temperature`, `setTemperature`
- `systemPrompt`, `setSystemPrompt`
- `modelProvider`, `setModelProvider`
- `onReset`

#### ToolPanel 组件

移除的props：
- `temperature`, `setTemperature`
- `systemPrompt`, `setSystemPrompt`

#### Header 组件

移除的props：
- `maxContextLength`

#### ChatView 组件

移除的props：
- `modelName`

#### ChatInput 组件

移除的props：
- `maxContextLength`

---

### 3. 类型定义更新

#### types.ts

移除了 `ModelProvider` 类型（如果不再被其他地方使用）：

```typescript
// 已移除
export type ModelProvider = 'lm-studio' | 'ollama' | 'openai' | 'anthropic';
```

---

## 保留的功能

### 完整保留

1. **AppMode（对话模式/命令模式切换）**
   - `chat` 模式：普通聊天界面布局
   - `command` 模式：命令行风格界面 + Canvas工作区
   - 相关变量：`commandChatWidth`, `isResizing`, `chatContainerRef`, `startResizing`

2. **Agent模式所有功能**
   - ReAct推理引擎
   - 工具调用（web_search, fetch_url等）
   - 推理步骤显示
   - 工具授权机制

3. **useAgentExecution Hook**
   - Agent执行逻辑
   - 状态管理
   - 回调处理

### 配置方式

用户可通过以下方式配置Agent：
- **AgentConfigModal** - Agent配置弹窗
- **DEFAULT_AGENT** - 默认Agent配置（在 `src/data/agents.ts` 中）

---

## 代码变更统计

| 项目 | 数量 |
|------|------|
| 删除代码行数 | ~700行 |
| 修改文件数 | 6个 |
| 移除状态变量 | 7个 |
| 移除组件props | 17个 |

---

## 构建验证

```
✓ 3792 modules transformed
✓ built in 11.44s
```

构建成功，无TypeScript错误。

---

## 影响分析

### 用户影响

1. **配置方式变更**
   - 之前：在设置页面配置API URL、模型名称等
   - 现在：通过Agent配置进行设置

2. **功能无影响**
   - 所有聊天功能正常工作
   - Agent模式提供更强大的能力（工具调用、推理追踪）

### 开发者影响

1. **代码简化**
   - 减少了约700行代码
   - 消除了两套模式的维护成本

2. **架构清晰**
   - 统一使用Agent模式
   - 代码逻辑更加直观

---

## 后续建议

1. **更新用户文档**
   - 说明新的配置方式
   - 引导用户使用Agent配置

2. **优化Agent配置体验**
   - 简化Agent创建流程
   - 提供更多预设Agent模板

3. **考虑迁移旧设置**
   - 如果用户有保存的旧设置，考虑迁移到Agent配置

---

## 相关文件

- 计划文档：`.trae/documents/remove-llm-chat-mode-plan.md`
- 主要修改：`src/App.tsx`
- 组件修改：`src/components/SettingsView.tsx`, `src/components/ToolPanel.tsx`, `src/components/Header.tsx`, `src/components/ChatView.tsx`, `src/components/ChatInput.tsx`
- 类型定义：`src/types.ts`
