# AI模型设置界面重构 - 实现文档

**重构日期：** 2026-04-02

**更新日期：** 2026-04-06

## 概述

本次重构将 AI 模型设置从单一模型配置改为支持多模型管理，用户可以添加、编辑、删除和排序多个 AI 模型配置。同时新增了 Token 使用统计图表功能，Token统计数据现已升级为本地文件持久化存储。

**最新更新（2026-04-06）：**

- 新增品牌图标系统（@lobehub/icons），统一所有提供商/模型的 Logo 显示
- 新增更多在线厂商支持（智谱、MiniMax、Kimi、小米MiMo）
- 移除 Alibaba (Qwen) 官方入口（已归入阿里云百炼）
- 新增自定义平台选项（支持手动输入 API 地址）
- 修复 Google AI Studio / Anthropic 模型列表获取逻辑
- 各厂商 API 认证方式和响应格式独立适配
- 表单内联错误日志显示（单行动画）
- **🔧 修复在线模型选择链路问题**：解决配置在线模型后仍使用本地 LM Studio 模型的 bug
- **🔧 实现 Google Gemini 完整兼容支持**：包括 API 端点格式、参数兼容、Thought Signature 机制
- **🔧 修复 API Key 持久化丢失问题**：重启应用后在线模型 API Key 不再清空
- **🔧 修复模型健康检查认证错误**：Google 使用 `?key=` 参数认证而非 Bearer token

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

| 状态/方法                    | 类型                                                   | 说明           |
| ------------------------ | ---------------------------------------------------- | ------------ |
| `modelConfigs`           | `ModelConfig[]`                                      | 模型配置列表       |
| `activeModelId`          | `string \| null`                                     | 当前激活的模型ID    |
| `addModelConfig`         | `(config: ModelConfig) => void`                      | 添加模型配置       |
| `updateModelConfig`      | `(id: string, config: Partial<ModelConfig>) => void` | 更新模型配置       |
| `deleteModelConfig`      | `(id: string) => void`                               | 删除模型配置       |
| `setActiveModel`         | `(id: string \| null) => void`                       | 设置激活模型       |
| `reorderModelConfigs`    | `(id: string, direction: 'up' \| 'down') => void`    | 重排序模型        |
| `tokenUsageRecords`      | `TokenUsageRecord[]`                                 | Token使用记录    |
| `isTokenStorageLoading`  | `boolean`                                            | 存储加载状态       |
| `addTokenUsageRecord`    | `(record: Omit<TokenUsageRecord, 'id'>) => void`     | 添加Token记录    |
| `getTokenUsageStats`     | `(modelId?, timeRange?) => Stats`                    | 获取统计数据       |
| `clearTokenUsageRecords` | `() => void`                                         | 清除所有记录       |
| `sessionTokenUsage`      | `{ input: number; output: number }`                  | 当前会话Token使用量 |
| `costCurrency`           | `'USD' \| 'CNY'`                                     | 预估费用显示货币     |
| `setCostCurrency`        | `(currency: 'USD' \| 'CNY') => void`                 | 设置预估费用货币     |

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

#### 4.1 ModelLogo（品牌图标组件）

**文件**: `src/components/ModelLogo.tsx`

基于 @lobehub/icons 库的品牌图标组件，提供统一的提供商和模型图标：

**导出组件：**

| 组件             | 用途    | 说明                                |
| -------------- | ----- | --------------------------------- |
| `ModelLogo`    | 模型图标  | 根据模型ID匹配对应品牌图标，无匹配时回退到提供商图标       |
| `ProviderLogo` | 提供商图标 | 根据提供商ID返回对应品牌图标，DMXAPI返回null（仅文字） |

**提供商图标映射表：**

