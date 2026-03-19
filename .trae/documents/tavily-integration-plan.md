# Tavily 深度集成计划

## 概述

将 Tavily 搜索引擎深度集成到 Nexus AI Assistant 的 web_search 工具中，作为现有的百度/Bing/DuckDuckGo 搜索引擎的高级替代选项。

## Tavily 优势分析

| 特性 | 现有方案 | Tavily |
|------|---------|--------|
| 结果质量 | 需要手动解析 HTML，结果质量不稳定 | AI 优化的搜索结果，专为 RAG 设计 |
| 内容提取 | 仅返回标题和摘要 | 可返回完整网页内容（markdown/text） |
| 相关性评分 | 简单关键词匹配 | AI 驱动的相关性评分 |
| 额外功能 | 仅搜索 | Search + Extract + Crawl + Map |
| 国内访问 | 百度可用，其他不稳定 | 需要网络访问 API |
| 成本 | 免费 | 每月 1000 次免费 |

## 实现方案

### 方案选择：前端集成

**理由**：
1. Tavily 提供 JavaScript SDK (`@tavily/core`)，前端集成更简单
2. API Key 存储在前端，用户可以自行管理
3. 不需要修改 Rust 后端
4. 与现有的 `http_request` 工具模式一致

### 架构设计

```
用户选择 Tavily 搜索引擎
         ↓
前端检查 Tavily API Key
         ↓
    ┌────────────────────────────────────┐
    │        web_search 工具执行          │
    │  ┌─────────────┬──────────────────┐│
    │  │   Tavily    │   现有引擎       ││
    │  │  (前端SDK)  │  (Rust后端)     ││
    │  └─────────────┴──────────────────┘│
    └────────────────────────────────────┘
         ↓
返回统一的 SearchResult 格式
```

## 实现步骤

### 第一阶段：基础集成

#### 1. 安装依赖
```bash
npm install @tavily/core
```

#### 2. 添加 Tavily 配置存储

**文件**: `src/context/GlobalStateContext.tsx`

新增状态：
- `tavilyApiKey: string` - Tavily API Key
- `tavilyEnabled: boolean` - 是否启用 Tavily

#### 3. 更新设置界面

**文件**: `src/components/SettingsView.tsx`

新增 Tavily 配置区域：
- API Key 输入框（密码类型）
- 启用/禁用开关
- 获取 API Key 链接（https://app.tavily.com）
- 使用说明

#### 4. 修改 web_search 工具

**文件**: `src/agent/tools/builtin.ts`

修改 `createWebSearchTool` 函数：
- 检查是否配置了 Tavily API Key
- 如果配置了，优先使用 Tavily SDK
- 否则 fallback 到现有的 Rust 后端搜索

#### 5. 统一搜索结果格式

将 Tavily 的结果格式转换为现有的 `SearchResult` 格式：
```typescript
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;      // Tavily 特有
  content?: string;    // Tavily 特有（可选的完整内容）
}
```

### 第二阶段：高级功能

#### 6. 添加 Tavily Extract 工具

新增 `web_extract` 工具：
- 从 URL 提取网页内容
- 支持 markdown/text 格式输出
- 可提取图片

#### 7. 添加 Tavily Crawl 工具

新增 `web_crawl` 工具：
- 从 URL 开始爬取网站
- 支持深度和广度控制
- 支持自然语言指令

#### 8. 添加 Tavily Map 工具

新增 `web_map` 工具：
- 发现网站的所有 URL
- 支持路径过滤

### 第三阶段：优化体验

#### 9. 搜索结果增强

- 显示 Tavily 的相关性评分
- 可选显示完整网页内容
- 显示 favicon 图标

#### 10. 错误处理和降级

- API Key 无效时提示用户
- 网络错误时自动降级到现有引擎
- 配额用尽时提示用户

## 文件修改清单

| 文件 | 修改内容 |
|------|---------|
| `package.json` | 添加 `@tavily/core` 依赖 |
| `src/context/GlobalStateContext.tsx` | 添加 `tavilyApiKey`, `tavilyEnabled` 状态 |
| `src/components/SettingsView.tsx` | 添加 Tavily 配置 UI |
| `src/agent/tools/builtin.ts` | 修改 `createWebSearchTool`，添加 Tavily 支持 |
| `src/agent/tools/types.ts` | 扩展 `SearchResult` 类型（可选） |
| `src/i18n/locales/zh.json` | 添加中文翻译 |
| `src/i18n/locales/en.json` | 添加英文翻译 |

## 新增工具定义

### web_search (增强版)

```typescript
{
  name: 'web_search',
  description: 'Search the web for current information...',
  parameters: {
    query: string,           // 搜索查询
    max_results: number,     // 最大结果数 (1-20)
    search_depth: 'basic' | 'advanced',  // Tavily 专用
    include_answer: boolean, // 是否包含 AI 生成的答案
    include_raw_content: boolean, // 是否包含完整网页内容
  }
}
```

### web_extract (新增)

```typescript
{
  name: 'web_extract',
  description: 'Extract content from web pages...',
  parameters: {
    urls: string[],          // 要提取的 URL 列表
    format: 'markdown' | 'text',
    include_images: boolean,
  }
}
```

### web_crawl (新增)

```typescript
{
  name: 'web_crawl',
  description: 'Crawl a website starting from a URL...',
  parameters: {
    url: string,             // 起始 URL
    max_depth: number,       // 最大深度
    max_breadth: number,     // 每层最大链接数
    limit: number,           // 总链接数限制
    instructions: string,    // 自然语言指令
  }
}
```

## UI 设计

### 设置界面 - Tavily 配置

```
┌─────────────────────────────────────────────────┐
│ 网络搜索                                         │
├─────────────────────────────────────────────────┤
│                                                 │
│  搜索引擎                                        │
│  ┌─────────────────────────────────────────┐   │
│  │ ▼ Tavily (推荐)                          │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─ Tavily 配置 ─────────────────────────────┐ │
│  │                                           │ │
│  │  API Key                                  │ │
│  │  ┌─────────────────────┐ ┌───────────┐   │ │
│  │  │ •••••••••••••••••••• │ │ 获取 Key  │   │ │
│  │  └─────────────────────┘ └───────────┘   │ │
│  │                                           │ │
│  │  ☑ 启用 Tavily 搜索                       │ │
│  │                                           │ │
│  │  搜索深度                                  │ │
│  │  ○ Basic (快速)  ● Advanced (详细)        │ │
│  │                                           │ │
│  │  ☑ 包含 AI 生成的答案                     │ │
│  │  ☐ 包含完整网页内容                       │ │
│  │                                           │ │
│  │  💡 每月 1000 次免费调用                   │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
└─────────────────────────────────────────────────┘
```

## 风险和注意事项

1. **API Key 安全**: 存储在 localStorage，仅客户端使用，不会发送到服务器
2. **网络访问**: Tavily API 需要能够访问 `api.tavily.com`
3. **配额管理**: 需要提示用户剩余配额（Tavily 响应中包含 usage 信息）
4. **降级策略**: 当 Tavily 不可用时，自动使用现有搜索引擎

## 测试计划

1. **单元测试**: 测试 Tavily SDK 调用和结果转换
2. **集成测试**: 测试完整的搜索流程
3. **降级测试**: 测试 API Key 无效时的降级逻辑
4. **UI 测试**: 测试设置界面的交互

## 时间估算

- 第一阶段（基础集成）: 2-3 小时
- 第二阶段（高级功能）: 2-3 小时
- 第三阶段（优化体验）: 1-2 小时
- 测试和文档: 1 小时

**总计**: 约 6-9 小时
