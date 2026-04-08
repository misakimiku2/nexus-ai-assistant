# 会话持久化存储方案

## 一、现状分析

### 1.1 当前架构
- **技术栈**: Tauri 桌面应用 + React 19 + TypeScript
- **现有存储机制**:
  - 用户设置: localStorage
  - Token 使用记录: IndexedDB (Web) / Tauri 文件系统 (桌面)
  - **会话数据**: 仅存储在 React state 中，无持久化

### 1.2 数据结构
```typescript
// 会话结构
interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  folderId?: string;
  activeAgents?: string[];
}

// 消息结构
interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  attachments?: Attachment[];
  // ... 其他字段
}

// 附件结构 (多模态支持)
interface Attachment {
  id: string;
  type: 'image' | 'document';
  name: string;
  data: string;  // base64 DataURL
  mimeType: string;
  size?: number;
}
```

### 1.3 问题
1. 会话数据仅存在于内存中，应用重启后丢失
2. 多模态附件以 base64 存储在消息中，可能导致数据量过大
3. 无会话导入/导出功能

---

## 二、存储方案设计

### 2.1 存储方式选择

采用**混合存储策略**，根据运行环境自动选择：

| 环境 | 会话元数据 | 消息内容 | 附件文件 |
|------|-----------|---------|---------|
| Tauri 桌面 | JSON 文件 | JSON 文件 | 独立文件存储 |
| Web 浏览器 | IndexedDB | IndexedDB | IndexedDB (压缩) |

**选择理由**:
- Tauri 文件系统支持直接存储二进制文件，避免 base64 体积膨胀
- IndexedDB 支持大容量存储，适合 Web 环境
- 复用现有 `tokenStorage.ts` 和 `tauriTokenStorage.ts` 的抽象模式

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
  // 会话元数据
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
  
  // 消息内容
  messages: {
    key: string;  // `${sessionId}_${messageId}`
    value: Message & { sessionId: string };
    indexes: {
      'by-session': string;
      'by-session-time': [string, number];
    };
  };
  
  // 文件夹
  folders: {
    key: string;
    value: ChatFolder;
  };
  
  // 附件 (压缩存储)
  attachments: {
    key: string;  // attachmentId
    value: {
      id: string;
      sessionId: string;
      messageId: string;
      type: 'image' | 'document';
      name: string;
      data: Blob;  // 二进制数据
      mimeType: string;
      size: number;
    };
    indexes: {
      'by-session': string;
    };
  };
}
```

---

## 三、核心实现步骤

### 步骤 1: 创建存储服务接口

**文件**: `src/services/sessionStorage.ts`

定义统一的存储接口，支持 Tauri 和 Web 两种实现：

```typescript
export interface SessionStorageService {
  // 会话管理
  getAllSessions(): Promise<ChatSession[]>;
  getSession(id: string): Promise<ChatSession | null>;
  saveSession(session: ChatSession): Promise<void>;
  deleteSession(id: string): Promise<void>;
  
  // 文件夹管理
  getAllFolders(): Promise<ChatFolder[]>;
  saveFolder(folder: ChatFolder): Promise<void>;
  deleteFolder(id: string): Promise<void>;
  
  // 附件管理
  saveAttachment(sessionId: string, attachment: Attachment): Promise<string>; // 返回存储路径/ID
  getAttachment(sessionId: string, attachmentId: string): Promise<Attachment | null>;
  deleteAttachment(sessionId: string, attachmentId: string): Promise<void>;
  
  // 批量操作
  batchDeleteSessions(ids: string[]): Promise<void>;
  
  // 迁移
  migrateFromMemory(sessions: ChatSession[], folders: ChatFolder[]): Promise<void>;
}
```

### 步骤 2: 实现 Tauri 文件系统存储

**文件**: `src/services/tauriSessionStorage.ts`

关键实现点：
1. 使用 `@tauri-apps/plugin-fs` 进行文件读写
2. 附件以独立文件存储，消息中只保留引用路径
3. 实现增量保存，避免全量覆盖
4. 添加文件锁机制防止并发写入

### 步骤 3: 实现 IndexedDB 存储

**文件**: `src/services/indexedDBSessionStorage.ts`

关键实现点：
1. 使用 `idb` 库操作 IndexedDB
2. 附件数据存储为 Blob 类型
3. 实现分页加载，优化大消息列表性能
4. 添加数据压缩选项（可选）

### 步骤 4: 创建存储 Hook

**文件**: `src/hooks/useSessionStorage.ts`

```typescript
export function useSessionStorage() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // 自动检测环境并初始化
  useEffect(() => {
    initStorage();
  }, []);
  
  return {
    isInitialized,
    isLoading,
    storage: storageService,
    // ... 其他方法
  };
}
```

### 步骤 5: 修改 GlobalStateContext

**文件**: `src/context/GlobalStateContext.tsx`

修改内容：
1. 添加存储初始化逻辑
2. 会话变更时自动持久化
3. 应用启动时加载历史会话
4. 添加存储状态指示器

### 步骤 6: 修改消息数据结构

优化附件存储方式：

```typescript
// 新增附件引用类型
interface AttachmentReference {
  id: string;
  type: 'image' | 'document';
  name: string;
  mimeType: string;
  size?: number;
  storagePath?: string;  // Tauri: 文件路径
  storageKey?: string;   // IndexedDB: 存储键
}