| 提供商 ID        | 图标组件         | 来源                    |
| ------------- | ------------ | --------------------- |
| `google`      | Google       | @lobehub/icons        |
| `openai`      | OpenAI       | @lobehub/icons        |
| `anthropic`   | Anthropic    | @lobehub/icons        |
| `deepseek`    | DeepSeek     | @lobehub/icons        |
| `zhipu`       | Zhipu        | @lobehub/icons        |
| `minimax`     | Minimax      | @lobehub/icons        |
| `kimi`        | Moonshot     | @lobehub/icons        |
| `xiaomi`      | XiaomiMiMo   | @lobehub/icons        |
| `openrouter`  | OpenRouter   | @lobehub/icons        |
| `siliconflow` | SiliconCloud | @lobehub/icons        |
| `bailian`     | Bailian      | @lobehub/icons        |
| `lm-studio`   | LmStudio     | @lobehub/icons        |
| `ollama`      | Ollama       | @lobehub/icons        |
| `custom`      | Bot          | lucide-react（机器人默认图标） |
| `dmxapi`      | 无            | 返回null，仅显示文字          |

**模型图标回退逻辑：**

- 精确匹配：`gpt-4o` → OpenAI, `claude-3-5-sonnet` → Claude, `gemini-2.0-flash` → Gemini 等
- 模糊匹配：包含 `gpt`/`o1`/`o3` → OpenAI, 包含 `claude` → Claude, 包含 `gemini` → Gemini 等
- 最终回退：使用提供商图标

#### 4.2 ModelConfigCard

**文件**: `src/components/ModelConfigCard.tsx`

模型配置卡片组件，显示：

- 模型名称、**品牌图标**（ModelLogo）、模型ID
- 运行状态指示灯（绿色/灰色/红色）
- 优先级数字
- 操作按钮（仅图标）：启用/停用、编辑、删除
- 上下移动按钮调整优先级

#### 4.3 ModelConfigForm

**文件**: `src/components/ModelConfigForm.tsx`

模型配置表单组件，支持：

- **提供商选择**（LM Studio / Ollama / 在线模型），每个选项使用 ProviderLogo 品牌图标
- **在线模型厂商**完整列表：
  - **官方厂商**：Google、OpenAI、Anthropic、DeepSeek、智谱、MiniMax、Kimi、小米MiMo
  - **聚合平台**：OpenRouter、硅基流动、阿里云百炼、DMXAPI
  - **自定义平台**：手动输入 API URL（机器人图标）
- API URL / Key 配置
- 模型选择（下拉选择 + 手动输入）
- **"获取列表"按钮**：通过 API Key 调用各厂商 /models 端点动态获取可用模型列表
- 最大上下文长度
- 请求超时时间（秒）/ RPM 限流次数
- 定价配置（可折叠）：
  - 输入价格（缓存未命中）/ 输出价格
  - 缓存命中价格 / 缓存写入价格（Anthropic专用）
  - 货币切换（美元/人民币）
- **"获取价格"按钮**：自动填充预定义价格或从API实时获取
- **本地日志显示**：表单内单行动画日志，显示操作结果/错误信息
- 连接测试功能（提交时验证 API Key 有效性）

**提供商切换行为：**

- 切换在线厂商时自动清除 API Key 和已获取的模型列表
- 切换到自定义平台时显示 API URL 手动输入框
- 自动设置该厂商对应的默认货币（USD/CNY）

#### 4.4 TokenUsageChart

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

### 5. 价格与模型获取服务

**文件**: `src/services/pricingService.ts`

核心服务，负责模型列表获取和价格查询：

#### 5.1 模型列表获取 (`fetchModelsFromProvider`)

根据不同厂商调用各自专用的获取函数：

