# AI模型设置界面重构 - 实现文档

**重构日期：** 2026-04-02

**更新日期：** 2026-04-05

## 概述

本次重构将 AI 模型设置从单一模型配置改为支持多模型管理，用户可以添加、编辑、删除和排序多个 AI 模型配置。同时新增了 Token 使用统计图表功能，Token统计数据现已升级为本地文件持久化存储。

**最新更新（2026-04-05）：**
- 新增缓存定价支持（缓存命中/缓存写入价格）
- 新增 AI 聚合平台支持（OpenRouter、DMXAPI、硅基流动、阿里云百炼）
- 新增"获取价格"按钮，自动填充预定义价格
- OpenRouter 支持通过 API 实时获取模型价格

***

## 主要修改

### 1. 数据类型定义

**文件**: `src/types.ts`

新增了以下类型：

```typescript
export interface ModelPricing {
  inputPrice: number;       // 输入价格（缓存未命中，每1M tokens）
  outputPrice: number;      // 输出价格（每1M tokens）
  currency: 'USD' | 'CNY';  // 货币类型
  cacheHitPrice?: number;   // 缓存命中价格（可选，每1M tokens）
  cacheWritePrice?: number; // 缓存写入价格（可选，Anthropic专用）
}

export interface AggregatorProvider {
  id: string;
  name: string;
  logo: string;
  apiUrl: string;
  apiKeyUrl: string;
  pricingUrl?: string;
  supportsModelList: boolean;
  supportsPricingApi: boolean;
  currency: 'USD' | 'CNY';
}

export interface ModelConfig {
  id: string;
  name: string;
  modelId: string;
  provider: 'lm-studio' | 'ollama' | 'online';
  onlineProvider?: string;
  apiUrl?: string;
  apiKey?: string;
  maxContextLength: number;
  timeout: number;         // 请求超时时间（秒）
  rpm: number;             // RPM限流次数
  pricing?: ModelPricing;  // 定价配置
  status: 'active' | 'inactive' | 'error';
  priority: number;
  lastConnected?: number;
  createdAt: number;
}

export interface TokenUsageRecord {
  id: string;
  modelId: string;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface TokenUsageStats {
  records: TokenUsageRecord[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}
```

***

### 2. 全局状态管理

**文件**: `src/context/GlobalStateContext.tsx`

新增状态和方法：

| 状态/方法                 | 类型                                                   | 说明        |
| --------------------- | ---------------------------------------------------- | --------- |
| `modelConfigs`        | `ModelConfig[]`                                      | 模型配置列表    |
| `activeModelId`       | `string \| null`                                     | 当前激活的模型ID |
| `addModelConfig`      | `(config: ModelConfig) => void`                      | 添加模型配置    |
| `updateModelConfig`   | `(id: string, config: Partial<ModelConfig>) => void` | 更新模型配置    |
| `deleteModelConfig`   | `(id: string) => void`                               | 删除模型配置    |
| `setActiveModel`      | `(id: string \| null) => void`                       | 设置激活模型    |
| `reorderModelConfigs` | `(id: string, direction: 'up' \| 'down') => void`    | 重排序模型     |
| `tokenUsageRecords`   | `TokenUsageRecord[]`                                 | Token使用记录   |
| `isTokenStorageLoading`| `boolean`                                             | 存储加载状态    |
| `addTokenUsageRecord` | `(record: Omit<TokenUsageRecord, 'id'>) => void`      | 添加Token记录    |
| `getTokenUsageStats`  | `(modelId?, timeRange?) => Stats`                    | 获取统计数据    |
| `clearTokenUsageRecords`| `() => void`                                          | 清除所有记录    |
| `sessionTokenUsage`    | `{ input: number; output: number }`                      | 当前会话Token使用量 |
| `costCurrency`        | `'USD' \| 'CNY'`                                         | 预估费用显示货币   |
| `setCostCurrency`     | `(currency: 'USD' \| 'CNY') => void`                     | 设置预估费用货币   |

所有配置自动持久化到 `localStorage`。

***

### 3. Token统计存储服务

#### 3.1 IndexedDB存储服务

**文件**: `src/services/tokenStorage.ts`

IndexedDB存储服务，用于浏览器环境：

- 数据库名: `nexus-token-usage`
- 存储表: `tokenRecords`
- 索引: `by-model`, `by-timestamp`, `by-model-timestamp`

主要功能：
- `addTokenRecord` - 添加单条记录
- `addTokenRecords` - 批量添加记录
- `getAllTokenRecords` - 获取所有记录
- `getTokenRecordsByTimeRange` - 按时间范围查询
- `getTokenRecordsByModelAndTime` - 按模型和时间查询
- `clearAllTokenRecords` - 清除所有记录
- `migrateFromLocalStorage` - 从localStorage迁移数据

