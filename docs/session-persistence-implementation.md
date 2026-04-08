# 会话持久化存储功能实现文档

## 概述

本文档记录了 Nexus AI Assistant 会话持久化存储功能的完整实现过程，包括多模态支持（图片和文件）、启动模式设置、会话导出/导入、会话搜索、侧边栏 UI 重构等功能。

---

## 一、需求背景

### 1.1 问题描述
- 会话数据仅存在于内存中，应用重启后丢失
- 多模态附件以 base64 存储在消息中，可能导致数据量过大
- 无会话导入/导出功能
- 用户无法选择启动时的会话状态

### 1.2 目标
1. 实现会话的永久存储
2. 支持多模态内容（图片、文件）的独立存储
3. 支持用户选择启动模式（空状态/恢复上次会话）
4. 支持空会话列表状态
5. 支持会话导出/导入（JSON / Markdown 格式）
6. 支持会话搜索（标题 / 内容模式）

---

## 二、技术方案

### 2.1 存储策略

采用**混合存储策略**，根据运行环境自动选择：

| 环境 | 会话元数据 | 消息内容 | 附件文件 |
|------|-----------|---------|---------|
| Tauri 桌面 | JSON 文件 | JSON 文件 | 独立文件存储 |
| Web 浏览器 | IndexedDB | IndexedDB | IndexedDB (压缩) |

### 2.2 文件结构设计 (Tauri 环境)

```
{appDataDir}/nexus-ai-assistant/
├── sessions/
│   ├── sessions.json          # 会话列表元数据
│   ├── folders.json           # 文件夹列表
│   └── {sessionId}/           # 每个会话一个目录
│       ├── meta.json          # 会话元信息
│       └── messages.json      # 消息列表
├── attachments/               # 附件存储目录
│   ├── {sessionId}/
│   │   ├── {attachmentId}.jpg
│   │   ├── {attachmentId}.pdf
│   │   └── ...
│   └── ...
└── token-usage.json           # 已有的 token 记录
```

### 2.3 IndexedDB 结构设计 (Web 环境)

```typescript
interface SessionDBSchema extends DBSchema {
  sessions: {
    key: string;  // sessionId
    value: {
      id: string;
      title: string;
      updatedAt: number;
      folderId?: string;
      activeAgents?: string[];
    };
    indexes: {
      'by-updated': number;
      'by-folder': string;
    };
  };
  
  messages: {
    key: string;  // `${sessionId}_${messageId}`
    value: Message & { sessionId: string };
    indexes: {
      'by-session': string;
      'by-session-time': [string, number];
    };
  };
  
  folders: {
    key: string;
    value: ChatFolder;
  };
  
  attachments: {
    key: string;  // attachmentId
    value: {
      id: string;
      sessionId: string;
      messageId: string;
      type: 'image' | 'document';
      name: string;
      data: Blob;
      mimeType: string;
      size: number;
    };
  };
}
```

---

## 三、实现文件清单

### 3.1 新增文件

| 文件路径 | 说明 |
|---------|------|
| `src/services/sessionStorage.ts` | 存储服务接口定义，自动检测环境 |
| `src/services/tauriSessionStorage.ts` | Tauri 文件系统存储实现 |
| `src/services/indexedDBSessionStorage.ts` | IndexedDB 存储实现 |
| `src/services/sessionMigration.ts` | 数据迁移服务 |
| `src/services/sessionExport.ts` | 会话导出/导入服务（JSON + Markdown 格式，格式自动检测） |
| `src/hooks/useSessionStorage.ts` | 存储 Hook，提供便捷操作 |

