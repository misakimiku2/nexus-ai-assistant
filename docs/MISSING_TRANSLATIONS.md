# 缺失翻译键文档

本文档记录了项目中代码使用但翻译文件中缺失的翻译键。

## 概述

项目使用 `react-i18next` 进行国际化，翻译文件位于：
- `src/i18n/locales/zh.json` (中文)
- `src/i18n/locales/en.json` (英文)

## 缺失的翻译键

### 1. `common` 通用翻译

| 键名 | 中文建议 | 英文建议 | 使用位置 |
|------|----------|----------|----------|
| `common.local` | 本地 | Local | Header.tsx:50 |

**建议添加：**
```json
"common": {
  "confirm": "确认",
  "edit": "编辑",
  "none": "无",
  "error": "操作失败",
  "cancel": "取消",
  "save": "保存",
  "delete": "删除",
  "local": "本地"
}
```

---

### 2. `header` 头部翻译

| 键名 | 中文建议 | 英文建议 | 使用位置 |
|------|----------|----------|----------|
| `header.unitTestTitle` | 运行单体测试 | Run Unit Test | Header.tsx:59 |
| `header.clusterTestTitle` | 运行集群测试 | Run Cluster Test | Header.tsx:67 |
| `header.clearHistory` | 清除历史记录 | Clear History | Header.tsx:76 |

**建议添加：**
```json
"header": {
  "collapseSidebar": "收起侧边栏",
  "expandSidebar": "展开侧边栏",
  "local": "本地",
  "unitTest": "单体测试",
  "unitTestTitle": "运行单体测试",
  "clusterTest": "集群测试",
  "clusterTestTitle": "运行集群测试",
  "clearContext": "清除上下文 (重置 Token)",
  "clearHistory": "清除历史记录"
}
```

---

### 3. `canvas` 画布工作区翻译

| 键名 | 中文建议 | 英文建议 | 使用位置 |
|------|----------|----------|----------|
| `canvas.workspace` | 工作区 | Workspace | CanvasWorkspace.tsx:26 |
| `canvas.newWorkspace` | 新工作区 | New Workspace | CanvasWorkspace.tsx:34 |
| `canvas.createWorkspace` | 创建工作区 | Create Workspace | CanvasWorkspace.tsx:113 |
| `canvas.closeToolbar` | 关闭工具栏 | Close Toolbar | CanvasWorkspace.tsx:125 |
| `canvas.openToolbar` | 打开工具栏 | Open Toolbar | CanvasWorkspace.tsx:125 |
| `canvas.placeholder` | 在此处开始输入... | Start typing here... | CanvasWorkspace.tsx:147 |

**建议添加：**
```json
"canvas": {
  "workspace": "工作区",
  "newWorkspace": "新工作区",
  "createWorkspace": "创建工作区",
  "closeToolbar": "关闭工具栏",
  "openToolbar": "打开工具栏",
  "placeholder": "在此处开始输入..."
}
```

---

### 4. `search` 搜索视图翻译

| 键名 | 中文建议 | 英文建议 | 使用位置 |
|------|----------|----------|----------|
| `search.unknownSession` | 未知会话 | Unknown Session | SearchView.tsx:52 |
| `search.title` | 搜索历史 | Search History | SearchView.tsx:114 |
| `search.total` | 共 {count} 条记录 | Total {count} records | SearchView.tsx:117 |
| `search.deselectAll` | 取消全选 | Deselect All | SearchView.tsx:128 |
| `search.selectAll` | 全选 | Select All | SearchView.tsx:128 |
| `search.deleteSelected` | 删除选中 ({count}) | Delete Selected ({count}) | SearchView.tsx:141 |
| `search.batchManage` | 批量管理 | Batch Manage | SearchView.tsx:159 |
| `search.noHistory` | 暂无搜索历史 | No Search History | SearchView.tsx:168 |
| `search.noHistoryDesc` | 开始对话后，搜索记录将显示在这里 | Search records will appear here after you start chatting | SearchView.tsx:169 |

**建议添加：**
```json
"search": {
  "unknownSession": "未知会话",
  "title": "搜索历史",
  "total": "共 {count} 条记录",
  "deselectAll": "取消全选",
  "selectAll": "全选",
  "deleteSelected": "删除选中 ({count})",
  "batchManage": "批量管理",
  "noHistory": "暂无搜索历史",
  "noHistoryDesc": "开始对话后，搜索记录将显示在这里"
}
```

---

### 5. `terminal` 终端视图翻译

| 键名 | 中文建议 | 英文建议 | 使用位置 |
|------|----------|----------|----------|
| `terminal.title` | 系统终端 | System Terminal | TerminalView.tsx:29 |
| `terminal.tokenUsage` | Token 用量: {count} | Token Usage: {count} | TerminalView.tsx:33 |
| `terminal.initComplete` | 系统初始化完成 | System initialization complete | TerminalView.tsx:41 |
| `terminal.waiting` | 等待输入... | Waiting for input... | TerminalView.tsx:42 |

**建议添加：**
```json
"terminal": {
  "title": "系统终端",
  "tokenUsage": "Token 用量: {count}",
  "initComplete": "系统初始化完成",
  "waiting": "等待输入..."
}
```

---

### 6. `settings` 设置视图缺失翻译