#### 3.2 Tauri文件系统存储服务

**文件**: `src/services/tauriTokenStorage.ts`

Tauri文件系统存储服务，用于桌面应用环境：

- 存储目录: `{AppData}/nexus-ai-assistant/`
- 存储文件: `token-usage.json`
- 完整路径: `C:\Users\{用户名}\AppData\Roaming\com.nexus-ai.assistant\nexus-ai-assistant\token-usage.json`

主要功能：
- 自动检测Tauri环境
- 创建存储目录
- JSON格式持久化存储
- 从IndexedDB和localStorage迁移数据

#### 3.3 Token存储Hook

**文件**: `src/hooks/useTokenStorage.ts`

统一的Token存储Hook，自动选择存储方案：

- Tauri环境: 使用本地文件存储
- 浏览器环境: 使用IndexedDB存储
- 自动数据迁移
- 加载状态管理

```typescript
export function useTokenStorage(modelConfigs: ModelConfig[]) {
  return {
    records: TokenUsageRecord[];
    isLoading: boolean;
    isMigrating: boolean;
    storagePath: string;
    addRecord: (record) => Promise<void>;
    getStats: (modelId?, timeRange?) => Stats;
    clearRecords: () => Promise<void>;
    refreshRecords: () => Promise<void>;
  };
}
```

***

### 4. 新增组件

#### 4.1 ModelConfigCard

**文件**: `src/components/ModelConfigCard.tsx`

模型配置卡片组件，显示：

- 模型名称、提供商图标、模型ID
- 运行状态指示灯（绿色/灰色/红色）
- 优先级数字
- 操作按钮（仅图标）：启用/停用、编辑、删除
- 上下移动按钮调整优先级

#### 4.2 ModelConfigForm

**文件**: `src/components/ModelConfigForm.tsx`

模型配置表单组件，支持：

- 提供商选择（LM Studio / Ollama / 在线模型）
- 在线模型支持多个厂商：
  - **官方厂商**：Google、OpenAI、Anthropic、Alibaba (Qwen)、DeepSeek
  - **聚合平台**：OpenRouter、DMXAPI、硅基流动、阿里云百炼
- API URL/Key 配置
- 模型选择（支持获取模型列表）
- 聚合平台支持手动输入模型ID
- 最大上下文长度
- 请求超时时间（秒）
- RPM 限流次数
- 定价配置：
  - 输入价格（缓存未命中）
  - 输出价格
  - 缓存命中价格（可选）
  - 缓存写入价格（可选，Anthropic专用）
  - 货币切换（美元/人民币）
- **"获取价格"按钮**：自动填充预定义价格
- 连接测试功能

#### 4.3 TokenUsageChart

**文件**: `src/components/TokenUsageChart.tsx`

Token 使用统计图表组件：

- 右上角时间选项（天/周/月/年）
- 折线图显示各模型的 token 使用趋势
- 鼠标悬停显示详细数据
- 底部显示模型颜色图例
- 右下角显示总消耗和预估费用
- 加载状态显示
- **货币切换功能**：支持美元/人民币切换
- **实时汇率获取**：使用 open.er-api.com API 获取实时汇率
- **汇率信息显示**：始终显示当前汇率和更新时间
- **货币设置持久化**：用户选择的货币保存到 localStorage

***

### 5. SettingsView 重构

**文件**: `src/components/SettingsView.tsx`

主要改动：

- 移除了旧的单一模型配置 props
- 从全局状态获取模型配置列表
- 实现模型列表展示和管理
- 集成 TokenUsageChart 组件
- 移除了底部"保存/重置"按钮（设置即时生效）
- 关闭设置面板时自动重置表单状态
- 传递Token存储加载状态

***

### 6. Tauri权限配置

**文件**: `src-tauri/capabilities/default.json`

新增文件系统权限：

```json
{
  "permissions": [
    "fs:allow-write-file",
    "fs:allow-mkdir",
    "fs:allow-exists",
    {
      "identifier": "fs:scope",
      "allow": [
        { "path": "$APPDATA/**" },
        { "path": "$APPCONFIG/**" },
        { "path": "$APPLOCALDATA/**" }
      ]
    }
  ]
}
```

***

## 功能特性

### 模型管理

1. **添加模型**
   - 点击右上角 "+" 按钮
   - 填写模型配置表单
   - 自动验证连接状态
2. **编辑模型**
   - 点击编辑图标
   - 修改配置后保存
   - 自动重新验证连接
