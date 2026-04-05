# 缓存定价功能与AI聚合平台集成计划

## 背景说明

### 什么是缓存命中/未命中价格？

**缓存命中 (Cache Hit)**：当 API 请求中包含与之前请求相同的前缀内容（如系统提示词、工具定义、长文档等），API 服务商会复用之前处理过的结果，从而大幅降低计算成本和延迟。这种情况下，输入 token 的价格会大幅折扣。

**缓存未命中 (Cache Miss)**：当请求的内容没有被缓存过，需要完整处理所有输入 token，按标准价格计费。

### 各厂商缓存定价对比

| 厂商            | 缓存命中折扣        | 特点                     |
| ------------- | ------------- | ---------------------- |
| **OpenAI**    | 50%-90% 折扣    | GPT-5 系列折扣更高           |
| **Anthropic** | 90% 折扣 (0.1x) | 缓存写入需额外付费 (1.25x 或 2x) |
| **DeepSeek**  | 75%-87.5% 折扣  | 缓存命中 ¥0.5, 未命中 ¥2-4    |
| **Kimi**      | 75% 折扣        | 缓存命中 ¥1, 未命中 ¥4        |
| **阿里云百炼**     | 90% 折扣        | 缓存命中为标准价的 10%          |

***

## AI 聚合平台说明

### 什么是 AI 聚合平台？

AI 聚合平台提供统一的 API 接口，让用户可以通过一个 API Key 访问多个厂商的模型。每个聚合平台上的模型价格可能与官方价格不同，需要根据实际选择的平台和模型来计算费用。

### 新增聚合平台

#### 1. OpenRouter

* **官网**: <https://openrouter.ai>

* **API 端点**: `https://openrouter.ai/api/v1`

* **模型列表 API**: `GET /models` - 返回所有模型及其价格

* **特点**:

  * 400+ 模型可选

  * 价格透明，API 返回每个模型的详细定价

  * 平台费用：信用卡 5.5%（最低 $0.80），加密货币 5%

  * 支持 BYOK (Bring Your Own Key)

#### 2. DMXAPI

* **官网**: <https://dmxapi.cn>

* **API 端点**: 兼容 OpenAI 格式

* **特点**:

  * 海外模型价格约为官方的 6.8-7 折

  * 人民币计价，避免汇率波动

  * 智能路由系统，自动选择最优模型

  * 支持小额充值（1元起）

#### 3. 硅基流动 (SiliconFlow)

* **官网**: <https://siliconflow.cn>

* **API 端点**: `https://api.siliconflow.cn/v1`

* **模型列表 API**: `GET /models` - 返回模型列表

* **价格页面**: <https://siliconflow.cn/pricing>

* **特点**:

  * 大量免费模型（Qwen2.5-7B, GLM-4-9B 等）

  * 人民币计价

  * 支持 DeepSeek、Qwen、GLM 等主流模型

#### 4. 阿里云百炼

* **官网**: <https://www.aliyun.com/product/bailian>

* **API 端点**: 兼容 OpenAI 格式

* **特点**:

  * 阿里云官方平台

  * 支持 Qwen 系列模型

  * 支持上下文缓存（缓存命中价格约为标准价的 10%）

  * 人民币计价

***

## 实现计划

### 阶段 1: 类型定义扩展

**文件**: `src/types.ts`

#### 1.1 扩展 ModelPricing 接口

```typescript
export interface ModelPricing {
  inputPrice: number;           // 输入价格（缓存未命中）
  outputPrice: number;          // 输出价格
  currency: 'USD' | 'CNY';      // 货币类型
  cacheHitPrice?: number;       // 缓存命中价格（可选）
  cacheWritePrice?: number;     // 缓存写入价格（可选，Anthropic专用）
}
```

#### 1.2 扩展在线提供商类型

```typescript
export type OnlineProvider = 
  | 'google' 
  | 'openai' 
  | 'anthropic' 
  | 'alibaba' 
  | 'deepseek'
  | 'openrouter'      // 新增
  | 'dmxapi'          // 新增
  | 'siliconflow'     // 新增
  | 'bailian';        // 新增（阿里云百炼）
```

#### 1.3 新增聚合平台配置接口

```typescript
export interface AggregatorProvider {
  id: string;
  name: string;
  logo: string;
  apiUrl: string;
  apiKeyUrl: string;
  pricingUrl?: string;          // 价格页面 URL
  supportsModelList: boolean;   // 是否支持获取模型列表
  supportsPricingApi: boolean;  // 是否支持 API 获取价格
  currency: 'USD' | 'CNY';
}
```