### 3.2 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src/types.ts` | 新增 `AttachmentReference` 和 `StorageState` 类型 |
| `src/context/GlobalStateContext.tsx` | 集成持久化存储，添加启动模式设置，暴露导出/导入方法（`exportSessionToFile`、`importSessionFromFile`、`batchExportSessionsToFile`），Tauri/Web 双环境文件对话框支持 |
| `src/components/SettingsView.tsx` | 添加启动模式设置选项 |
| `src/components/Sidebar.tsx` | 侧边栏 UI 重构（详见第十二节），添加搜索/导出/导入/右键菜单/自定义拖拽功能 |
| `src/components/ConfirmationModal.tsx` | 新增 `children` prop，支持自定义内容渲染（用于删除文件夹时显示会话列表） |
| `src/App.tsx` | 添加 `ensureCurrentSession` 调用 |
| `src/i18n/locales/zh.json` | 添加中文翻译（搜索、导出/导入、右键菜单等） |
| `src/i18n/locales/en.json` | 添加英文翻译（搜索、导出/导入、右键菜单等） |
| `src-tauri/capabilities/default.json` | 添加文件系统权限和对话框权限（`dialog:default`） |
| `src-tauri/Cargo.toml` | 添加 `tauri-plugin-dialog = "2"` |
| `src-tauri/src/lib.rs` | 添加 `.plugin(tauri_plugin_dialog::init())` |
| `package.json` | 添加 `@tauri-apps/plugin-dialog` 依赖 |

---

## 四、核心功能实现

### 4.1 存储服务接口

```typescript
export interface SessionStorageService {
  initialize(): Promise<void>;
  
  // 会话管理
  getAllSessions(): Promise<ChatSession[]>;
  getSession(id: string): Promise<ChatSession | null>;
  saveSession(session: ChatSession): Promise<void>;
  deleteSession(id: string): Promise<void>;
  batchDeleteSessions(ids: string[]): Promise<void>;
  
  // 文件夹管理
  getAllFolders(): Promise<ChatFolder[]>;
  saveFolder(folder: ChatFolder): Promise<void>;
  deleteFolder(id: string): Promise<void>;
  
  // 附件管理
  saveAttachment(sessionId: string, messageId: string, attachment: Attachment): Promise<StoredAttachment>;
  getAttachment(sessionId: string, attachmentId: string): Promise<Attachment | null>;
  deleteAttachment(sessionId: string, attachmentId: string): Promise<void>;
  
  // 导入导出
  exportSession(id: string): Promise<string>;
  importSession(data: string): Promise<ChatSession>;
}
```

### 4.2 环境自动检测

```typescript
export async function getSessionStorage(): Promise<SessionStorageService> {
  const isTauri = await checkTauriEnv();
  
  if (isTauri) {
    const { TauriSessionStorage } = await import('./tauriSessionStorage');
    return new TauriSessionStorage();
  } else {
    const { IndexedDBSessionStorage } = await import('./indexedDBSessionStorage');
    return new IndexedDBSessionStorage();
  }
}
```

### 4.3 启动模式设置

```typescript
// 启动模式类型
type StartupMode = 'empty' | 'lastSession';

// 初始化逻辑
const currentStartupMode = localStorage.getItem('nexus_startup_mode') || 'empty';

if (currentStartupMode === 'lastSession' && loadedSessions.length > 0) {
  const lastSession = loadedSessions[0];
  setCurrentSessionId(lastSession.id);
  setMessages(lastSession.messages);
} else {
  setCurrentSessionId('');
  setMessages([]);
}
```

### 4.4 空会话列表支持

```typescript
// 删除会话不再自动创建新会话
const deleteSession = async (id: string) => {
  // ... 删除逻辑
  
  setSessions(prev => {
    const newSessions = prev.filter(s => s.id !== id);
    if (newSessions.length === 0) {
      setCurrentSessionId('');
      setMessages([]);
      return [];  // 返回空数组，不创建新会话
    }
    // ...
  });
};

// 发送消息时自动创建会话
const handleSendMessage = async () => {
  await ensureCurrentSession();  // 确保有当前会话
  // ... 发送逻辑
};
```

### 4.5 会话导出/导入

