# AI 模型设置后续工作计划

**创建日期：** 2026-04-02

## 概述

本计划基于 `docs/AI_MODEL_SETTINGS_REFACTOR.md` 文档中的后续工作部分，包含三个主要任务：
1. 实现 Token 使用记录
2. 优化模型连接检测
3. 完善定价计算

---

## 任务一：实现 Token 使用记录

### 1.1 全局状态扩展

**文件**: `src/context/GlobalStateContext.tsx`

**修改内容**:
- 添加 `tokenUsageRecords: TokenUsageRecord[]` 状态
- 添加 `addTokenUsageRecord(record: TokenUsageRecord)` 方法
- 添加 `getTokenUsageStats(modelId?: string, timeRange?: string)` 方法
- 添加 `clearTokenUsageRecords()` 方法
- 实现 localStorage 持久化（key: `nexus_token_usage_records`）

**数据结构** (已在 `src/types.ts` 中定义):
```typescript
interface TokenUsageRecord {
  id: string;
  modelId: string;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}
```

### 1.2 API 调用埋点

**文件**: `src/agent/llm/functionCalling.ts`

**修改内容**:
- 在 `callLLMWithTools` 函数中，解析响应中的 `usage` 字段
- 在 `streamLLMWithTools` 函数中，流式响应结束后记录 token 使用量
- 添加回调函数 `onTokenUsage?: (usage: { inputTokens: number; outputTokens: number }) => void`

**API 响应中的 usage 字段**:
```json
{
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 50,
    "total_tokens": 150
  }
}
```

### 1.3 ReActEngine 集成

**文件**: `src/agent/runtime/ReActEngine.ts`

**修改内容**:
- 在 `callLLMStream` 方法中接收 token 使用回调
- 将 token 使用信息传递给全局状态

### 1.4 useAgentExecution Hook 集成

**文件**: `src/hooks/useAgentExecution.ts`

**修改内容**:
- 添加 `onTokenUsage` 回调
- 调用全局状态的 `addTokenUsageRecord` 方法

### 1.5 TokenUsageChart 组件更新

**文件**: `src/components/TokenUsageChart.tsx`

**修改内容**:
- 从全局状态读取 `tokenUsageRecords`
- 根据时间范围过滤数据
- 计算并显示实际的 token 使用量和费用
- 移除"暂无使用数据"的空状态覆盖层

---

## 任务二：优化模型连接检测

### 2.1 添加定期检测机制

**文件**: `src/context/GlobalStateContext.tsx`

**修改内容**:
- 添加 `startModelHealthCheck()` 方法，启动定时检测（每 30 秒）
- 添加 `stopModelHealthCheck()` 方法，停止定时检测
- 添加 `checkModelConnection(modelId: string)` 方法，检测单个模型

### 2.2 模型状态更新

**文件**: `src/components/ModelConfigCard.tsx`

**修改内容**:
- 显示更详细的连接状态信息
- 添加"检测中..."状态显示
- 显示最后连接时间和错误信息

### 2.3 连接检测服务

**新建文件**: `src/services/modelHealthCheck.ts`

**功能**:
- `checkModelHealth(config: ModelConfig): Promise<{ status: 'active' | 'error', error?: string, latency?: number }>`
- 支持不同提供商的检测方式
- 超时处理（使用模型配置中的 timeout 设置）

### 2.4 SettingsView 集成

**文件**: `src/components/SettingsView.tsx`

**修改内容**:
- 在设置面板打开时启动健康检测
- 在设置面板关闭时停止健康检测
- 显示所有模型的实时状态

---

## 任务三：完善定价计算

### 3.1 定价计算工具函数

**新建文件**: `src/utils/pricing.ts`

**功能**:
```typescript
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing
): number;

function formatCost(cost: number, currency: 'USD' | 'CNY'): string;

function getExchangeRate(): number; // USD to CNY
```

### 3.2 TokenUsageRecord 生成时计算费用

**文件**: `src/context/GlobalStateContext.tsx`

**修改内容**:
- 在 `addTokenUsageRecord` 中，根据模型定价配置自动计算费用
- 如果模型没有定价配置，费用为 0

### 3.3 TokenUsageChart 费用显示

**文件**: `src/components/TokenUsageChart.tsx`

**修改内容**:
- 显示各模型的费用明细
- 支持货币切换显示（USD/CNY）
- 显示费用趋势图

---

## 实现顺序

1. **Phase 1: Token 使用记录基础**
   - 1.1 全局状态扩展
   - 1.2 API 调用埋点
   - 1.5 TokenUsageChart 组件更新

2. **Phase 2: 定价计算**
   - 3.1 定价计算工具函数
   - 3.2 TokenUsageRecord 生成时计算费用
   - 3.3 TokenUsageChart 费用显示

3. **Phase 3: 模型连接检测**
   - 2.3 连接检测服务
   - 2.1 添加定期检测机制
   - 2.2 模型状态更新
   - 2.4 SettingsView 集成

---

## 文件修改清单

| 文件 | 操作 | 任务 |
|------|------|------|
| `src/context/GlobalStateContext.tsx` | 修改 | 1.1, 2.1, 3.2 |
| `src/agent/llm/functionCalling.ts` | 修改 | 1.2 |
| `src/agent/runtime/ReActEngine.ts` | 修改 | 1.3 |
| `src/hooks/useAgentExecution.ts` | 修改 | 1.4 |
| `src/components/TokenUsageChart.tsx` | 修改 | 1.5, 3.3 |
| `src/components/ModelConfigCard.tsx` | 修改 | 2.2 |
| `src/components/SettingsView.tsx` | 修改 | 2.4 |
| `src/services/modelHealthCheck.ts` | 新建 | 2.3 |
| `src/utils/pricing.ts` | 新建 | 3.1 |

---

## 注意事项

1. **Token 使用记录存储限制**
   - 建议只保留最近 30 天的数据
   - 或限制最大记录数为 10000 条
   - 避免 localStorage 超出限制

2. **流式响应的 Token 统计**
   - 部分模型 API 在流式响应中不返回 usage 信息
   - 需要考虑使用估算方法（基于字符数）
   - 或在非流式模式下获取准确数据

3. **模型连接检测的并发控制**
   - 避免同时检测所有模型
   - 使用队列或限制并发数
   - 考虑用户网络状况

4. **定价数据的准确性**
   - 不同模型厂商的定价可能随时变化
   - 建议在模型配置时手动输入定价
   - 或提供在线查询定价的功能（后续）