3. **删除模型**
   - 点击删除图标
   - 立即删除，列表自动重排
4. **启用/停用模型**
   - 点击电源图标切换
   - 只能有一个激活模型
5. **优先级排序**
   - 使用上下箭头调整顺序

### 定价配置

- 在线模型：直接显示定价配置
- 本地模型：折叠显示（标记为测试功能）
- 支持货币切换（美元/人民币）
- 价格单位：每百万 tokens
- **缓存定价支持**：
  - 缓存命中价格：通常为输入价格的 10%-50%
  - 缓存写入价格：仅部分厂商支持（如 Anthropic）
- **"获取价格"按钮**：
  - OpenRouter：通过 API 实时获取价格
  - 其他平台：从预定义数据填充
  - 显示价格来源（API获取/预定义数据）
- **聚合平台定价**：每个平台的价格可能与官方不同，需根据实际选择填充

### Token 使用统计

- 时间范围：天/周/月/年
- 多模型对比显示
- 预估费用计算
- **本地文件持久化存储**（Tauri环境）
- **IndexedDB存储**（浏览器环境）
- 自动数据迁移
- **货币切换**：支持美元/人民币显示
- **实时汇率**：应用启动时自动获取最新汇率
- **汇率显示**：始终显示当前汇率和更新时间

### Agent 模式 Token 显示

- 消息气泡下方显示 token 数量和生成速度
- Token 使用量在多次 LLM 调用中累积（包括工具调用）
- 使用 `stream_options: { include_usage: true }` 获取准确的流式 API token 数据
- 使用 `useRef` 实现同步访问 token 使用量（解决 React 状态异步问题）

### 监视器面板 Token 显示

- 显示当前会话的实际 token 消耗
- 区分输入/输出 token 数量
- 基于消息记录计算，而非估算

***

## 存储架构

### 存储方案选择

| 环境 | 存储方案 | 存储位置 |
| ---- | -------- | -------- |
| Tauri桌面应用 | 本地JSON文件 | `{AppData}/nexus-ai-assistant/token-usage.json` |
| 浏览器 | IndexedDB | 浏览器IndexedDB |

### 数据迁移

首次运行时自动迁移：
1. localStorage → IndexedDB（浏览器环境）
2. localStorage → 本地文件（Tauri环境）
3. IndexedDB → 本地文件（Tauri环境）

迁移完成后清除旧数据源。

***

## UI 设计

### 空状态