#### 4.5.1 导出格式

**JSON 格式**（完整数据备份，可重新导入）：

```json
{
  "version": 1,
  "exportedAt": 1712548800000,
  "session": { "id": "...", "title": "...", "messages": [...] },
  "attachments": { "attId.jpg": "base64..." }
}
```

**Markdown 格式**（人类阅读和分享，不可重新导入为完整会话）：

```markdown
# 会话标题

> 导出时间: 2026-04-08 14:30:00
> 消息数量: 15

---

## 👤 用户

消息内容...

## 🤖 助手

回复内容...

> 💡 思考过程: ...
```

#### 4.5.2 导出服务架构

`src/services/sessionExport.ts` 提供以下核心功能：

| 函数 | 说明 |
|------|------|
| `exportSession(id, format)` | 按指定格式导出单个会话 |
| `exportSessionAsMarkdown(session)` | 导出为 Markdown 格式 |
| `exportSessionAsJSON(session)` | 导出为 JSON 格式 |
| `batchExportSessions(ids, format)` | 批量导出多个会话 |
| `importSessionFromData(data)` | 从数据导入会话（自动检测格式） |
| `detectExportFormat(data)` | 自动检测导出格式（JSON/Markdown） |

#### 4.5.3 文件对话框集成

- **Tauri 环境**：使用 `@tauri-apps/plugin-dialog` 的 `save()` / `open()` 原生文件对话框
- **Web 环境**：使用浏览器原生 `<input type="file">` 和 `Blob` + `URL.createObjectURL` 降级方案
- 环境检测：通过 `'__TAURI_INTERNALS__' in window` 判断

### 4.6 会话搜索

采用**纯前端过滤方案**，所有会话数据已在内存中：

| 搜索模式 | 说明 | 性能 |
|---------|------|------|
| 标题搜索（默认） | 按会话标题模糊匹配 | 极快 |
| 内容搜索 | 按消息内容和思考过程全文匹配 | 较快（数据量小时） |

- 300ms 防抖输入
- 搜索结果高亮匹配文本（`<mark>` 标签）
- 清空搜索框恢复完整列表
- 搜索模式下文件夹按是否包含匹配会话过滤显示

---

## 五、Tauri 权限配置

需要在 `src-tauri/capabilities/default.json` 中添加文件系统权限和对话框权限：

```json
{
  "permissions": [
    "fs:default",
    "fs:allow-read-file",
    "fs:allow-write-file",
    "fs:allow-mkdir",
    "fs:allow-exists",
    "fs:allow-remove",
    "fs:allow-read-dir",
    "dialog:default",
    {
      "identifier": "fs:scope",
      "allow": [
        { "path": "$APPDATA/**" },
        { "path": "/" }
      ]
    }
  ]
}
```

---

## 六、用户界面

### 6.1 设置选项位置

设置 → 用户个性化 → 启动模式

### 6.2 选项说明

| 选项 | 说明 |
|------|------|
| 空状态 | 启动时会话列表加载历史记录，但当前界面为空 |
| 恢复上次会话 | 启动时自动打开最近的会话 |

### 6.3 侧边栏交互

详见第十二节「侧边栏 UI 重构」。

---

## 七、性能优化

### 7.1 增量保存

使用防抖机制，避免频繁写入：

```typescript
const SAVE_DEBOUNCE_MS = 1000;

// 只保存变更的会话
const debouncedSave = debounce(async (sessionId: string) => {
  const session = sessions.find(s => s.id === sessionId);
  if (session) {
    await storage.saveSession(session);
  }
}, SAVE_DEBOUNCE_MS);
```

### 7.2 写入队列

防止并发写入冲突：

```typescript
private writeQueue: Map<string, Promise<void>> = new Map();

private async writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  const existingWrite = this.writeQueue.get(filePath);
  if (existingWrite) {
    await existingWrite;
  }
  // ... 写入逻辑
}
```