| 厂商                                                         | 专用函数                     | 认证方式                                     | API端点                       | 响应格式                     | 特殊处理                         |
| ---------------------------------------------------------- | ------------------------ | ---------------------------------------- | --------------------------- | ------------------------ | ---------------------------- |
| **Google**                                                 | `fetchGoogleModels()`    | `x-goog-api-key` header                  | `/v1beta/models`            | `{ models: [{ name }] }` | 过滤 gemini 系列，去除 `models/` 前缀 |
| **Anthropic**                                              | `fetchAnthropicModels()` | `x-api-key` + `anthropic-version` header | `/v1/models`                | `{ data: [{ id }] }`     | 标准格式                         |
| **OpenRouter**                                             | 内置处理                     | 无需认证（公共API）                              | `/api/v1/models`            | `{ data: [...] }`        | 5分钟缓存                        |
| **智谱**                                                     | 通用处理                     | `Bearer` token                           | `/api/paas/v4/models`（专用端点） | `{ data: [{ id }] }`     | -                            |
| **其他**（OpenAI/DeepSeek/MiniMax/Kimi/SiliconFlow/百炼/DMXAPI） | 通用处理                     | `Bearer` token                           | `{apiUrl}/v1/models`        | `{ data: [{ id }] }`     | -                            |

```typescript
// Google 专用响应格式
interface GoogleModelsResponse {
  models: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
}
```

#### 5.2 价格获取

- **OpenRouter**：通过公共 API 实时获取，带 5 分钟缓存
- **其他平台**：从预定义数据（`modelPricing.ts`）中查询

#### 5.3 错误处理

- 解析各厂商 API 的错误响应格式（`error.message` / `message`）
- 返回友好的中文错误信息
- 区分网络错误、认证错误、空结果等场景

***

### 6. 聚合平台配置

**文件**: `src/config/aggregatorProviders.ts`

定义所有在线厂商和聚合平台的配置：

**官方厂商（8个）：**

| ID          | 名称          | 支持模型列表 | 默认货币 |
| ----------- | ----------- | ------ | ---- |
| `google`    | Google      | ✅      | USD  |
| `openai`    | OpenAI      | ✅      | USD  |
| `anthropic` | Anthropic   | ✅      | USD  |
| `deepseek`  | DeepSeek    | ✅      | CNY  |
| `zhipu`     | 智谱          | ✅      | CNY  |
| `minimax`   | MiniMax     | ✅      | CNY  |
| `kimi`      | Kimi (月之暗面) | ✅      | CNY  |
| `xiaomi`    | 小米 MiMo     | ❌      | CNY  |

**聚合平台（5个）：**

| ID            | 名称         | 支持模型列表 | 默认货币 |
| ------------- | ---------- | ------ | ---- |
| `openrouter`  | OpenRouter | ✅      | USD  |
| `dmxapi`      | DMXAPI     | ✅      | CNY  |
| `siliconflow` | 硅基流动       | ✅      | CNY  |
| `bailian`     | 阿里云百炼      | ✅      | CNY  |
| `custom`      | 自定义平台      | ❌      | USD  |

导出函数：

- `isAggregatorProvider(providerId)` — 判断是否为聚合平台

***

### 7. SettingsView 重构

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

### 8. Tauri权限配置

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

### 在线厂商支持

- **13个在线厂商/平台**：Google、OpenAI、Anthropic、DeepSeek、智谱、MiniMax、Kimi、小米MiMo、OpenRouter、DMXAPI、硅基流动、阿里云百炼、自定义
- **动态模型列表**：点击"获取列表"按钮，使用用户的 API Key 从各厂商 API 实时拉取可用模型
- **自定义平台**：支持手动输入任意兼容 OpenAI 格式的 API 地址
- **品牌图标**：每个厂商使用 @lobehub/icons 对应的品牌 SVG 图标（DMXAPI除外，仅文字）

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

### 表单反馈

- **本地日志显示**：操作结果（成功/失败）以单行动画形式显示在表单底部
- **API 验证**：提交前验证 API Key 有效性（调用 /models 端点）
- **错误信息解析**：解析各厂商 API 返回的错误格式并显示友好提示

***

## 存储架构

### 存储方案选择

