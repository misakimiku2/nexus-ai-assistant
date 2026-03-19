# 百度搜索集成计划

## 背景

当前项目的 `web_search` 工具支持 DuckDuckGo 和 Bing 搜索引擎，但这两个搜索引擎在国内访问可能不稳定。用户发现 page-assist 项目中的百度搜索代码可以正常工作，希望将其集成到本项目中。

## 代码分析

### 百度搜索代码特点 (baidu.ts)

```typescript
// 使用百度 JSON API
const url = "https://www.baidu.com/s?wd=" + encodeURIComponent(query) + "&tn=json&rn=" + TOTAL_SEARCH_RESULTS;
```

**优势**：
1. **国内访问稳定** - 百度是国内主要搜索引擎
2. **JSON API** - 直接返回结构化数据，无需 HTML 解析
3. **中文搜索优化** - 对中文内容搜索结果更好
4. **简单可靠** - 无需复杂的 HTML 解析逻辑

**API 响应格式**：
```json
{
  "feed": {
    "entry": [
      { "title": "...", "url": "...", "abs": "..." }
    ]
  }
}
```

### 当前项目架构

```
前端 (TypeScript)                    后端 (Rust)
     │                                    │
     ├─ builtin.ts                        ├─ search.rs
     │   └─ createWebSearchTool()         │   ├─ try_duckduckgo_lite()
     │       └─ invoke('search')          │   ├─ try_bing()
     │                                    │   └─ search_async()
     └─ SettingsView.tsx                  │
         └─ 搜索引擎选择 UI               └─ SearchResult struct
```

## 集成方案

### 方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **A. 前端直接调用** | 实现简单，无需修改后端 | 架构不一致，CORS 问题可能需要代理 |
| **B. 后端 Rust 集成** | 架构一致，统一管理 | 需要修改 Rust 代码 |
| **C. 混合方案** | 灵活性高 | 复杂度增加 |

### 推荐方案：B. 后端 Rust 集成

保持项目架构一致性，在 Rust 后端添加百度搜索支持。

## 实现步骤

### 步骤 1: 修改 Rust 后端 - 添加百度搜索引擎

**文件**: `src-tauri/src/search.rs`

1. 在 `SearchEngine` 枚举中添加 `Baidu`:
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchEngine {
    Auto,
    Bing,
    Duckduckgo,
    Baidu,  // 新增
}
```

2. 添加百度搜索函数:
```rust
async fn try_baidu(client: &reqwest::Client, query: &str) -> Option<Vec<SearchResult>> {
    let url = format!(
        "https://www.baidu.com/s?wd={}&tn=json&rn=10",
        urlencoding::encode(query)
    );
    
    let response = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        client.get(&url)
            .header("User-Agent", "Mozilla/5.0 ...")
            .send()
    ).await.ok()??.ok()?;
    
    let json: Value = response.json().await.ok()?;
    
    // 解析百度 JSON 响应
    let entries = json.get("feed")?.get("entry")?.as_array()?;
    
    Some(entries.iter().filter_map(|entry| {
        Some(SearchResult {
            title: entry.get("title")?.as_str()?.to_string(),
            url: entry.get("url")?.as_str()?.to_string(),
            snippet: entry.get("abs")?.as_str()?.unwrap_or("").to_string(),
        })
    }).collect())
}
```

3. 修改 `search_async` 函数，在 Auto 模式下优先尝试百度:
```rust
SearchEngine::Auto => {
    // 优先百度（国内友好）
    if let Some(results) = try_baidu(&client, &query).await {
        if is_result_relevant(&query, &results) {
            return Ok(SearchResponse { results, source: "baidu".to_string() });
        }
    }
    // 回退到 DuckDuckGo
    if let Some(results) = try_duckduckgo_lite(&client, &query).await {
        // ...
    }
    // 最后尝试 Bing
    // ...
}
```

### 步骤 2: 添加 URL 编码依赖

**文件**: `src-tauri/Cargo.toml`

```toml
[dependencies]
urlencoding = "2.1"
```

### 步骤 3: 更新前端设置界面

**文件**: `src/components/SettingsView.tsx`

在搜索引擎下拉列表中添加百度选项:
```tsx
<select id="searchEngine" value={searchEngine} onChange={(e) => setSearchEngine(e.target.value)}>
  <option value="auto">{t('settings.user.searchEngineAuto')}</option>
  <option value="baidu">{t('settings.user.searchEngineBaidu')}</option>
  <option value="bing">{t('settings.user.searchEngineBing')}</option>
  <option value="duckduckgo">{t('settings.user.searchEngineDuckDuckGo')}</option>
</select>
```

### 步骤 4: 更新国际化文件

**文件**: `src/i18n/locales/zh.json`
```json
{
  "settings": {
    "user": {
      "searchEngineBaidu": "百度（国内推荐）"
    }
  }
}
```

**文件**: `src/i18n/locales/en.json`
```json
{
  "settings": {
    "user": {
      "searchEngineBaidu": "Baidu (Recommended for China)"
    }
  }
}
```

### 步骤 5: 更新搜索提示文本

**文件**: `src/i18n/locales/zh.json`
```json
{
  "settings": {
    "user": {
      "searchEngineHint": "Auto: 百度 → DuckDuckGo → Bing 自动切换；百度：国内搜索首选；Bing：国际搜索；DuckDuckGo：隐私保护（需VPN）"
    }
  }
}
```

## 搜索流程（更新后）

```
用户搜索请求
     ↓
┌─────────────────────────────────────┐
│ Auto 模式（推荐）                    │
│                                     │
│ 1. 百度 (国内首选)                   │
│    - JSON API，稳定可靠              │
│    - 10 秒超时                       │
│    - 中文搜索优化                    │
│    - 结果相关性检查                  │
└─────────────────────────────────────┘
     ↓ (失败或结果不相关)
┌─────────────────────────────────────┐
│ 2. DuckDuckGo Lite (国际搜索)       │
│    - 5 秒超时                        │
│    - 可能被国内网络屏蔽              │
└─────────────────────────────────────┘
     ↓ (失败)
┌─────────────────────────────────────┐
│ 3. Bing (国际搜索，国内可访问)      │
│    - 微软搜索引擎                   │
└─────────────────────────────────────┘
```

## 文件修改清单

| 文件 | 修改内容 |
|------|---------|
| `src-tauri/Cargo.toml` | 添加 `urlencoding` 依赖 |
| `src-tauri/src/search.rs` | 添加百度搜索支持，修改 Auto 模式优先级 |
| `src/components/SettingsView.tsx` | 添加百度选项到下拉列表 |
| `src/i18n/locales/zh.json` | 添加百度相关翻译 |
| `src/i18n/locales/en.json` | 添加百度相关翻译 |

## 注意事项

1. **User-Agent**: 百度 API 需要设置合理的 User-Agent，否则可能被拒绝
2. **请求频率**: 避免过于频繁的请求，可能触发反爬机制
3. **结果数量**: 百度 API 默认返回 10 条结果，可通过 `rn` 参数调整
4. **超时设置**: 建议设置 10 秒超时，避免长时间等待

## 测试计划

1. 测试百度搜索单独使用
2. 测试 Auto 模式下的自动切换
3. 测试中文和英文搜索查询
4. 测试网络异常情况下的回退机制