| 键名 | 中文建议 | 英文建议 | 使用位置 |
|------|----------|----------|----------|
| `settings.ai.header` | AI 模型设置 | AI Model Settings | SettingsView.tsx:372 |
| `settings.rag.header` | 本地知识库设置 | Local RAG Settings | SettingsView.tsx:372 |
| `settings.voice.header` | 语音交互设置 | Voice Interaction Settings | SettingsView.tsx:372 |
| `settings.connectionError` | 连接失败: {error} | Connection failed: {error} | AgentConfigModal.tsx:94,132 |

**建议添加：**
```json
"settings": {
  "ai": {
    "header": "AI 模型设置",
    ...
  },
  "rag": {
    "header": "本地知识库设置",
    ...
  },
  "voice": {
    "header": "语音交互设置",
    ...
  },
  "connectionError": "连接失败: {error}"
}
```

---

## 已修复的翻译键

以下翻译键已在之前的修复中添加：

### `mcp` - MCP 控制中心
```json
"mcp": {
  "title": "MCP 控制中心",
  "desc": "管理 Model Context Protocol 服务器连接",
  "addServer": "添加服务器",
  "status": {
    "connected": "已连接",
    "disconnected": "已断开"
  },
  "disconnect": "断开连接",
  "availableTools": "可用工具",
  "noTools": "暂无可用工具",
  "requiresAuth": "需要授权"
}
```

### `toolPanel` - 工具面板
```json
"toolPanel": {
  "params": {
    "systemPrompt": "系统提示词",
    "promptPlaceholder": "输入系统提示词...",
    "temperature": "温度参数",
    "tempPrecise": "精准",
    "tempCreative": "创意"
  }
}
```

### `common` - 通用翻译 (部分)
```json
"common": {
  "confirm": "确认",
  "edit": "编辑",
  "none": "无",
  "error": "操作失败",
  "cancel": "取消",
  "save": "保存",
  "delete": "删除"
}
```

---

## 完整建议翻译文件

### 中文 (zh.json) 需要添加的内容

```json
{
  "common": {
    "local": "本地"
  },
  "header": {
    "unitTestTitle": "运行单体测试",
    "clusterTestTitle": "运行集群测试",
    "clearHistory": "清除历史记录"
  },
  "canvas": {
    "workspace": "工作区",
    "newWorkspace": "新工作区",
    "createWorkspace": "创建工作区",
    "closeToolbar": "关闭工具栏",
    "openToolbar": "打开工具栏",
    "placeholder": "在此处开始输入..."
  },
  "search": {
    "unknownSession": "未知会话",
    "title": "搜索历史",
    "total": "共 {count} 条记录",
    "deselectAll": "取消全选",
    "selectAll": "全选",
    "deleteSelected": "删除选中 ({count})",
    "batchManage": "批量管理",
    "noHistory": "暂无搜索历史",
    "noHistoryDesc": "开始对话后，搜索记录将显示在这里"
  },
  "terminal": {
    "title": "系统终端",
    "tokenUsage": "Token 用量: {count}",
    "initComplete": "系统初始化完成",
    "waiting": "等待输入..."
  },
  "settings": {
    "ai": {
      "header": "AI 模型设置"
    },
    "rag": {
      "header": "本地知识库设置"
    },
    "voice": {
      "header": "语音交互设置"
    },
    "connectionError": "连接失败: {error}"
  }
}
```

### 英文 (en.json) 需要添加的内容

```json
{
  "common": {
    "local": "Local"
  },
  "header": {
    "unitTestTitle": "Run Unit Test",
    "clusterTestTitle": "Run Cluster Test",
    "clearHistory": "Clear History"
  },
  "canvas": {
    "workspace": "Workspace",
    "newWorkspace": "New Workspace",
    "createWorkspace": "Create Workspace",
    "closeToolbar": "Close Toolbar",
    "openToolbar": "Open Toolbar",
    "placeholder": "Start typing here..."
  },
  "search": {
    "unknownSession": "Unknown Session",
    "title": "Search History",
    "total": "Total {count} records",
    "deselectAll": "Deselect All",
    "selectAll": "Select All",
    "deleteSelected": "Delete Selected ({count})",
    "batchManage": "Batch Manage",
    "noHistory": "No Search History",
    "noHistoryDesc": "Search records will appear here after you start chatting"
  },
  "terminal": {
    "title": "System Terminal",
    "tokenUsage": "Token Usage: {count}",
    "initComplete": "System initialization complete",
    "waiting": "Waiting for input..."
  },
  "settings": {
    "ai": {
      "header": "AI Model Settings"
    },
    "rag": {
      "header": "Local RAG Settings"
    },
    "voice": {
      "header": "Voice Interaction Settings"
    },
    "connectionError": "Connection failed: {error}"
  }
}
```

---

## 如何修复

1. 打开 `src/i18n/locales/zh.json` 和 `src/i18n/locales/en.json`
2. 将上述缺失的翻译键添加到对应的文件中
3. 确保JSON格式正确，注意逗号分隔
4. 刷新页面验证翻译是否生效

## 注意事项

- 翻译键使用点号分隔层级，如 `t.header.unitTestTitle`
- 带参数的翻译使用 `{param}` 格式，如 `{count}`, `{error}`
- 确保中英文翻译文件结构一致