| 环境        | 存储方案      | 存储位置                                            |
| --------- | --------- | ----------------------------------------------- |
| Tauri桌面应用 | 本地JSON文件  | `{AppData}/nexus-ai-assistant/token-usage.json` |
| 浏览器       | IndexedDB | 浏览器IndexedDB                                    |

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
│    [OpenAI图标] · gpt-4o · 可用  [⚡][✏][🗑] │
├─────────────────────────────────────────┤
│ 🟢 Qwen-Max                        [2] │
│    [百炼图标] · qwen-max · 可用  [⚡][✏][🗑]│
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
│  [LmStudio图标] [Ollama图标] [🌐在线模型] │
├─────────────────────────────────────────┤
│  在线厂商                                │
│  [Google] [OpenAI] [Anthropic] ...     │
│  [智谱] [MiniMax] [Kimi] [小米]        │
│  [OpenRouter] [硅基流动] [百炼] [...]  │
│  [🤖 自定义平台]                        │
├─────────────────────────────────────────┤
│  API Key          [获取列表 ↻]          │
│  [sk-xxx...                        ]    │
├─────────────────────────────────────────┤
│  模型                                    │
│  [gemini-2.0-flash                  ▾]  │
├─────────────────────────────────────────┤
│  最大上下文长度              [4096]      │
│  ════════════════════════════════════   │
├─────────────────────────────────────────┤
│  请求超时（秒）    │  RPM限流（次/分钟） │
│  [60]             │  [60]              │
├─────────────────────────────────────────┤
│  定价配置（测试功能）            [▼]    │
│  输入价格         │  输出价格          │
│  [$ 0.00]         │  [$ 0.00]     [获取价格]│
├─────────────────────────────────────────┤
│  ℹ️ 已获取 12 个可用模型                 │
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
│ 汇率: 1 USD = 7.2456 CNY (更新于 04-06) │
└─────────────────────────────────────────┘
```

**货币切换说明：**

- 点击货币符号按钮（$ 或 ¥）切换显示货币
- 货币设置自动保存，下次打开保持不变
- 汇率信息始终显示，方便用户了解换算基准

***

## 文件修改清单

| 文件                                    | 操作 | 说明                                                                                                                                               |
| ------------------------------------- | -- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/types.ts`                        | 修改 | 添加 ModelConfig、ModelPricing（含缓存价格）、TokenUsageRecord、AggregatorProvider 等类型；新增 ToolCallRequest.thoughtSignature 字段                                |
| `src/agent/types.ts`                  | 修改 | 新增 ToolCallRequest.thoughtSignature 字段（Gemini 3 Thought Signature）                                                                               |
| `src/context/GlobalStateContext.tsx`  | 修改 | 添加模型配置列表状态、Token存储方法、货币设置、会话Token统计                                                                                                              |
| `src/services/tokenStorage.ts`        | 新建 | IndexedDB存储服务                                                                                                                                    |
| `src/services/tauriTokenStorage.ts`   | 新建 | Tauri文件系统存储服务                                                                                                                                    |
| `src/services/modelHealthCheck.ts`    | 修改 | 修复 Google 健康检查认证方式（使用 ?key= 参数）                                                                                                                  |
| `src/services/pricingService.ts`      | 新建 | 价格获取服务、模型列表获取（含Google/Anthropic专用函数）                                                                                                             |
| `src/hooks/useTokenStorage.ts`        | 新建 | Token存储Hook                                                                                                                                      |
| `src/hooks/useAgentExecution.ts`      | 修改 | 添加Token使用量追踪、费用计算、累积统计；修复 modelProvider 硬编码问题；扩展 DefaultAgentConfig 接口支持 apiModelName/modelProvider/onlineProvider/apiKey                        |
| `src/components/SettingsView.tsx`     | 重构 | 重写 AI 模型设置部分，集成图表组件                                                                                                                              |
| `src/components/ModelConfigCard.tsx`  | 新建 | 模型配置卡片组件（使用ModelLogo品牌图标）                                                                                                                        |
| `src/components/ModelConfigForm.tsx`  | 修改 | 修复 API Key 在编辑模式下被清空的问题（添加 isInitialized 和 prevOnlineProvider 状态跟踪）                                                                              |
| `src/components/ModelLogo.tsx`        | 新建 | 品牌图标组件（基于@lobehub/icons，ProviderLogo+ModelLogo）                                                                                                  |
| `src/components/TokenUsageChart.tsx`  | 新建 | Token 使用统计图表组件（含货币切换、实时汇率）                                                                                                                       |
| `src/components/ToolPanel.tsx`        | 修改 | 监视器面板显示实际会话Token消耗                                                                                                                               |
| `src/agent/llm/functionCalling.ts`    | 修改 | 新增 Gemini 兼容模式（isGeminiModel 配置、参数过滤）；实现 transformMessagesForGemini() 消息转换函数；流式响应解析时提取 thought\_signature；发送请求时保留签名                              |
| `src/agent/runtime/ReActEngine.ts`    | 修改 | 自动检测 Gemini 模型并设置 isGeminiModel 标志                                                                                                               |
| `src/data/modelPricing.ts`            | 新建 | 预定义模型定价配置（含缓存价格、聚合平台价格）                                                                                                                          |
| `src/utils/pricing.ts`                | 新建 | 定价计算工具函数（支持缓存定价计算）                                                                                                                               |
| `src/config/aggregatorProviders.ts`   | 修改 | 导出 ONLINE\_PROVIDERS 配置供 App.tsx 使用                                                                                                              |
| `src/App.tsx`                         | 修改 | 重构 defaultConfig 构建逻辑：使用 effectiveModelId 查找模型配置；根据 provider 类型动态构建 apiUrl/modelProvider/onlineProvider/apiKey/apiModelName；导入 ONLINE\_PROVIDERS |
| `src-tauri/capabilities/default.json` | 修改 | 添加文件系统写入权限                                                                                                                                       |

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
- ✅ 流式 API 准确 token 统计（stream\_options）
- ✅ Token 累积统计（支持多次 LLM 调用和工具调用）
- ✅ 预估费用货币切换功能（美元/人民币）
- ✅ 实时汇率获取和显示
- ✅ 货币设置持久化
- ✅ 缓存定价支持（缓存命中/缓存写入价格）
- ✅ AI 聚合平台支持（OpenRouter、DMXAPI、硅基流动、阿里云百炼）
- ✅ "获取价格"按钮功能
- ✅ OpenRouter API 实时价格获取
- ✅ 更多在线厂商（智谱、MiniMax、Kimi、小米MiMo）
- ✅ 自定义平台支持
- ✅ 品牌图标系统（@lobehub/icons）
- ✅ Google AI Studio / Anthropic 模型列表获取修复
- ✅ 表单内联错误日志显示
- ✅ **修复在线模型选择链路问题**（modelProvider 硬编码、activeModelId 回退、ID混淆）
- ✅ **实现 Google Gemini API 完整兼容**（端点格式、参数过滤、消息转换）
- ✅ **实现 Gemini 3 Thought Signature 机制**（签名提取与保留）
- ✅ **修复 API Key 持久化丢失**（编辑模式保留已有 Key）
- ✅ **修复模型健康检查认证错误**（Google 使用 ?key= 参数）

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