### 阶段 2: 聚合平台配置

**文件**: `src/config/aggregatorProviders.ts` (新建)

```typescript
export const AGGREGATOR_PROVIDERS: Record<string, AggregatorProvider> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    logo: 'https://openrouter.ai/favicon.ico',
    apiUrl: 'https://openrouter.ai/api/v1',
    apiKeyUrl: 'https://openrouter.ai/keys',
    pricingUrl: 'https://openrouter.ai/models',
    supportsModelList: true,
    supportsPricingApi: true,  // OpenRouter API 返回价格信息
    currency: 'USD',
  },
  dmxapi: {
    id: 'dmxapi',
    name: 'DMXAPI',
    logo: 'https://dmxapi.cn/favicon.ico',
    apiUrl: 'https://api.dmxapi.cn/v1',
    apiKeyUrl: 'https://dmxapi.cn',
    pricingUrl: 'https://dmxapi.cn/pricing',
    supportsModelList: true,
    supportsPricingApi: false,  // 需要从价格页面获取
    currency: 'CNY',
  },
  siliconflow: {
    id: 'siliconflow',
    name: '硅基流动',
    logo: 'https://siliconflow.cn/favicon.ico',
    apiUrl: 'https://api.siliconflow.cn/v1',
    apiKeyUrl: 'https://cloud.siliconflow.cn',
    pricingUrl: 'https://siliconflow.cn/pricing',
    supportsModelList: true,
    supportsPricingApi: false,  // 需要从价格页面获取
    currency: 'CNY',
  },
  bailian: {
    id: 'bailian',
    name: '阿里云百炼',
    logo: 'https://www.aliyun.com/favicon.ico',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey',
    pricingUrl: 'https://help.aliyun.com/zh/model-studio/billing-for-model-studio',
    supportsModelList: true,
    supportsPricingApi: false,
    currency: 'CNY',
  },
};
```

### 阶段 3: 价格获取服务

**文件**: `src/services/pricingService.ts` (新建)

```typescript
import { ModelPricing } from '../types';

// OpenRouter 模型价格 API 响应格式
interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;      // 输入价格（每 token，美元）
    completion: string;  // 输出价格（每 token，美元）
    image?: string;
    request?: string;
  };
  context_length: number;
}

// 从 OpenRouter API 获取模型价格
export async function fetchOpenRouterPricing(
  modelId: string
): Promise<ModelPricing | null> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    const data = await response.json();
    
    const model = data.data.find((m: OpenRouterModel) => m.id === modelId);
    if (model?.pricing) {
      // OpenRouter 返回的是每 token 价格，需要转换为每百万 tokens
      return {
        inputPrice: parseFloat(model.pricing.prompt) * 1000000,
        outputPrice: parseFloat(model.pricing.completion) * 1000000,
        currency: 'USD',
      };
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch OpenRouter pricing:', error);
    return null;
  }
}

// 从聚合平台获取模型列表
export async function fetchAggregatorModels(
  provider: string,
  apiKey?: string
): Promise<string[]> {
  // 实现从各聚合平台获取模型列表的逻辑
}

// 获取模型价格（统一接口）
export async function fetchModelPricing(
  provider: string,
  modelId: string,
  apiKey?: string
): Promise<ModelPricing | null> {
  switch (provider) {
    case 'openrouter':
      return fetchOpenRouterPricing(modelId);
    // 其他平台的实现...
    default:
      return null;
  }
}
```

### 阶段 4: 预定义定价数据更新

**文件**: `src/data/modelPricing.ts`

更新预定义模型定价，添加缓存价格和聚合平台价格：

