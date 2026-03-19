# 添加网络搜索引擎选择功能

## 需求背景

用户反馈：
- DuckDuckGo 需要VPN才能使用，对国内小白用户不友好
- Bing 搜索结果有时不准确（如搜索"鸣潮"返回股票内容）
- Bing Search API 将于 2025 年 8 月 11 日停用，API 方案不可行

## 解决方案

在**设置 → 用户个性化**下方新增**网络搜索**选项，让用户自主选择搜索引擎。

### 搜索引擎选项

| 选项 | 说明 | 适用场景 |
|------|------|----------|
| **自动选择** (默认) | DuckDuckGo → Bing → Sogou 依次尝试 | 有VPN时优先DuckDuckGo |
| **Bing (国内推荐)** | 国内可直接访问，无需VPN | 国内用户首选 |
| **Sogou (搜狗)** | 国内搜索引擎，中文搜索优化 | 国内备选 |
| **DuckDuckGo** | 国际搜索引擎，结果更客观 | 有VPN的用户 |

## 实施步骤

### Step 1: 后端 - 修改 Rust 搜索模块

**文件**: `src-tauri/src/search.rs`

1. 添加搜索引擎枚举类型：
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SearchEngine {
    Auto,        // 自动选择（默认）
    Bing,        // Bing（国内推荐）
    Sogou,       // 搜狗
    DuckDuckGo,  // DuckDuckGo
}
```

2. 修改 `search` 命令，支持传入搜索引擎参数：
```rust
#[tauri::command]
pub async fn search(query: String, engine: Option<String>) -> Result<SearchResponse, String>
```

3. 根据用户选择调用对应的搜索引擎：
- `Auto`: DuckDuckGo → Bing → Sogou（当前逻辑）
- `Bing`: 只使用 Bing
- `Sogou`: 只使用 Sogou
- `DuckDuckGo`: 只使用 DuckDuckGo

4. 优化 Bing 请求参数（移除 `cc=CN`）：
```rust
let url = format!(
    "https://www.bing.com/search?q={}",
    urlencoding::encode(query)
);
```

### Step 2: 前端 - 添加全局状态

**文件**: `src/context/GlobalStateContext.tsx`

1. 添加搜索引擎状态：
```typescript
searchEngine: 'auto' | 'bing' | 'sogou' | 'duckduckgo';
setSearchEngine: (engine: string) => void;
```

2. 添加 localStorage 持久化：
```typescript
const [searchEngine, setSearchEngine] = useState<string>(() => 
  localStorage.getItem('nexus_search_engine') || 'auto'
);
useEffect(() => { 
  localStorage.setItem('nexus_search_engine', searchEngine); 
}, [searchEngine]);
```

### Step 3: 前端 - 修改设置页面

**文件**: `src/components/SettingsView.tsx`

在"用户个性化"区域下方添加"网络搜索"设置：

```tsx
{/* Network Search Settings */}
<section className="space-y-4">
  <h4 className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>
    {t('settings.user.networkSearch')}
  </h4>
  <div className={cn(
    "p-5 border rounded-2xl space-y-4",
    isDarkMode ? "bg-zinc-700/30 border-zinc-600/50" : "bg-zinc-50 border-zinc-200"
  )}>
    <div className="flex items-center gap-3">
      <Globe size={18} className="text-indigo-500" />
      <select
        value={searchEngine}
        onChange={(e) => setSearchEngine(e.target.value)}
        className={cn(
          "flex-1 border rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none appearance-none",
          isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
        )}
      >
        <option value="auto">{t('settings.user.searchEngineAuto')}</option>
        <option value="bing">{t('settings.user.searchEngineBing')}</option>
        <option value="sogou">{t('settings.user.searchEngineSogou')}</option>
        <option value="duckduckgo">{t('settings.user.searchEngineDuckDuckGo')}</option>
      </select>
    </div>
    <p className={cn("text-xs", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>
      {t('settings.user.searchEngineHint')}
    </p>
  </div>
</section>
```

### Step 4: 前端 - 修改搜索工具调用

**文件**: `src/agent/tools/builtin.ts`

修改 `createWebSearchTool` 函数，传入用户选择的搜索引擎：

```typescript
const searchEngine = localStorage.getItem('nexus_search_engine') || 'auto';
const results = await invoke<{ results: Array<{ title: string; url: string; snippet: string } }>('search', {
  query,
  engine: searchEngine,
});
```

### Step 5: 国际化 - 添加翻译文本

**文件**: `src/i18n/locales/zh.json`

```json
{
  "settings": {
    "user": {
      "networkSearch": "网络搜索",
      "searchEngineAuto": "自动选择 (推荐)",
      "searchEngineBing": "Bing (国内推荐)",
      "searchEngineSogou": "搜狗 (国内备选)",
      "searchEngineDuckDuckGo": "DuckDuckGo (需VPN)",
      "searchEngineHint": "选择搜索引擎。国内用户建议选择 Bing 或搜狗，有VPN的用户可选择 DuckDuckGo 获得更准确的搜索结果。"
    }
  }
}
```

**文件**: `src/i18n/locales/en.json`

```json
{
  "settings": {
    "user": {
      "networkSearch": "Web Search",
      "searchEngineAuto": "Auto (Recommended)",
      "searchEngineBing": "Bing (Recommended for China)",
      "searchEngineSogou": "Sogou (Alternative for China)",
      "searchEngineDuckDuckGo": "DuckDuckGo (Requires VPN)",
      "searchEngineHint": "Select a search engine. Users in China should choose Bing or Sogou. Users with VPN can choose DuckDuckGo for more accurate results."
    }
  }
}
```

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src-tauri/src/search.rs` | 添加搜索引擎枚举，修改 search 命令支持参数，优化 Bing URL |
| `src-tauri/src/lib.rs` | 注册新的命令（如有需要） |
| `src/context/GlobalStateContext.tsx` | 添加 searchEngine 状态和持久化 |
| `src/components/SettingsView.tsx` | 添加网络搜索设置 UI |
| `src/agent/tools/builtin.ts` | 修改搜索工具传入引擎参数 |
| `src/i18n/locales/zh.json` | 添加中文翻译 |
| `src/i18n/locales/en.json` | 添加英文翻译 |

## 预期效果

1. 用户可在设置中选择偏好的搜索引擎
2. 国内用户可选择 Bing 或搜狗，无需VPN
3. 有VPN的用户可选择 DuckDuckGo 获得更准确的搜索结果
4. 默认"自动选择"保持当前行为，向后兼容
