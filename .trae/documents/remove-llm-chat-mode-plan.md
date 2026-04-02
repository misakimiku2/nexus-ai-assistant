# 移除普通LLM聊天模式，仅保留Agent模式

## 概述

当前软件存在两套工作模式：

1. **普通LLM API聊天模式** - 直接调用LLM API，无工具调用能力
2. **Agent模式** - 基于ReAct框架，支持工具调用、推理步骤追踪

本计划将移除普通LLM聊天模式，统一使用Agent模式，简化代码架构。

## 重要说明：不影响的功能

**`AppMode`（对话模式/命令模式切换）将完全保留！**

这是两个不同的概念：

* **AppMode (`chat`** **|** **`command`)** - UI布局模式切换

  * `chat` 模式：普通聊天界面布局

  * `command` 模式：命令行风格界面 + Canvas工作区

  * 这个切换功能**不会被移除**

* **isAgentMode** - 执行引擎切换（本次移除的目标）

  * 普通LLM聊天 vs Agent模式

  * 这个切换逻辑**将被移除**，统一使用Agent模式

***

## 需要修改的文件

### 1. `src/App.tsx` - 核心修改

**移除的内容：**

* `modelProvider` 状态及其 setter

* `lmStudioUrl` 状态（移至Agent配置）

* `ollamaUrl` 状态（移至Agent配置）

* `modelName` 状态（移至Agent配置）

* `systemPrompt` 状态（移至Agent配置）

* `temperature` 状态（移至Agent配置）

* `maxContextLength` 状态（移至Agent配置）

* `requestAI` 函数（约400行代码）

* `generateSessionTitle` 函数中的普通聊天逻辑

* `handleEditMessage` 中的普通聊天逻辑

* `handleRegenerateMessage` 中的普通聊天逻辑

* `SettingsView` 组件的相关props

**修改的内容：**

* `handleSendMessage` - 移除条件判断，始终使用 `handleAgentExecution`

* `handleEditMessage` - 始终使用Agent模式重新执行

* `handleRegenerateMessage` - 始终使用Agent模式重新生成

* `generateSessionTitle` - 使用当前Agent的配置

### 2. `src/components/SettingsView.tsx` - 设置页面

**移除的内容：**

* `lmStudioUrl`, `setLmStudioUrl` props

* `ollamaUrl`, `setOllamaUrl` props

* `modelName`, `setModelName` props

* `maxContextLength`, `setMaxContextLength` props

* `temperature`, `setTemperature` props

* `systemPrompt`, `setSystemPrompt` props

* `modelProvider`, `setModelProvider` props

* `onReset` prop

* AI模型设置相关的UI（provider选择、API URL配置、模型选择等）

* `onlineApiKey`, `onlineProvider`, `onlineModel` 状态

* `availableModels`, `isFetchingModels`, `isTestingConnection`, `connectionStatus` 状态

* `fetchModels`, `testConnection` 函数

* `onlineProviders` 配置

**保留的内容：**

* 用户设置（头像、名称等）

* RAG设置

* 语音设置

* 网络搜索设置（Tavily配置）

### 3. `src/types.ts` - 类型定义

**移除的内容：**

* `ModelProvider` 类型（如果不再需要）

### 4. `src/hooks/useAgentExecution.ts` - Agent执行Hook

**修改的内容：**

* 确保 `isAgentMode` 默认为 `true` 且不可切换

* 移除 `toggleAgentMode` 函数（或保留但不再使用）

* 确保默认Agent配置完整

### 5. `src/components/ToolPanel.tsx` - 工具面板

**检查并移除：**

* `temperature`, `setTemperature` props

* `systemPrompt`, `setSystemPrompt` props

* 相关UI组件

### 6. `src/components/Header.tsx` - 头部组件

**检查并移除：**

* `maxContextLength` prop

* 相关UI显示

### 7. `src/data/agents.ts` - 默认Agent配置

**修改的内容：**

* 确保 `DEFAULT_AGENT` 包含所有必要的配置（API URL、模型名称等）

***

## 实施步骤

### 阶段1：移除App.tsx中的普通聊天逻辑

1. 移除 `requestAI` 函数
2. 移除相关状态变量
3. 修改 `handleSendMessage` 函数
4. 修改 `handleEditMessage` 函数
5. 修改 `handleRegenerateMessage` 函数
6. 修改 `generateSessionTitle` 函数

### 阶段2：简化SettingsView组件

1. 移除AI模型设置相关的props
2. 移除AI模型设置的UI
3. 移除相关的状态和函数

### 阶段3：清理其他组件

1. 清理 ToolPanel 组件
2. 清理 Header 组件
3. 更新 types.ts

### 阶段4：确保Agent模式正常工作

1. 检查默认Agent配置
2. 确保新会话使用默认Agent
3. 测试基本功能

***

## 注意事项

1. **保留Agent配置能力**：用户仍可通过AgentConfigModal配置Agent的API URL、模型等
2. **默认Agent**：确保DEFAULT\_AGENT配置完整，作为新会话的默认配置
3. **向后兼容**：考虑现有用户的设置迁移
4. **UI简化**：移除普通聊天相关UI后，界面应更加简洁

***

## 风险评估

* **低风险**：代码删除，不影响Agent核心功能

* **中风险**：需要确保所有入口点都正确使用Agent模式

* **测试重点**：新会话创建、消息发送、消息编辑、消息重新生成

