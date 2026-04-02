# AI模型设置界面重构计划

## 概述

重新设计AI模型设置页面，从单一模型配置改为支持多模型管理，用户可以添加、编辑、删除和排序多个AI模型配置。

## 需求分析

### 当前问题
- 设置界面只支持单一模型配置
- 无法管理多个模型
- 缺少模型状态显示和优先级管理

### 目标功能
1. **已连接模型列表**
   - 空列表时显示虚线边框占位符
   - 有模型时显示实线边框列表
   - 每个列表项显示：模型名称、提供商、运行状态、优先级
   
2. **添加模型功能**
   - 右上角"+"按钮触发添加模式
   - 显示完整的模型配置表单
   - "添加模型"按钮完成添加

3. **模型管理功能**
   - 停用/启用模型
   - 编辑模型配置
   - 删除模型
   - 优先级排序（拖拽或上下移动）

---

## 实现步骤

### 第一步：定义新的数据类型

**文件**: `src/types.ts`

新增 `ModelConfig` 接口：
```typescript
export interface ModelConfig {
  id: string;
  name: string;              // 模型名称（用户自定义）
  modelId: string;           // 实际模型ID
  provider: 'lm-studio' | 'ollama' | 'online';
  onlineProvider?: string;   // 在线提供商 (google, openai, anthropic等)
  apiUrl?: string;           // 本地模型API地址
  apiKey?: string;           // 在线模型API密钥
  maxContextLength: number;
  temperature: number;
  systemPrompt?: string;
  status: 'active' | 'inactive' | 'error';
  priority: number;          // 优先级顺序
  lastConnected?: number;    // 最后连接时间
  createdAt: number;
}
```

### 第二步：更新全局状态管理

**文件**: `src/context/GlobalStateContext.tsx`

1. 添加 `modelConfigs` 状态（模型配置列表）
2. 添加 `activeModelId` 状态（当前激活的模型ID）
3. 添加 CRUD 方法：
   - `addModelConfig(config: ModelConfig)`
   - `updateModelConfig(id: string, config: Partial<ModelConfig>)`
   - `deleteModelConfig(id: string)`
   - `setActiveModel(id: string)`
   - `reorderModelConfigs(id: string, newPriority: number)`

4. 移除旧的单一模型状态（保留作为默认值参考）

### 第三步：重构 SettingsView 组件

**文件**: `src/components/SettingsView.tsx`

#### 3.1 新增状态
```typescript
const [isAddingModel, setIsAddingModel] = useState(false);
const [editingModelId, setEditingModelId] = useState<string | null>(null);
const [newModelConfig, setNewModelConfig] = useState<Partial<ModelConfig>>({});
```

#### 3.2 UI 结构重构

```
AI模型设置
├── 已连接模型列表（卡片区域）
│   ├── 标题 + "+"按钮
│   ├── 空状态占位符（虚线边框）
│   └── 模型列表项（实线边框）
│       ├── 模型信息（名称、提供商、状态、优先级）
│       └── 操作按钮（停用/编辑/删除）
│
└── 添加/编辑模型表单（条件显示）
    ├── 提供商选择
    ├── 连接设置（API URL/Key）
    ├── 模型选择
    ├── 高级设置（上下文长度、温度）
    └── 操作按钮（添加模型/取消）
```

#### 3.3 组件拆分

创建子组件：
- `ModelConfigList` - 模型列表展示
- `ModelConfigCard` - 单个模型卡片
- `ModelConfigForm` - 模型配置表单

### 第四步：实现模型状态检测

1. 添加 `testModelConnection` 函数
2. 定期检测模型连接状态
3. 更新模型状态显示

### 第五步：实现优先级排序

1. 拖拽排序（使用 dnd-kit 或类似库）
2. 或简单的上下移动按钮

### 第六步：更新其他组件

确保其他组件使用 `modelConfigs` 和 `activeModelId`：
- `ChatView.tsx`
- `ChatInput.tsx`
- `Header.tsx`
- `useAgentExecution.ts`

---

## 文件修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/types.ts` | 修改 | 添加 ModelConfig 类型 |
| `src/context/GlobalStateContext.tsx` | 修改 | 添加模型列表状态和方法 |
| `src/components/SettingsView.tsx` | 重构 | 重写AI模型设置部分 |
| `src/components/ModelConfigCard.tsx` | 新建 | 模型配置卡片组件 |
| `src/components/ModelConfigForm.tsx` | 新建 | 模型配置表单组件 |
| `src/i18n/locales/zh.json` | 修改 | 添加新的翻译文本 |
| `src/i18n/locales/en.json` | 修改 | 添加新的翻译文本 |

---

## UI 设计参考

### 空状态
```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│                                         │
│         暂无已连接的模型                 │
│      点击右上角 + 添加模型              │
│                                         │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

### 有模型状态
```
┌─────────────────────────────────────────┐
│  已连接模型                        [+]  │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 🟢 GPT-4o                           │ │
│ │    OpenAI · 在线 · 优先级 1         │ │
│ │                    [停用][编辑][删除]│ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 🟡 Qwen-Plus                        │ │
│ │    Alibaba · 在线 · 优先级 2        │ │
│ │                    [启用][编辑][删除]│ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ ⚫ Local-Model                      │ │
│ │    LM Studio · 本地 · 优先级 3      │ │
│ │                    [启用][编辑][删除]│ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### 添加模型表单
```
┌─────────────────────────────────────────┐
│  添加新模型                              │
├─────────────────────────────────────────┤
│  提供商                                  │
│  [LM Studio] [Ollama] [在线模型]        │
│                                          │
│  API URL                                 │
│  [http://localhost:1234/v1/chat/...    ]│
│                                          │
│  模型名称                                │
│  [local-model                          ]│
│                                          │
│  最大上下文长度                          │
│  [====●================] 4096           │
│                                          │
│  温度                                    │
│  [========●============] 0.7            │
│                                          │
│            [取消]  [添加模型]            │
└─────────────────────────────────────────┘
```

---

## 实施顺序

1. ✅ 定义数据类型
2. ✅ 更新全局状态
3. ✅ 创建子组件
4. ✅ 重构 SettingsView
5. ✅ 更新翻译文件
6. ✅ 测试验证
