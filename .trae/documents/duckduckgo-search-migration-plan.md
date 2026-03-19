# DuckDuckGo 搜索功能迁移计划：从 Node.js 到 Rust

## 问题分析

### 当前状态
- 搜索功能在 `server.ts` 中通过 Express 服务器实现
- 前端通过 `fetch('/api/search', ...)` 调用搜索 API
- 使用 DuckDuckGo HTML 页面爬取 + cheerio 解析

### 问题根源
- 运行 `npm run tauri dev` 时，Express 服务器不会启动
- `/api/search` 端点不可用，导致网络搜索功能失效

## 迁移方案

### 技术选型
| 功能 | Node.js (当前) | Rust (迁移后) |
|------|---------------|---------------|
| HTTP 客户端 | fetch (原生) | reqwest |
| HTML 解析 | cheerio | scraper |
| API 暴露 | Express 路由 | Tauri command |

### 实现步骤

#### 步骤 1: 添加 Rust 依赖
在 `src-tauri/Cargo.toml` 中添加：
```toml
reqwest = { version = "0.11", features = ["blocking"] }
scraper = "0.18"
urlencoding = "2.1"
```

#### 步骤 2: 创建搜索模块
在 `src-tauri/src/` 中创建 `search.rs` 模块：
- 定义 `SearchResult` 结构体
- 实现 `duckduckgo_search` 函数
- 解析 DuckDuckGo HTML 响应
- 处理 URL 重定向清理

#### 步骤 3: 注册 Tauri Command
在 `lib.rs` 中：
- 导入搜索模块
- 注册 `search` command
- 配置权限

#### 步骤 4: 更新前端代码
在 `src/App.tsx` 中：
- 导入 `@tauri-apps/api` 的 `invoke`
- 将 `fetch('/api/search', ...)` 替换为 `invoke('search', { query })`
- 保持返回数据结构兼容

#### 步骤 5: 配置 Tauri 权限
在 `src-tauri/capabilities/default.json` 中添加网络访问权限

## 详细实现

### 文件变更清单

1. **`src-tauri/Cargo.toml`** - 添加依赖
2. **`src-tauri/src/search.rs`** - 新建搜索模块
3. **`src-tauri/src/lib.rs`** - 注册 command
4. **`src/App.tsx`** - 更新前端调用方式
5. **`src-tauri/capabilities/default.json`** - 配置权限

### 数据结构

```rust
// Rust 端
#[derive(serde::Serialize)]
pub struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}
```

```typescript
// TypeScript 端 (保持不变)
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}
```

### 搜索逻辑对比

**Node.js (当前):**
```typescript
const searchRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
  headers: {
    'User-Agent': 'Mozilla/5.0 ...'
  }
});
const html = await searchRes.text();
const $ = cheerio.load(html);
// 解析 .result 元素
```

**Rust (迁移后):**
```rust
let client = reqwest::blocking::Client::new();
let response = client
    .get("https://html.duckduckgo.com/html/")
    .query(&[("q", query)])
    .header("User-Agent", "Mozilla/5.0 ...")
    .send()?;
let html = response.text()?;
let document = Html::parse_document(&html);
// 使用 scraper 解析 .result 元素
```

## 风险与注意事项

1. **网络权限**: Tauri 需要正确配置 HTTP 权限
2. **异步处理**: Rust 的 reqwest 可以使用异步或阻塞模式，Tauri command 支持异步
3. **错误处理**: 需要妥善处理网络错误和解析错误
4. **URL 解码**: DuckDuckGo 的重定向 URL 需要正确解码

## 测试计划

1. 编译 Rust 代码确认无错误
2. 运行 `npm run tauri dev` 测试搜索功能
3. 验证搜索结果格式与之前一致
4. 测试错误情况（网络断开、无结果等）
