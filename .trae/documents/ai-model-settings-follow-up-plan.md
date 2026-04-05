# AI 模型设置后续开发计划

**创建日期：** 2026-04-05

**基于文档：** `docs/AI_MODEL_SETTINGS_REFACTOR.md`

## 概述

本计划基于已完成的 AI 模型设置重构功能，规划后续开发项目，主要包括：

1. 定期自动检测模型连接状态
2. 显示更详细的错误信息
3. 根据实际 token 使用量和定价配置计算费用
4. 支持不同模型的定价策略
5. 恢复 Agent 模式下的 Token 显示功能
6. 修复监视器面板的 Token 消耗显示

***

## 问题分析

### 1. Agent 模式下 Token 显示缺失

**问题描述：**

* 原先简单的 LLM 调用聊天已经集成了 token 数量显示功能

* 升级到 Agent 后，消息气泡下的 token 数量、速度等信息消失

**原因分析：**

* `App.tsx` 中的 `handleAgentExecution` 函数在完成时只设置了 `content` 和 `status`

* 没有设置消息对象的 `tokenCount`、`tokenSpeed`、`executionTime` 属性

* `useAgentExecution.ts` 中的 `onTokenUsage` 回调只记录到全局存储，未更新消息对象

**相关文件：**

* `src/App.tsx` - 消息处理逻辑

* `src/hooks/useAgentExecution.ts` - Agent 执行 Hook

* `src/components/ChatView.tsx` - 消息显示组件

### 2. 监视器面板 Token 消耗显示不正确

**问题描述：**

* 右侧面板-监视器-系统资源面板的"当前 Token 消耗"显示的是估算值

* 不是实际的 token 使用量

**原因分析：**

* `GlobalStateContext.tsx` 中 `currentTokenCount` 是根据消息内容长度估算的

* 实际 token 使用量存储在 `tokenUsageRecords` 中

**相关文件：**

* `src/context/GlobalStateContext.tsx` - 全局状态管理

* `src/components/ToolPanel.tsx` - 监视器面板组件

### 3. 模型连接状态未自动检测

**问题描述：**

* 已实现 `checkModelConnection`、`startModelHealthCheck`、`stopModelHealthCheck` 方法

* 但未在应用启动时自动启动健康检查

**相关文件：**

* `src/context/GlobalStateContext.tsx` - 健康检查方法

* `src/services/modelHealthCheck.ts` - 健康检查服务

### 4. Token 费用计算未实现

**问题描述：**

* `pricing.ts` 中有 `calculateCost` 函数

* 但添加 token 使用记录时 `cost` 总是设为 0

**相关文件：**

* `src/utils/pricing.ts` - 定价计算工具

* `src/hooks/useAgentExecution.ts` - Token 记录逻辑

* `src/context/GlobalStateContext.tsx` - 全局状态管理

***

## 开发任务

### 任务 1：恢复 Agent 模式下的 Token 显示

**优先级：** 高

**目标：** 在 AI 回复消息气泡下显示实际的 token 数量、速度和执行时间

**实现步骤：**

1. **修改** **`useAgentExecution.ts`**

   * 添加状态变量记录当前执行的 token 使用量

   * 在 `onTokenUsage` 回调中更新状态

   * 返回 `lastTokenUsage` 供外部使用

2. **修改** **`App.tsx`**

   * 在 `handleAgentExecution` 完成时获取 token 使用量

   * 计算执行时间和 token 速度

   * 更新消息对象的 `tokenCount`、`tokenSpeed`、`executionTime` 属性

3. **修改** **`ChatView.tsx`**

   * 确认 token 信息显示逻辑正确（已存在，无需修改）

**代码修改点：**

```typescript
// useAgentExecution.ts - 添加状态和返回值
const [lastTokenUsage, setLastTokenUsage] = useState<{ inputTokens: number; outputTokens: number } | null>(null);

// 在 onTokenUsage 回调中
onTokenUsage: (usage) => {
  setLastTokenUsage(usage);
  // ... 现有逻辑
}

// 返回值添加
return {
  // ... 现有返回值
  lastTokenUsage,
}
```