### 各厂商模型列表 API 差异

不同厂商的 /models 端点有显著差异，需要分别适配：

```typescript
// Google AI Studio — 完全不同的格式
GET https://generativelanguage.googleapis.com/v1beta/models
Header: x-goog-api-key: {apiKey}
Response: { models: [{ name: "models/gemini-2.0-flash", displayName: "..." }] }
处理: 过滤 gemini 开头 → 去除 "models/" 前缀

// Anthropic — 专用认证头
GET https://api.anthropic.com/v1/models
Header: x-api-key: {apiKey}, anthropic-version: 2023-06-01
Response: { data: [{ id: "claude-3-5-sonnet-20241022" }] }

// OpenAI 兼容格式（DeepSeek/MiniMax/Kimi/SiliconFlow/百炼/DMXAPI/OpenAI）
GET {apiUrl}/v1/models
Header: Authorization: Bearer {apiKey}
Response: { data: [{ id: "gpt-4o", object: "model" }] }

// 智谱 — 专用端点
GET https://open.bigmodel.cn/api/paas/v4/models
Header: Authorization: Bearer {apiKey}
```

### 聚合平台模型 ID 格式

聚合平台的模型 ID 通常包含提供商前缀：

| 平台         | 模型 ID 格式示例                                             |
| ---------- | ------------------------------------------------------ |
| OpenRouter | `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`         |
| 硅基流动       | `Qwen/Qwen2.5-72B-Instruct`, `deepseek-ai/DeepSeek-V3` |
| DMXAPI     | `gpt-4o`, `claude-3-5-sonnet-20241022`                 |
| 阿里云百炼      | `qwen-max`, `qwq-plus`                                 |

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