```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│         暂无已连接的模型                 │
│      点击右上角 + 添加模型              │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

### 模型列表

```
┌─────────────────────────────────────────┐
│  已连接模型                        [+]  │
├─────────────────────────────────────────┤
│ 🟢 GPT-4o                           [1] │
│    OpenAI · gpt-4o · 可用    [⚡][✏][🗑] │
├─────────────────────────────────────────┤
│ 🟢 Qwen-Plus                        [2] │
│    Alibaba · qwen-plus · 可用 [⚡][✏][🗑]│
└─────────────────────────────────────────┘
```

### 添加模型表单

```
┌─────────────────────────────────────────┐
│  添加新模型                         [X] │
├─────────────────────────────────────────┤
│  模型名称                                │
│  [Qwen 3.5                           ]  │
├─────────────────────────────────────────┤
│  提供商                                  │
│  [LM Studio] [Ollama] [在线模型]        │
├─────────────────────────────────────────┤
│  API URL                                 │
│  [http://localhost:1234/v1/...    ] [测试]│
├─────────────────────────────────────────┤
│  模型                                    │
│  [qwen/qwen3.5-9b                  ]    │
├─────────────────────────────────────────┤
│  最大上下文长度              [4096]      │
│  ════════════════════════════════════   │
├─────────────────────────────────────────┤
│  请求超时（秒）    │  RPM限流（次/分钟） │
│  [60]             │  [60]              │
├─────────────────────────────────────────┤
│  定价配置（测试功能）            [▼]    │
│  输入价格         │  输出价格          │
│  [$ 0.00]         │  [$ 0.00]          │
├─────────────────────────────────────────┤
│                    [取消]  [添加模型]    │
└─────────────────────────────────────────┘
```

### Token 使用统计图表

```
┌─────────────────────────────────────────┐
│  Token 使用统计        [天][周][月][年] │
├─────────────────────────────────────────┤
│  │                                      │
│  │    ╱╲    ╱╲                          │
│  │   ╱  ╲  ╱  ╲    ╱╲                   │
│  │  ╱    ╲╱    ╲  ╱  ╲                  │
│  │ ╱              ╲╱    ╲               │
├─────────────────────────────────────────┤
│ ● Qwen 3.5  ● GPT-4o                    │
│                                          │
│ 总消耗: 5,163 tokens                     │
│ 预估费用: ¥0.0352 人民币 [$]             │
│ 汇率: 1 USD = 7.2456 CNY (更新于 04-05 14:30) │
└─────────────────────────────────────────┘
```

**货币切换说明：**
- 点击货币符号按钮（$ 或 ¥）切换显示货币
- 货币设置自动保存，下次打开保持不变
- 汇率信息始终显示，方便用户了解换算基准

***

## 文件修改清单

| 文件                                   | 操作 | 说明                                               |
| ------------------------------------ | -- | ------------------------------------------------ |
| `src/types.ts`                       | 修改 | 添加 ModelConfig、ModelPricing（含缓存价格）、TokenUsageRecord、AggregatorProvider 等类型 |
| `src/context/GlobalStateContext.tsx` | 修改 | 添加模型配置列表状态、Token存储方法、货币设置、会话Token统计 |
| `src/services/tokenStorage.ts`       | 新建 | IndexedDB存储服务                                  |
| `src/services/tauriTokenStorage.ts`  | 新建 | Tauri文件系统存储服务                               |
| `src/services/modelHealthCheck.ts`   | 新建 | 模型健康检查服务                                      |
| `src/services/pricingService.ts`     | 新建 | 价格获取服务（OpenRouter API、预定义价格查询）         |
| `src/hooks/useTokenStorage.ts`       | 新建 | Token存储Hook                                      |
| `src/hooks/useAgentExecution.ts`     | 修改 | 添加Token使用量追踪、费用计算、累积统计                |
| `src/components/SettingsView.tsx`    | 重构 | 重写 AI 模型设置部分，集成图表组件                      |
| `src/components/ModelConfigCard.tsx` | 新建 | 模型配置卡片组件                                         |
| `src/components/ModelConfigForm.tsx` | 新建 | 模型配置表单组件（含缓存定价、聚合平台支持）             |
| `src/components/TokenUsageChart.tsx` | 新建 | Token 使用统计图表组件（含货币切换、实时汇率）          |
| `src/components/ToolPanel.tsx`       | 修改 | 监视器面板显示实际会话Token消耗                        |
| `src/agent/llm/functionCalling.ts`   | 修改 | 添加 stream_options 获取准确的流式API token数据       |
| `src/data/modelPricing.ts`           | 新建 | 预定义模型定价配置（含缓存价格、聚合平台价格）           |
| `src/utils/pricing.ts`               | 新建 | 定价计算工具函数（支持缓存定价计算）                    |
| `src/config/aggregatorProviders.ts`  | 新建 | 聚合平台配置（OpenRouter、DMXAPI、硅基流动、百炼）     |
| `src/App.tsx`                        | 修改 | Agent消息Token显示、健康检查启动                       |
| `src-tauri/capabilities/default.json`| 修改 | 添加文件系统写入权限                                      |

***

## 后续工作

**已完成：**
- ✅ 实现 Token 使用记录
- ✅ 在每次 API 调用时记录 token 使用量
- ✅ 图表组件从存储中读取实际数据
- ✅ 本地文件持久化存储（Tauri环境）
- ✅ IndexedDB存储（浏览器环境）
- ✅ 自动数据迁移
- ✅ 启动时自动检测模型连接状态（一次性检查）
- ✅ 显示更详细的错误信息（通过健康检查）
- ✅ 根据实际 token 使用量和定价配置计算费用
- ✅ 支持不同模型的定价策略（预定义常见模型定价）
- ✅ 恢复 Agent 模式下的 Token 显示功能
- ✅ 修复监视器面板的 Token 消耗显示（显示实际值）
- ✅ 流式 API 准确 token 统计（stream_options）
- ✅ Token 累积统计（支持多次 LLM 调用和工具调用）
- ✅ 预估费用货币切换功能（美元/人民币）
- ✅ 实时汇率获取和显示
- ✅ 货币设置持久化
- ✅ 缓存定价支持（缓存命中/缓存写入价格）
- ✅ AI 聚合平台支持（OpenRouter、DMXAPI、硅基流动、阿里云百炼）
- ✅ "获取价格"按钮功能
- ✅ OpenRouter API 实时价格获取

**待优化：**
- 更多聚合平台的 API 价格获取支持
- 模型定价数据的在线更新
- 更多模型的定价配置支持
- 汇率缓存优化（避免频繁请求）
- 缓存命中 token 统计（需要 API 返回缓存命中数据）

***

## 技术要点

### Token 累积统计实现

Agent 模式下一次对话可能涉及多次 LLM 调用（如工具调用），需要累积统计：

```typescript
// useAgentExecution.ts
const tokenUsageRef = useRef<TokenUsage | null>(null);

// 累积而非覆盖
onTokenUsage: (usage) => {
  if (tokenUsageRef.current) {
    tokenUsageRef.current = {
      inputTokens: tokenUsageRef.current.inputTokens + usage.inputTokens,
      outputTokens: tokenUsageRef.current.outputTokens + usage.outputTokens,
    };
  } else {
    tokenUsageRef.current = { ...usage };
  }
  setLastTokenUsage({ ...tokenUsageRef.current });
}
```

### 流式 API Token 统计

OpenAI 兼容 API 默认不返回 usage 数据，需要添加参数：

```typescript
const body = {
  model: config.modelName,
  messages,
  stream: true,
  stream_options: { include_usage: true },  // 关键参数
};
```

### React 状态异步问题

`execute()` 完成后立即获取 token 使用量时，React 状态可能未更新：

```typescript
// 问题：lastTokenUsage 可能还是 null
const handleComplete = () => {
  console.log(lastTokenUsage);  // null
};

// 解决：使用 ref 同步访问
const tokenUsage = agentExecution.getTokenUsage();  // 从 ref 获取
```

### 健康检查无限循环问题

`checkModelConnection` 依赖 `modelConfigs`，更新 `modelConfigs` 会触发重新创建函数：

```typescript
// 问题代码
const checkModelConnection = useCallback(async (modelId: string) => {
  const config = modelConfigs.find(m => m.id === modelId);  // 依赖 modelConfigs
  // ...
}, [modelConfigs]);  // modelConfigs 变化 → 函数重建 → useEffect 重跑

// 解决：使用 ref
const modelConfigsRef = useRef(modelConfigs);
modelConfigsRef.current = modelConfigs;

const checkModelConnection = useCallback(async (modelId: string) => {
  const config = modelConfigsRef.current.find(m => m.id === modelId);
  // ...
}, []);  // 无依赖，函数稳定
```

### 缓存定价计算

支持缓存定价的费用计算：

```typescript
// src/utils/pricing.ts
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing | undefined,
  cachedTokens: number = 0
): number {
  if (!pricing) return 0;
  
  const uncachedTokens = Math.max(0, inputTokens - cachedTokens);
  
  // 未缓存的输入 token
  const inputCost = (uncachedTokens / 1000000) * pricing.inputPrice;
  
  // 缓存命中的输入 token
  const cacheHitCost = cachedTokens > 0 && pricing.cacheHitPrice
    ? (cachedTokens / 1000000) * pricing.cacheHitPrice
    : 0;
  
  // 输出 token
  const outputCost = (outputTokens / 1000000) * pricing.outputPrice;
  
  return inputCost + cacheHitCost + outputCost;
}
```

### 聚合平台模型 ID 格式

聚合平台的模型 ID 通常包含提供商前缀：

| 平台 | 模型 ID 格式示例 |
|------|-----------------|
| OpenRouter | `openai/gpt-4o`, `anthropic/claude-3.5-sonnet` |
| 硅基流动 | `Qwen/Qwen2.5-72B-Instruct`, `deepseek-ai/DeepSeek-V3` |
| DMXAPI | `gpt-4o`, `claude-3-5-sonnet-20241022` |
| 阿里云百炼 | `qwen-max`, `qwq-plus` |

### OpenRouter 价格 API

OpenRouter 提供公开的模型价格 API：

```typescript
// 获取所有模型及其价格
const response = await fetch('https://openrouter.ai/api/v1/models');
const data = await response.json();

// 价格格式（每 token）
const model = data.data.find(m => m.id === 'openai/gpt-4o');
const inputPrice = parseFloat(model.pricing.prompt) * 1000000;  // 转换为每百万 tokens
const outputPrice = parseFloat(model.pricing.completion) * 1000000;
```

### 各厂商缓存定价对比

| 厂商 | 缓存命中折扣 | 缓存写入价格 |
|------|-------------|-------------|
| OpenAI | 50%-90% | 无额外费用 |
| Anthropic | 90% (0.1x) | 1.25x 或 2x |
| DeepSeek | 75%-87.5% | 无额外费用 |
| Kimi | 75% | 无额外费用 |
| 阿里云百炼 | 90% | 无额外费用 |

***

## 相关文档

- 计划文档：`.trae/documents/ai-model-settings-redesign.md`
- 后续开发计划：`.trae/documents/ai-model-settings-follow-up-plan.md`
- 原有重构文档：`docs/REMOVE_LLM_CHAT_MODE.md`