```typescript
// 官方模型价格（含缓存定价）
export const OFFICIAL_PRICING: Record<string, ModelPricing> = {
  // OpenAI 模型
  'gpt-4o': { 
    inputPrice: 2.5, 
    outputPrice: 10, 
    currency: 'USD',
    cacheHitPrice: 1.25  // 50% 折扣
  },
  
  // Anthropic 模型
  'claude-3-5-sonnet': { 
    inputPrice: 3, 
    outputPrice: 15, 
    currency: 'USD',
    cacheHitPrice: 0.30,      // 10% of base
    cacheWritePrice: 3.75     // 1.25x of base
  },
  
  // DeepSeek 模型
  'deepseek-chat': { 
    inputPrice: 2,           // 缓存未命中
    outputPrice: 8, 
    currency: 'CNY',
    cacheHitPrice: 0.5       // 缓存命中
  },
  
  // 阿里云百炼模型
  'qwen-max': { 
    inputPrice: 0.04, 
    outputPrice: 0.12, 
    currency: 'CNY',
    cacheHitPrice: 0.004     // 10% of base
  },
};

// 硅基流动平台价格（与官方不同）
export const SILICONFLOW_PRICING: Record<string, ModelPricing> = {
  'Qwen/Qwen2.5-7B-Instruct': { inputPrice: 0, outputPrice: 0, currency: 'CNY' },  // 免费
  'Qwen/Qwen2.5-72B-Instruct': { inputPrice: 4.13, outputPrice: 4.13, currency: 'CNY' },
  'deepseek-ai/DeepSeek-V3': { inputPrice: 2, outputPrice: 8, currency: 'CNY' },
};
```

### 阶段 5: 定价计算更新

**文件**: `src/utils/pricing.ts`

```typescript
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

### 阶段 6: 模型配置表单 UI 更新

**文件**: `src/components/ModelConfigForm.tsx`

#### 6.1 更新提供商选择

在在线模型提供商列表中新增聚合平台选项。

#### 6.2 添加缓存价格输入字段

```
┌─────────────────────────────────────────────────────┐
│  定价配置（每百万tokens）                    [获取价格] │
├─────────────────────────────────────────────────────┤
│  输入价格（缓存未命中）    │  输出价格               │
│  [$ 2.50]                │  [$ 10.00]             │
├─────────────────────────────────────────────────────┤
│  缓存命中价格（可选）      │  缓存写入价格（可选）    │
│  [$ 1.25]                │  [$ 3.75]              │
├─────────────────────────────────────────────────────┤
│  💡 缓存命中价格通常为输入价格的 10%-50%            │
└─────────────────────────────────────────────────────┘
```

#### 6.3 "获取价格"按钮功能

* 对于 OpenRouter：调用 API 获取实时价格

* 对于其他平台：从预定义数据中查找价格

* 显示价格来源提示（API获取/预定义数据）

***

## 实现步骤

### Step 1: 更新类型定义

* [ ] 修改 `src/types.ts` 中的 `ModelPricing` 接口

* [ ] 添加 `OnlineProvider` 新类型

* [ ] 添加 `AggregatorProvider` 接口

### Step 2: 创建聚合平台配置

* [ ] 新建 `src/config/aggregatorProviders.ts`

* [ ] 定义各聚合平台的配置信息

### Step 3: 创建价格获取服务

* [ ] 新建 `src/services/pricingService.ts`

* [ ] 实现 OpenRouter API 价格获取

* [ ] 实现模型列表获取功能

### Step 4: 更新预定义定价数据

* [ ] 更新 `src/data/modelPricing.ts`

* [ ] 添加缓存价格字段

* [ ] 添加聚合平台价格数据

### Step 5: 更新定价计算工具

* [ ] 修改 `src/utils/pricing.ts`

* [ ] 支持缓存定价计算

### Step 6: 更新模型配置表单

* [ ] 添加聚合平台选项

* [ ] 添加缓存价格输入字段

* [ ] 实现"获取价格"按钮功能

* [ ] 实现自动填充预定义价格

### Step 7: 更新 Token 使用统计

* [ ] 修改费用计算逻辑

* [ ] 支持缓存定价显示

### Step 8: 更新文档

* [ ] 更新 `AI_MODEL_SETTINGS_REFACTOR.md`

***

## 注意事项

1. **价格数据来源**

   * OpenRouter：API 实时获取

   * 其他平台：预定义数据，需定期更新

   * 建议在 UI 中标注"最后更新时间"

2. **API 支持**

   * 部分厂商 API 会返回缓存命中 token 数量

   * OpenAI: `usage.prompt_tokens_details.cached_tokens`

   * Anthropic: `usage.cache_read_input_tokens`

3. **向后兼容**

   * 缓存价格字段设为可选

   * 不影响现有配置

4. **用户体验**

   * 提供"获取价格"按钮

   * 显示价格来源和更新时间

   * 聚合平台模型选择后自动填充价格

***

## 预期效果

1. 支持配置 OpenRouter、DMXAPI、硅基流动、阿里云百炼等聚合平台
2. 用户可以配置模型的缓存命中价格
3. 点击"获取价格"按钮可自动获取/填充价格
4. Token 使用统计会根据缓存命中情况计算更准确的费用
5. 支持各主流厂商和聚合平台的定价机制