| 厂商        | 缓存命中折扣     | 缓存写入价格     |
| --------- | ---------- | ---------- |
| OpenAI    | 50%-90%    | 无额外费用      |
| Anthropic | 90% (0.1x) | 1.25x 或 2x |
| DeepSeek  | 75%-87.5%  | 无额外费用      |
| Kimi      | 75%        | 无额外费用      |
| 阿里云百炼     | 90%        | 无额外费用      |

### @lobehub/icons 图标映射

使用 @lobehub/icons 库统一品牌图标，覆盖 200+ AI/LLM 品牌：

```typescript
import { OpenAI, Anthropic, Google, DeepSeek, Zhipu, Moonshot, Minimax,
         LmStudio, Ollama, OpenRouter, XiaomiMiMo, SiliconCloud, Bailian,
         Meta, Mistral, Gemini, Claude, Qwen } from '@lobehub/icons';
import { Bot } from 'lucide-react';

// DMXAPI 无对应图标，ProviderLogo 返回 null（仅显示文字）
// 自定义平台使用 Bot（机器人）图标作为默认
```

### 在线模型选择与调用链路

#### 问题背景

原实现在配置在线模型（如 Google Gemini）后，实际调用时仍会使用本地 LM Studio 模型。问题出在模型配置传递链路的多个环节：

1. **`modelProvider`** **硬编码**：`useAgentExecution.ts` 中 `modelProvider: 'lmstudio'` 被硬编码，无论选择什么模型都强制设为 LM Studio
2. **`activeModelId`** **为 null 时的回退逻辑错误**：当用户未手动激活模型时，`activeModelId` 为 null，导致代码错误地回退到 LM Studio 地址
3. **配置 ID 与 API 模型名混淆**：`ModelConfig.id`（内部 ID 如 `1775415795139xha4ddo`）被当作 API 的 `model` 参数发送

#### 修复方案

**1. 扩展 DefaultAgentConfig 接口**

```typescript
interface DefaultAgentConfig {
  apiUrl: string;
  modelId: string;           // 配置ID（用于 Token 统计）
  apiModelName: string;      // API模型名（用于 API 调用）
  temperature: number;
  modelProvider?: string;    // 动态 provider（不再硬编码）
  onlineProvider?: string;   // 在线服务商标识
  apiKey?: string;           // API 密钥
}
```

**2. App.tsx 中的模型查找逻辑优化**