---

## 八、数据迁移

支持从 localStorage 自动迁移旧数据：

```typescript
export async function migrateFromLocalStorage(): Promise<{
  sessionsMigrated: number;
  foldersMigrated: number;
}> {
  const legacySessionsData = localStorage.getItem('nexus_sessions');
  const legacyFoldersData = localStorage.getItem('nexus_folders');
  
  // ... 迁移逻辑
  
  localStorage.setItem('nexus_session_migration_completed', 'true');
}
```

---

## 九、测试验证

### 9.1 测试场景

1. **会话创建** - 创建新会话并验证存储
2. **会话切换** - 切换会话并验证消息加载
3. **会话删除** - 删除会话并验证存储清理
4. **空状态启动** - 验证启动时界面为空
5. **恢复上次会话** - 验证启动时恢复会话
6. **附件存储** - 验证图片和文件附件存储
7. **数据迁移** - 验证旧数据迁移
8. **会话导出** - 验证 JSON/Markdown 格式导出
9. **会话导入** - 验证 JSON 格式导入和格式自动检测
10. **会话搜索** - 验证标题/内容搜索模式和结果高亮
11. **右键菜单** - 验证会话/文件夹右键菜单功能
12. **拖拽移动** - 验证 Pointer Events 拖拽会话到文件夹
13. **文件夹操作** - 验证双击重命名、删除时连带删除会话

### 9.2 日志验证

```
[GlobalState] 加载了 3 个会话
[GlobalState] 加载了 0 个文件夹
[GlobalState] 存储初始化完成 (会话列表已加载，当前界面为空)
[GlobalState] 会话已保存: xxx
[GlobalState] 已从存储中删除会话: xxx
```

---

## 十、已实现的扩展功能

> 本应用定位为本地运行，因此**云端同步**和**会话分享**功能不在计划范围内。

### 10.1 会话导出/导入 ✅ 已实现

支持将会话导出为 JSON / Markdown 格式，以及从文件导入会话。

#### 10.1.1 实现状态

| 层级 | 状态 | 说明 |
|------|------|------|
| `SessionStorageService` 接口 | ✅ 已有 | `exportSession(id)` / `importSession(data)` 已定义 |
| Tauri 存储实现 | ✅ 已有 | JSON 格式导出，含附件 base64 |
| IndexedDB 存储实现 | ✅ 已有 | JSON 格式导出，含附件 base64 |
| `sessionExport.ts` 服务 | ✅ 已实现 | Markdown/JSON 双格式导出，格式自动检测导入 |
| `useSessionStorage` Hook | ✅ 已暴露 | 暴露 `exportSession` / `importSession` |
| `GlobalStateContext` | ✅ 已暴露 | `exportSessionToFile` / `importSessionFromFile` / `batchExportSessionsToFile` |
| UI 层 | ✅ 已实现 | 右键菜单导出、对话主选项栏导入按钮 |
| Markdown 格式 | ✅ 已支持 | 完整 Markdown 导出（含角色标签、思考过程、附件引用） |
| Tauri 文件对话框 | ✅ 已安装 | `@tauri-apps/plugin-dialog` + `tauri-plugin-dialog` |

#### 10.1.2 导出格式

**JSON 格式**（完整数据备份，可重新导入）：

```json
{
  "version": 1,
  "exportedAt": 1712548800000,
  "session": { "id": "...", "title": "...", "messages": [...] },
  "attachments": { "attId.jpg": "base64..." }
}
```

**Markdown 格式**（人类阅读和分享）：

```markdown
# 会话标题

> 导出时间: 2026-04-08 14:30:00
> 消息数量: 15

---

## 👤 用户

消息内容...

## 🤖 助手

回复内容...

> 💡 思考过程: ...
```

#### 10.1.3 UI 交互