```typescript
// App.tsx - 在 handleAgentExecution 完成时
const startTime = Date.now();
// ... 执行
const executionTime = Date.now() - startTime;
const tokenUsage = agentExecution.lastTokenUsage;
const tokenCount = tokenUsage ? tokenUsage.inputTokens + tokenUsage.outputTokens : 0;
const tokenSpeed = executionTime > 0 ? Math.round(tokenCount / (executionTime / 1000)) : 0;

setMessages(prev => prev.map(m => {
  if (m.id === assistantMessageId) {
    return {
      ...m,
      content: result,
      timestamp: Date.now(),
      tokenCount,
      tokenSpeed,
      executionTime,
      agentExecution: {
        ...m.agentExecution!,
        status: 'completed',
      }
    };
  }
  return m;
}));
```

***

### 任务 2：修复监视器面板 Token 消耗显示

**优先级：** 高

**目标：** 显示实际的 token 消耗数值，而非估算值

**实现步骤：**

1. **修改** **`GlobalStateContext.tsx`**

   * 添加 `sessionTokenUsage` 状态，存储当前会话的 token 使用量

   * 在添加 token 记录时更新当前会话的 token 使用量

   * 切换会话时重新计算 token 使用量

2. **修改** **`ToolPanel.tsx`**

   * 使用 `sessionTokenUsage` 替代 `currentTokenCount`

   * 显示输入/输出 token 分项

**代码修改点：**

```typescript
// GlobalStateContext.tsx - 添加状态
const [sessionTokenUsage, setSessionTokenUsage] = useState<{ input: number; output: number }>({ input: 0, output: 0 });

// 切换会话时重新计算
useEffect(() => {
  const sessionRecords = tokenUsageRecords.filter(r => {
    // 根据 modelId 或其他标识过滤当前会话的记录
    // 这里需要根据实际业务逻辑调整
  });
  const input = sessionRecords.reduce((acc, r) => acc + r.inputTokens, 0);
  const output = sessionRecords.reduce((acc, r) => acc + r.outputTokens, 0);
  setSessionTokenUsage({ input, output });
}, [currentSessionId, tokenUsageRecords]);
```

```typescript
// ToolPanel.tsx - 显示实际 token 使用量
const { sessionTokenUsage } = useGlobalState();

// 在显示区域
<span className="text-base font-mono font-bold text-indigo-500">
  {sessionTokenUsage.input + sessionTokenUsage.output}
</span>
<span className="text-[10px] opacity-50">({sessionTokenUsage.input} in / {sessionTokenUsage.output} out)</span>
```

***

### 任务 3：实现定期自动检测模型连接状态

**优先级：** 中

**目标：** 应用启动时自动启动模型健康检查，定期检测连接状态

**实现步骤：**

1. **修改** **`App.tsx`**

   * 在应用启动时调用 `startModelHealthCheck`

   * 在应用卸载时调用 `stopModelHealthCheck`

2. **修改** **`GlobalStateContext.tsx`**

   * 优化健康检查逻辑，显示更详细的错误信息

   * 添加错误信息状态

3. **修改** **`ModelConfigCard.tsx`**

   * 显示详细的连接错误信息

**代码修改点：**

```typescript
// App.tsx - 在组件挂载时启动健康检查
const { startModelHealthCheck, stopModelHealthCheck, modelConfigs } = useGlobalState();

useEffect(() => {
  if (modelConfigs.length > 0) {
    startModelHealthCheck();
  }
  return () => {
    stopModelHealthCheck();
  };
}, [modelConfigs.length, startModelHealthCheck, stopModelHealthCheck]);
```

***

### 任务 4：实现 Token 费用计算

**优先级：** 中

**目标：** 根据实际 token 使用量和定价配置计算费用

**实现步骤：**

1. **修改** **`useAgentExecution.ts`**

   * 在 `onTokenUsage` 回调中获取模型定价配置

   * 调用 `calculateCost` 计算费用

   * 将费用传递给 `addTokenUsageRecord`