```typescript
// 使用 effectiveModelId 查找模型配置，而不是仅依赖 activeModel
const modelToUse = modelConfigs.find(m => m.id === effectiveModelId) || null;

if (modelToUse) {
  if (modelToUse.provider === 'online') {
    if (modelToUse.apiUrl) {
      apiUrl = modelToUse.apiUrl;
    } else if (modelToUse.onlineProvider && ONLINE_PROVIDERS[modelToUse.onlineProvider]) {
      const providerConfig = ONLINE_PROVIDERS[modelToUse.onlineProvider];
      const baseUrl = providerConfig.apiUrl;
      // Google Gemini 使用 OpenAI 兼容端点
      if (modelToUse.onlineProvider === 'google') {
        apiUrl = `${baseUrl}/openai/chat/completions`;
      } else {
        apiUrl = `${baseUrl}/chat/completions`;
      }
    }
    apiModelName = modelToUse.modelId;  // ModelConfig.modelId 是实际的 API 模型名
  }
}
```

**3. useAgentExecution.ts 中的 Agent 构建**

```typescript
const newAgent: Agent = {
  ...DEFAULT_AGENT,
  modelProvider: defaultConfig.modelProvider || 'lmstudio',  // 动态获取
  onlineProvider: defaultConfig.onlineProvider,
  modelId: defaultConfig.apiModelName || defaultConfig.modelId,  // 使用 API 模型名
  apiKey: defaultConfig.apiKey,
};
```

### Google Gemini API 完整兼容支持

#### Gemini 特殊要求

Google Gemini 的 OpenAI 兼容端点与标准 OpenAI API 有以下差异：

| 参数                | 标准 OpenAI | Google Gemini     | 处理方式                          |
| ----------------- | --------- | ----------------- | ----------------------------- |
| `max_tokens`      | ✅ 支持      | ❌ 不支持             | Gemini 模式移除                   |
| `tool_choice`     | ✅ 支持      | ❌ 不支持             | Gemini 模式移除                   |
| `stream_options`  | ✅ 支持      | ❌ 不支持             | 根据 `supportsStreamOptions` 判断 |
| Tool content 格式   | 纯文本/JSON  | **必须是 JSON 对象**   | 自动转换                          |
| Thought Signature | 不需要       | **Gemini 3 强制要求** | 提取并保留                         |

#### Gemini 兼容模式实现

**1. FunctionCallingConfig 扩展**

```typescript
export interface FunctionCallingConfig {
  apiUrl: string;
  modelName: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  supportsStreamOptions?: boolean;  // 是否支持 stream_options
  isGeminiModel?: boolean;          // 是否为 Gemini 模型
}
```

**2. 请求体参数过滤**

```typescript
if (config.isGeminiModel) {
  console.log('[functionCalling] Using Gemini-compatible mode');
  // 移除不支持的参数：max_tokens, tool_choice
} else {
  body.max_tokens = config.maxTokens;
  body.tool_choice = tools.length > 0 ? 'auto' : undefined;
}
```

**3. Tool 消息内容转换**

Gemini 要求 tool 消息的 `content` 必须是有效的 JSON 对象（`google.protobuf.Struct`），纯文本会导致 400 错误：

```typescript
function transformMessagesForGemini(messages): Record<string, unknown>[] {
  return messages.map(msg => {
    if (msg.role === 'tool') {
      const rawContent = msg.content;
      try {
        JSON.parse(rawContent);
        transformed.content = rawContent;  // 已是 JSON
      } catch {
        transformed.content = JSON.stringify({ result: rawContent });  // 包装为对象
      }
    }
  });
}
```

### Gemini 3 Thought Signature 机制

#### 什么是 Thought Signature

Thought Signature 是 Google Gemini 3 模型的内部推理过程的加密表示，用于在多轮对话中保持推理上下文。

> **官方文档**：<https://ai.google.dev/gemini-api/docs/thought-signatures>
>
> **关键规则**：
>
> - Gemini 3 模型在 Function Calling 响应中**必须包含** thought\_signature
> - 后续请求中**必须原样返回**该签名
> - 缺失签名会导致 **400 INVALID\_ARGUMENT** 错误

#### OpenAI 兼容格式中的签名位置