// Message 接口更新
interface Message {
  // ... 原有字段
  attachments?: AttachmentReference[];  // 改为引用
  pendingAttachments?: Attachment[];    // 待上传的临时附件
}
```

### 步骤 7: 添加迁移功能

**文件**: `src/services/sessionMigration.ts`

实现从内存状态到持久化存储的迁移：
1. 首次启动时检测是否有未保存的会话
2. 自动迁移到持久化存储
3. 清理临时数据

---

## 四、多模态附件处理策略

### 4.1 Tauri 环境

```
用户上传文件 → 读取文件内容 → 生成唯一ID → 保存到 attachments/{sessionId}/{id}.{ext}
                                    ↓
                            消息中存储引用路径
```

**优势**:
- 文件以原始格式存储，无体积膨胀
- 支持大文件存储
- 可直接在文件管理器中访问

### 4.2 Web 环境

```
用户上传文件 → 读取文件内容 → 压缩(可选) → 存储到 IndexedDB
                                    ↓
                            消息中存储引用 ID
```

**优化措施**:
- 图片自动压缩（质量 0.8，最大尺寸 2048px）
- 文档类文件保留原始格式
- 大文件提示用户可能影响性能

### 4.3 附件加载策略

```typescript
// 懒加载附件
async function loadAttachment(ref: AttachmentReference): Promise<Attachment> {
  if (ref.storagePath) {
    // Tauri: 从文件读取
    const data = await readFile(ref.storagePath);
    return { ...ref, data: arrayBufferToDataURL(data, ref.mimeType) };
  } else if (ref.storageKey) {
    // IndexedDB: 从数据库读取
    const blob = await db.get('attachments', ref.storageKey);
    return { ...ref, data: await blobToDataURL(blob) };
  }
  throw new Error('Invalid attachment reference');
}
```

---

## 五、性能优化策略

### 5.1 增量保存

```typescript
// 只保存变更的会话
const debouncedSave = debounce(async (sessionId: string) => {
  const session = sessions.find(s => s.id === sessionId);
  if (session) {
    await storage.saveSession(session);
  }
}, 1000);
```

### 5.2 懒加载消息

```typescript
// 分页加载历史消息
async function loadMessages(sessionId: string, page: number, pageSize: number = 50) {
  return storage.getMessages(sessionId, page * pageSize, pageSize);
}
```

### 5.3 缓存策略

```typescript
// 内存缓存 + 磁盘持久化
const messageCache = new LRUCache<string, Message>({ max: 100 });
```

---

## 六、实现文件清单

| 文件路径 | 说明 |
|---------|------|
| `src/services/sessionStorage.ts` | 存储服务接口定义 |
| `src/services/tauriSessionStorage.ts` | Tauri 文件系统实现 |
| `src/services/indexedDBSessionStorage.ts` | IndexedDB 实现 |
| `src/services/sessionMigration.ts` | 数据迁移服务 |
| `src/hooks/useSessionStorage.ts` | 存储 Hook |
| `src/types.ts` | 更新类型定义 |

---

## 七、修改现有文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src/context/GlobalStateContext.tsx` | 集成持久化存储 |
| `src/components/Sidebar.tsx` | 添加存储状态指示 |
| `src/components/ChatInput.tsx` | 附件处理逻辑调整 |
| `src/components/ChatView.tsx` | 消息加载逻辑调整 |

---

## 八、测试计划

1. **单元测试**: 存储服务各方法
2. **集成测试**: 会话创建、切换、删除流程
3. **性能测试**: 大量会话和消息的加载性能
4. **迁移测试**: 从旧版本升级的数据迁移
5. **多模态测试**: 图片和文件附件的完整流程

---

## 九、风险与应对

| 风险 | 应对措施 |
|------|---------|
| 数据丢失 | 实现自动备份功能，保留最近 3 个版本 |
| 性能下降 | 增量保存 + 懒加载 + 缓存 |
| 存储空间不足 | 添加存储空间检测，提示用户清理 |
| 并发写入冲突 | 实现文件锁机制，队列化写入操作 |

---

## 十、后续扩展

1. **会话导出/导入**: 支持导出为 JSON/Markdown 格式
2. **云端同步**: 可选的云端备份功能
3. **会话搜索**: 基于内容的全文搜索
4. **会话分享**: 生成分享链接