- **单个导出**：会话项右键菜单 → 导出为 JSON / 导出为 Markdown → 文件保存对话框
- **批量导出**：多选模式 → 批量导出按钮 → 选择格式 → 文件保存对话框
- **导入**：对话主选项栏 → 导入按钮 → 文件选择对话框 → 自动检测格式 → 导入后刷新列表

---

### 10.2 会话搜索 ✅ 已实现

基于内容的会话搜索，支持按标题和消息内容过滤。

#### 10.2.1 实现方案

采用**纯前端过滤方案**，因为本地应用所有会话数据已在内存中，无需后端搜索。

| 搜索模式 | 说明 | 性能 |
|---------|------|------|
| 标题搜索（默认） | 按会话标题模糊匹配 | 极快 |
| 内容搜索 | 按消息内容和思考过程全文匹配 | 较快（数据量小时） |

#### 10.2.2 UI 交互

- 搜索框位于对话内容区域顶部（搜索栏 + 模式切换按钮）
- 实时过滤，300ms 防抖
- 搜索结果高亮匹配文本（`<mark>` 标签 + 黄色半透明背景）
- 清空搜索框恢复完整列表
- 筛选按钮切换搜索模式（标题/内容）
- 搜索模式下文件夹按是否包含匹配会话过滤显示

---

## 十一、注意事项

1. 修改 Tauri 权限配置后需要重新启动应用
2. 附件存储在独立目录，避免消息体积过大
3. 删除会话时会同步删除相关附件
4. 启动模式设置保存在 localStorage 中
5. 导出为 Markdown 格式时不包含附件数据（仅引用文件名）
6. 导入会话时会自动生成新 ID，避免与现有会话冲突
7. 会话搜索为纯前端实现，大量会话时建议使用标题搜索模式
8. 删除文件夹时会**连带删除**其中的所有会话（非移出），弹窗会列出将被删除的会话
9. 拖拽功能使用 Pointer Events 实现（非 HTML5 Drag & Drop），确保 Tauri 环境兼容性
10. 右键菜单使用 `fixed z-[9999]` 定位，确保层级最上层

---

## 十二、侧边栏 UI 重构

### 12.1 重构概览

对 `src/components/Sidebar.tsx` 进行了全面重构，涉及布局、交互和视觉三个维度。

### 12.2 布局变更

#### 12.2.1 移除「会话列表」标题行

原布局中的「会话列表」标题行及其操作按钮已移除。操作按钮（多选/导入/新建文件夹/新建会话）整合到「对话」主选项栏按钮内部，靠右对齐。

#### 12.2.2 对话主选项栏结构

```
┌─────────────────────────────────────────┐
│ 💬 对话              ☐ � 📁 ➕        │  ← 主选项栏（蓝色背景）
├─────────────────────────────────────────┤
│ 🔍 搜索会话...                  [🔍▼]  │  ← 搜索栏
├─────────────────────────────────────────┤
│ 📁 文件夹1                              │
│   ├─ 💬 会话1                           │
│   └─ 💬 会话2                           │
│ 💬 根级会话3                             │
└─────────────────────────────────────────┘
     ↑ 圆角矩形背景容器（不包裹主选项栏）
```

- 操作按钮位于「对话」按钮内部，`ml-auto` 靠右对齐
- 搜索栏和会话列表包裹在独立的圆角矩形背景容器中（`bg-zinc-500/5 dark:bg-zinc-800/30`）
- 背景容器**不包裹**「对话」主选项栏

#### 12.2.3 折叠/展开

- 点击「对话」主选项栏可折叠/展开下方内容
- 使用 CSS `grid-rows` 动画实现平滑过渡（`grid-rows-[0fr]` ↔ `grid-rows-[1fr]`）
- Agent 集群列表同样使用 `grid-rows` 动画
- 折叠时操作按钮通过 `w-0 opacity-0` 过渡隐藏

### 12.3 交互变更

#### 12.3.1 右键菜单（替代悬浮按钮）