```json
{
  "role": "assistant",
  "tool_calls": [
    {
      "id": "function-call-1",
      "type": "function",
      "function": {
        "name": "web_search",
        "arguments": "{\"query\":\"test\"}"
      },
      "extra_content": {
        "google": {
          "thought_signature": "<Signature A>"  // ← 这里！
        }
      }
    }
  ]
}
```

#### 实现方案

**1. 类型扩展** (`src/agent/types.ts`)

```typescript
export interface ToolCallRequest {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
  thoughtSignature?: string;  // Gemini 3 Thought Signature
}
```

**2. 流式响应解析时提取签名** (`src/agent/llm/functionCalling.ts`)

```typescript
if (tc.extra_content?.google?.thought_signature) {
  existing.thoughtSignature = tc.extra_content.google.thoughtSignature;
}
```

**3. 发送请求时保留签名** (`transformMessagesForGemini`)

```typescript
if (tc.thoughtSignature) {
  tcOutput.extra_content = {
    google: { thought_signature: tc.thoughtSignature }
  };
} else {
  // 无原始签名时使用 dummy 值跳过验证（首次调用或从其他模型迁移）
  tcOutput.extra_content = {
    google: { thought_signature: 'skip_thought_signature_validator' }
  };
}
```

### API Key 持久化修复

#### 问题原因

`ModelConfigForm.tsx` 中的 `useEffect` 在组件加载或切换在线模式时会清空 `apiKey`：

```typescript
// 问题代码
useEffect(() => {
  if (provider === 'online') {
    setApiKey('');  // ← 总是被清空！
  }
}, [provider, onlineProvider]);
```

#### 修复方案

使用 `isInitialized` 和 `prevOnlineProvider` 状态跟踪，只在必要时重置：

```typescript
const [isInitialized, setIsInitialized] = useState(false);
const [prevOnlineProvider, setPrevOnlineProvider] = useState(undefined);

useEffect(() => {
  if (provider === 'online') {
    const isSwitchingProvider = isInitialized && prevOnlineProvider !== onlineProvider;
    
    // 只在切换服务商时重置，编辑模式下保留已有的 apiKey
    if (isSwitchingProvider || (!isInitialized && !editingConfig?.apiKey)) {
      setApiKey('');
    }
  }
  setIsInitialized(true);
  setPrevOnlineProvider(onlineProvider);
}, [provider, onlineProvider]);
```

### 模型健康检查认证修复

#### 问题原因

Google 的 `/v1beta/models` 端点不接受 Bearer token 认证，需要使用 URL query parameter：

```typescript
// 错误方式（导致 401 Unauthorized）
headers['Authorization'] = `Bearer ${config.apiKey}`;
fetch(`${apiUrl}/models`, { headers });
```

#### 各厂商认证方式

| 提供商                       | 认证方式                 | 示例                              |
| ------------------------- | -------------------- | ------------------------------- |
| **Google**                | URL Query Parameter  | `?key=API_KEY`                  |
| **Anthropic**             | Header: `x-api-key`  | `x-api-key: API_KEY`            |
| **其他** (OpenAI/DeepSeek等) | Header: Bearer Token | `Authorization: Bearer API_KEY` |

#### 修复后的代码

```typescript
if (config.onlineProvider === 'google') {
  requestUrl = `${apiUrl}/models?key=${config.apiKey}`;
} else if (config.onlineProvider === 'anthropic') {
  requestUrl = `${apiUrl}/models`;
  headers['x-api-key'] = config.apiKey;
} else {
  requestUrl = `${apiUrl}/models`;
  headers['Authorization'] = `Bearer ${config.apiKey}`;
}
```

***

## 相关文档

- 计划文档：`.trae/documents/cache-pricing-integration-plan.md`
- 后续开发计划：`.trae/documents/ai-model-settings-follow-up-plan.md`
- 原有重构文档：`docs/REMOVE_LLM_CHAT_MODE.md`

