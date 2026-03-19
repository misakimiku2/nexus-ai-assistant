# Bing 搜索结果优化方案

## 问题背景

用户反馈搜索"鸣潮3.1剧情好评如潮"时：
- **DuckDuckGo**：返回正确结果（游戏相关）
- **Bing**：返回错误结果（股票相关：鸣鸣很忙、鸣志电器）

### 关键发现

1. **Bing Search API 将于 2025 年 8 月 11 日停用** - 使用 API 方案不可行
2. **DuckDuckGo 需要VPN** - 对国内小白用户不友好
3. **当前搜索顺序**：DuckDuckGo → Bing → Sogou

## 可行方案分析

| 方案 | 优点 | 缺点 | 可行性 |
|------|------|------|--------|
| Bing API | 结构化数据 | 2025年8月停用，需付费 | ❌ 不可行 |
| 优化 Bing 网页爬取 | 免费，国内可用 | 结果质量不稳定 | ✅ 推荐 |
| 优化 Sogou | 国内可用，免费 | 搜索质量一般 | ✅ 备选 |
| 添加百度 | 国内最大 | 反爬严重，需验证码 | ⚠️ 可选 |
| 第三方 API (SerpAPI等) | 质量好 | 需付费配置 | ❌ 对小白不友好 |

## 推荐方案：优化 Bing 网页爬取

### 1. 移除 `cc=CN` 参数

当前代码（第313行）：
```rust
let url = format!(
    "https://www.bing.com/search?q={}&setlang=zh-CN&cc=CN",
    urlencoding::encode(query)
);
```

`cc=CN` 参数会强制使用中国区搜索结果，可能导致本地化过度，将"鸣潮"错误关联到"鸣鸣很忙"股票。

**修改为**：
```rust
let url = format!(
    "https://www.bing.com/search?q={}",
    urlencoding::encode(query)
);
```

### 2. 调整搜索引擎优先级

**当前顺序**：DuckDuckGo → Bing → Sogou

**建议顺序**：Bing → Sogou → DuckDuckGo

理由：
- Bing 国内可直接访问，无需VPN
- DuckDuckGo 作为最后备选（有VPN用户可用）

### 3. 添加搜索结果相关性过滤

在 `parse_bing` 函数中添加关键词相关性检查，过滤掉明显不相关的结果：

```rust
fn is_relevant_result(title: &str, snippet: &str, query: &str) -> bool {
    let query_lower = query.to_lowercase();
    let title_lower = title.to_lowercase();
    
    // 检查标题是否包含查询关键词
    let query_words: Vec<&str> = query_lower.split_whitespace().collect();
    let match_count = query_words.iter()
        .filter(|word| title_lower.contains(*word))
        .count();
    
    // 至少匹配一个关键词
    match_count > 0 || snippet.to_lowercase().contains(&query_lower)
}
```

### 4. 添加搜索源标识

在返回结果中添加搜索源信息，方便用户了解结果来源。

## 实施步骤

### Step 1: 修改 Bing 请求参数
- 文件：`src-tauri/src/search.rs`
- 移除 `cc=CN` 参数
- 保留 `setlang=zh-CN` 以支持中文界面

### Step 2: 调整搜索引擎优先级
- 文件：`src-tauri/src/search.rs`
- 修改 `search_async` 函数中的调用顺序
- Bing → Sogou → DuckDuckGo

### Step 3: 添加结果相关性检查（可选）
- 在 `parse_bing` 中添加关键词匹配逻辑
- 过滤低相关性结果

### Step 4: 测试验证
- 测试搜索"鸣潮3.1剧情好评原因"
- 验证返回结果是否为游戏相关内容

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 移除 `cc=CN` 后结果仍不理想 | 中 | 添加相关性过滤 |
| Bing 反爬机制加强 | 低 | 已有完善的请求头模拟 |
| Sogou 搜索质量不稳定 | 低 | 作为备选方案 |

## 预期效果

1. Bing 搜索"鸣潮"将返回游戏相关结果
2. 国内用户无需VPN即可正常使用搜索功能
3. 搜索结果质量与 DuckDuckGo 相当或更好