移除了会话项和文件夹上的悬浮操作按钮，改为右键菜单：

| 目标类型 | 菜单项 |
|---------|--------|
| 会话 | 导出为 JSON、导出为 Markdown、重命名、删除 |
| 文件夹 | 重命名、删除 |

右键菜单特性：
- 浅色/深色模式适配
- `fixed z-[9999]` 确保最上层显示
- 点击任意位置或按 `Escape` 关闭
- 删除选项红色高亮，分割线分组

#### 12.3.2 双击重命名

- 会话：双击进入重命名编辑模式
- 文件夹：双击进入重命名编辑模式
- 编辑模式下自动阻止拖拽触发

#### 12.3.3 自定义拖拽（Pointer Events）

使用 Pointer Events 替代 HTML5 Drag & Drop API，解决 Tauri 环境下拖拽不可用的问题：

| 事件 | 处理 |
|------|------|
| `pointerdown` | 记录起始位置和目标会话 ID（仅左键 `button === 0`） |
| `pointermove` | 移动超过 10px 阈值后进入拖拽模式 |
| `pointerup`（元素上） | 未进入拖拽模式时清除 dragState |
| `pointerup`（全局） | 仅在 `isDragging` 为 true 时执行 drop 操作 |
| `pointermove`（全局） | 更新拖拽位置，通过 `elementFromPoint` 检测悬停文件夹 |

拖拽视觉反馈：
- 被拖拽的会话项：`opacity-40`
- 悬停的文件夹：蓝色高亮边框 + 背景色（`bg-blue-500/10 border-blue-400/50 ring-1 ring-blue-400/30`）
- 浮动标签：蓝色圆角，跟随鼠标显示会话标题
- 按 `Escape` 取消拖拽

防误触机制：
- 仅响应左键（`e.button !== 0` 时 return）
- 编辑模式、多选模式、右键菜单打开时不触发拖拽
- 拖拽阈值 10px
- `handleEditStart` 时重置 dragState

#### 12.3.4 多选模式支持文件夹

- 多选模式下文件夹显示圆形选择指示器
- 点击文件夹切换选中状态（非多选时为展开/收起）
- 批量删除时同时删除选中的文件夹及其内部会话
- 拖放操作同时清除 `selectedSessions` 和 `selectedFolders`

#### 12.3.5 删除文件夹行为变更

删除文件夹时**连带删除**其中的所有会话（而非移出），弹窗显示：

```
确定要删除这个文件夹吗？其中的所有对话也将被一并删除，此操作无法撤销。

以下 3 个对话将被一并删除:
┌──────────────────────────────┐
│ [图标] 会话标题1              │
│ [图标] 会话标题2              │
│ [图标] 会话标题3              │
└──────────────────────────────┘
```

- 会话列表卡片有最大高度限制（`max-h-40`），超出可滚动
- 每个会话显示对应 Agent 图标或默认 `MessageSquare` 图标
- `ConfirmationModal` 新增 `children` prop 支持自定义内容

### 12.4 视觉变更

| 元素 | 样式 |
|------|------|
| 选中的会话 | `border-2 border-dashed border-blue-500 bg-blue-500/5 text-blue-700 dark:text-blue-300` |
| 会话列表背景容器 | `bg-zinc-500/5 dark:bg-zinc-800/30 rounded-xl border border-zinc-200/60 dark:border-zinc-700/50` |
| 文件夹树状连线 | 2px 竖线 + L 形圆角连接器（`rounded-bl-lg` / `rounded-bl-xl`） |
| 右键菜单 | `bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-600/80 shadow-2xl backdrop-blur-sm` |
| 拖拽悬停文件夹 | `bg-blue-500/10 dark:bg-blue-500/20 border-blue-400/50 ring-1 ring-blue-400/30` |

---

*文档创建时间: 2026-04-07*
*最后更新: 2026-04-09*
