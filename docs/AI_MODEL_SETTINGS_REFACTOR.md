# AI模型设置界面重构 - 实现文档

**重构日期：** 2026-04-02

**更新日期：** 2026-04-03

## 概述

本次重构将 AI 模型设置从单一模型配置改为支持多模型管理，用户可以添加、编辑、删除和排序多个 AI 模型配置。同时新增了 Token 使用统计图表功能，Token统计数据现已升级为本地文件持久化存储。

***

## 主要修改

### 1. 数据类型定义

**文件**: `src/types.ts`

新增了以下类型：

```typescript
export interface ModelPricing {
  inputPrice: number;      // 输入价格（每1M tokens）
  outputPrice: number;     // 输出价格（每1M tokens）
  currency: 'USD' | 'CNY'; // 货币类型
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
- 在线模型支持多个厂商（Google、OpenAI、Anthropic、Alibaba、DeepSeek）
- API URL/Key 配置
- 模型选择（支持获取模型列表）
- 最大上下文长度
- 请求超时时间（秒）
- RPM 限流次数
- 定价配置（输入/输出价格，支持货币切换）
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

### Token 使用统计

- 时间范围：天/周/月/年
- 多模型对比显示
- 预估费用计算
- **本地文件持久化存储**（Tauri环境）
- **IndexedDB存储**（浏览器环境）
- 自动数据迁移

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
│ 预估费用: $0.0000 美元                   │
└─────────────────────────────────────────┘
```

***

## 文件修改清单

| 文件                                   | 操作 | 说明                                               |
| ------------------------------------ | -- | ------------------------------------------------ |
| `src/types.ts`                       | 修改 | 添加 ModelConfig、ModelPricing、TokenUsageRecord 等类型 |
| `src/context/GlobalStateContext.tsx` | 修改 | 添加模型配置列表状态和Token存储方法                    |
| `src/services/tokenStorage.ts`       | 新建 | IndexedDB存储服务                                  |
| `src/services/tauriTokenStorage.ts`  | 新建 | Tauri文件系统存储服务                               |
| `src/hooks/useTokenStorage.ts`       | 新建 | Token存储Hook                                      |
| `src/components/SettingsView.tsx`    | 重构 | 重写 AI 模型设置部分，集成图表组件                      |
| `src/components/ModelConfigCard.tsx` | 新建 | 模型配置卡片组件                                         |
| `src/components/ModelConfigForm.tsx` | 新建 | 模型配置表单组件                                         |
| `src/components/TokenUsageChart.tsx` | 新建 | Token 使用统计图表组件                                   |
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

**待优化：**
- 定期自动检测模型连接状态
- 显示更详细的错误信息
- 根据实际 token 使用量和定价配置计算费用
- 支持不同模型的定价策略

***

## 相关文档

- 计划文档：`.trae/documents/ai-model-settings-redesign.md`
- 原有重构文档：`docs/REMOVE_LLM_CHAT_MODE.md`