2. **修改** **`GlobalStateContext.tsx`**

   * 添加 `getModelPricing` 方法获取模型定价配置

**代码修改点：**

```typescript
// useAgentExecution.ts - 计算费用
import { calculateCost } from '../utils/pricing';

onTokenUsage: (usage) => {
  const modelConfig = modelConfigs.find(m => m.id === modelIdToUse);
  const cost = calculateCost(usage.inputTokens, usage.outputTokens, modelConfig?.pricing);
  
  addTokenUsageRecord({
    modelId: modelIdToUse,
    timestamp: Date.now(),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cost,
  });
}
```

***

### 任务 5：支持不同模型的定价策略

**优先级：** 低

**目标：** 为不同模型配置不同的定价策略

**实现步骤：**

1. **预定义模型定价**

   * 在 `src/data/modelPricing.ts` 中预定义常见模型的定价

2. **修改** **`ModelConfigForm.tsx`**

   * 根据选择的模型自动填充建议定价

   * 支持自定义定价覆盖

**代码修改点：**

```typescript
// src/data/modelPricing.ts
export const PREDEFINED_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { inputPrice: 2.5, outputPrice: 10, currency: 'USD' },
  'gpt-4o-mini': { inputPrice: 0.15, outputPrice: 0.6, currency: 'USD' },
  'claude-3-opus': { inputPrice: 15, outputPrice: 75, currency: 'USD' },
  'qwen-plus': { inputPrice: 0.0008, outputPrice: 0.002, currency: 'CNY' },
  // ... 更多模型
};
```

***

## 文件修改清单

| 文件                                   | 操作 | 说明                   |
| ------------------------------------ | -- | -------------------- |
| `src/hooks/useAgentExecution.ts`     | 修改 | 添加 token 使用量状态，计算费用  |
| `src/App.tsx`                        | 修改 | 更新消息 token 信息，启动健康检查 |
| `src/context/GlobalStateContext.tsx` | 修改 | 添加会话 token 使用量状态     |
| `src/components/ToolPanel.tsx`       | 修改 | 显示实际 token 使用量       |
| `src/components/ModelConfigCard.tsx` | 修改 | 显示详细错误信息             |
| `src/data/modelPricing.ts`           | 新建 | 预定义模型定价配置            |
| `src/components/ModelConfigForm.tsx` | 修改 | 支持自动填充建议定价           |

***

## 测试计划

1. **Token 显示测试**

   * 发送消息后检查消息气泡下是否显示 token 数量

   * 检查 token 速度计算是否正确

   * 检查执行时间是否正确

2. **监视器面板测试**

   * 检查 Token 消耗显示是否为实际值

   * 切换会话后检查数值是否正确更新

3. **健康检查测试**

   * 启动应用后检查是否自动检测模型连接

   * 断开模型后检查状态是否更新

   * 检查错误信息是否正确显示

4. **费用计算测试**

   * 配置模型定价后检查费用是否正确计算

   * 检查 TokenUsageChart 中的费用显示是否正确

***

## 风险评估

1. **Token 统计准确性**

   * 风险：部分模型可能不返回 token 使用量

   * 缓解：保留估算逻辑作为后备方案

2. **性能影响**

   * 风险：频繁的健康检查可能影响性能

   * 缓解：设置合理的检查间隔（30秒）

3. **定价数据维护**

   * 风险：模型定价可能随时变化

   * 缓解：支持用户自定义定价覆盖

***

## 时间估算

| 任务               | 预计时间     |
| ---------------- | -------- |
| 任务 1：恢复 Token 显示 | 2 小时     |
| 任务 2：修复监视器面板     | 1.5 小时   |
| 任务 3：自动健康检查      | 1 小时     |
| 任务 4：费用计算        | 1 小时     |
| 任务 5：定价策略        | 1.5 小时   |
| 测试和调试            | 2 小时     |
| **总计**           | **9 小时** |

