# 会话持久化存储功能实现文档

## 概述

本文档记录了 Nexus AI Assistant 会话持久化存储功能的完整实现过程，包括多模态支持（图片和文件）、启动模式设置等功能。

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
| `src/hooks/useSessionStorage.ts` | 存储 Hook，提供便捷操作 |

### 3.2 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src/types.ts` | 新增 `AttachmentReference` 和 `StorageState` 类型 |
| `src/context/GlobalStateContext.tsx` | 集成持久化存储，添加启动模式设置 |
| `src/components/SettingsView.tsx` | 添加启动模式设置选项 |
| `src/App.tsx` | 添加 `ensureCurrentSession` 调用 |
| `src/i18n/locales/zh.json` | 添加中文翻译 |
| `src/i18n/locales/en.json` | 添加英文翻译 |
| `src-tauri/capabilities/default.json` | 添加文件系统权限 |

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

---

## 五、Tauri 权限配置

需要在 `src-tauri/capabilities/default.json` 中添加文件系统权限：

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

### 9.2 日志验证

```
[GlobalState] 加载了 3 个会话
[GlobalState] 加载了 0 个文件夹
[GlobalState] 存储初始化完成 (会话列表已加载，当前界面为空)
[GlobalState] 会话已保存: xxx
[GlobalState] 已从存储中删除会话: xxx
```

---

## 十、后续扩展

1. **会话导出/导入** - 支持导出为 JSON/Markdown 格式
2. **云端同步** - 可选的云端备份功能
3. **会话搜索** - 基于内容的全文搜索
4. **会话分享** - 生成分享链接

---

## 十一、注意事项

1. 修改 Tauri 权限配置后需要重新启动应用
2. 附件存储在独立目录，避免消息体积过大
3. 删除会话时会同步删除相关附件
4. 启动模式设置保存在 localStorage 中

---

*文档创建时间: 2026-04-07*
*最后更新: 2026-04-07*
