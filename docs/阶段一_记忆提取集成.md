# 阶段一：记忆提取集成 - 实现总结

## 实现日期

2026-03-23

## 核心目标

将记忆提取功能接入对话流程，实现**候选记忆（Candidate Memories）**机制，让用户可以审核、接受或拒绝提取的记忆，而不是直接写入 memory.db。

## 架构设计

```
对话结束 → LLM 提取 → Candidate Memories（候选）→ 用户审核 → 写入 memory.db
                                    ↓
                              用户可在 UI 查看
```

## 新增文件清单

### Rust 后端

| 文件路径 | 功能描述 |
|---------|---------|
| `src-tauri/src/memory/candidate_storage.rs` | 候选记忆存储（SQLite 表、CRUD 操作） |

### 前端 TypeScript

| 文件路径 | 功能描述 |
|---------|---------|
| `src/agent/memory/MemoryExtractionService.ts` | 记忆提取服务（异步触发、LLM 调用、候选转换） |
| `src/components/MemoryPanel/CandidateMemories.tsx` | 候选记忆 UI 组件（列表展示、接受/拒绝操作） |

## 修改文件清单

### Rust 后端

| 文件路径 | 修改内容 |
|---------|---------|
| `src-tauri/src/models/memory.rs` | 新增 `CandidateMemory`、`CandidateStatus`、`ExtractionResult`、`ExtractionConfig`、`ConversationMessage` 类型 |
| `src-tauri/src/memory/mod.rs` | 导出 `candidate_storage` 模块 |
| `src-tauri/src/memory/extraction.rs` | 新增 `should_extract()`、`calculate_confidence()`、`check_duplicate_simple()`、`convert_extracted_to_candidates()` 函数 |
| `src-tauri/src/memory/storage.rs` | 新增 `get_connection()` 方法，修复 UTF-8 字符串切片问题 |
| `src-tauri/src/memory/retrieval.rs` | 修复 UTF-8 字符串切片问题 |
| `src-tauri/src/commands/memory.rs` | 新增候选记忆相关 Commands，`MemoryState` 添加 `candidate_storage` |
| `src-tauri/src/lib.rs` | 注册新的 Tauri Commands |

### 前端 TypeScript

| 文件路径 | 修改内容 |
|---------|---------|
| `src/types.ts` | 新增 `CandidateMemory`、`CandidateStatus`、`ExtractionResult`、`ExtractionConfig`、`ConversationMessage` 类型 |
| `src/agent/memory/TauriMemoryClient.ts` | 新增候选记忆相关 API 方法 |
| `src/agent/memory/index.ts` | 导出 `MemoryExtractionService` |
| `src/agent/types.ts` | `AgentExecutionContext` 新增 `sessionId` 字段 |
| `src/agent/runtime/AgentRuntime.ts` | `execute()` 方法新增 `sessionId` 参数 |
| `src/agent/runtime/ReActEngine.ts` | 对话结束后触发记忆提取，传递 `sessionId` |
| `src/hooks/useAgentExecution.ts` | `execute()` 方法新增 `sessionId` 参数 |
| `src/App.tsx` | 传递 `currentSessionId` 到 `agentExecution.execute()` |
| `src/components/MemoryPanel/types.ts` | 新增 `candidates` 标签页类型 |
| `src/components/MemoryPanel/index.tsx` | 集成候选记忆标签页 |
| `src/components/MemoryPanel/MemoryHits.tsx` | 修复 `memoryScore` 字段安全检查 |
| `src/i18n/locales/zh.json` | 新增候选记忆中文翻译 |
| `src/i18n/locales/en.json` | 新增候选记忆英文翻译 |

## 新增 Tauri Commands

| Command | 功能 |
|---------|------|
| `should_extract_memories` | 判断是否满足提取条件 |
| `get_pending_candidates` | 获取待审核的候选记忆 |
| `accept_candidate` | 接受单条候选记忆 |
| `reject_candidate` | 拒绝单条候选记忆 |
| `accept_all_candidates` | 批量接受所有候选记忆（含去重） |
| `add_candidate_memory` | 添加候选记忆 |
| `clear_old_candidates` | 清理旧的候选记忆 |

## 核心功能实现

### 1. 提取触发条件

```rust
pub struct ExtractionConfig {
    pub min_message_count: usize,      // 最少消息数（默认 4）
    pub min_conversation_length: usize, // 最少对话长度（默认 200 字符）
    pub skip_tool_call_messages: bool,  // 跳过工具调用消息
}
```

**触发时机**：第 2 轮对话结束后（用户→AI→用户→AI = 4 条消息）

### 2. 置信度计算

```rust
pub fn calculate_confidence(
    content: &str,
    memory_type: &MemoryType,
    source_message_count: usize,
) -> f32 {
    let mut confidence: f32 = 0.5;  // 基础置信度

    // 内容长度加分
    if content.len() > 20 { confidence += 0.1; }
    if content.len() > 50 { confidence += 0.05; }

    // 来源消息数加分
    if source_message_count > 1 { confidence += 0.1; }
    if source_message_count > 3 { confidence += 0.05; }

    // 记忆类型加分
    match memory_type {
        MemoryType::Identity | MemoryType::Preference => confidence += 0.1,
        MemoryType::Constraint => confidence += 0.05,
        _ => {}
    }

    confidence.min(1.0_f32)
}
```

### 3. 简单去重检查

```rust
pub fn check_duplicate_simple(content: &str, existing: &[MemoryItem]) -> Option<String> {
    for memory in existing {
        // 1. 精确匹配
        if memory.content == content { return Some(memory.id.clone()); }

        // 2. 包含匹配（现有记忆包含候选内容）
        if memory.content.contains(content) { return Some(memory.id.clone()); }

        // 3. 反向包含匹配（候选内容包含现有记忆，且现有记忆 > 20 字符）
        if content.contains(&memory.content) && memory.content.len() > 20 {
            return Some(memory.id.clone());
        }

        // 4. 关键词重叠匹配（重叠率 > 80%）
        let overlap = calculate_keyword_overlap(content, &memory.content);
        if overlap > 0.8 { return Some(memory.id.clone()); }
    }
    None
}
```

### 4. 批量接受时的增量去重

```rust
// accept_all_candidates 中
let mut existing = storage.get_all_memories().await?;

for candidate in candidates {
    // 检查与已存储记忆 + 已接受记忆的重复
    if check_duplicate_simple(&candidate.content, &existing).is_some() {
        // 跳过重复
        continue;
    }
    
    // 接受并加入 existing 列表，供后续候选检查
    storage.add_memory(memory_item.clone()).await?;
    existing.push(memory_item.clone());
}
```

## 数据库表结构

### candidate_memories 表

```sql
CREATE TABLE candidate_memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    confidence REAL NOT NULL,
    source_session_id TEXT NOT NULL,
    source_message_ids TEXT NOT NULL,  -- JSON 数组
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL,              -- pending/accepted/rejected/merged
    importance REAL NOT NULL
);

CREATE INDEX idx_candidate_status ON candidate_memories(status);
CREATE INDEX idx_candidate_session ON candidate_memories(source_session_id);
```

## Bug 修复

### 1. UTF-8 字符串切片问题

**问题**：`&query[..50]` 按字节切割，在中文等多字节字符处会 panic

**修复**：
```rust
// 错误
&query[..50]

// 正确
query.chars().take(50).collect::<String>()
```

**影响文件**：
- `src-tauri/src/memory/retrieval.rs`
- `src-tauri/src/memory/storage.rs`

### 2. sessionId 未传递问题

**问题**：`ReActEngine` 中 `this.context.sessionId` 为 `undefined`，导致跳过记忆提取

**修复**：从 `App.tsx` → `useAgentExecution.ts` → `AgentRuntime.ts` → `ReActEngine.ts` 完整传递 `sessionId`

### 3. memoryScore 字段序列化问题

**问题**：后端返回 `memory_score` (snake_case)，前端期望 `memoryScore` (camelCase)

**修复**：
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreComponents {
    pub similarity: f32,
    #[serde(rename = "memoryScore")]  // 添加 rename
    pub memory_score: f32,
}
```

### 4. MemoryHits 组件崩溃

**问题**：`hit.components` 可能为 `undefined`，调用 `.toFixed()` 时崩溃

**修复**：添加安全检查
```typescript
const similarity = hit.components?.similarity ?? 0;
const memoryScore = hit.components?.memoryScore ?? 0;
```

## 验收标准

- [x] 对话结束后能自动提取记忆到候选列表
- [x] 候选记忆不直接写入 memory.db
- [x] 用户可以在 UI 查看、接受、拒绝候选记忆
- [x] 提取过程异步，不影响对话体验
- [x] 简单去重生效（不添加重复记忆）
- [x] 第 2 轮对话后触发提取（而非第 3 轮）

## 已知限制

1. **LLM API 限制**：对话内容过长（如 8000+ 字符）可能导致 API 400 错误
2. **去重能力有限**：简单去重无法识别语义相似但表述不同的记忆（如 "用户是程序员" vs "用户从事软件开发"）
3. **提取质量依赖 LLM**：提取的记忆质量取决于 LLM 的理解能力

## 后续优化方向

1. **截断长对话**：在调用 LLM 提取前截断过长的对话内容
2. **向量相似度去重**（阶段四）：使用 embedding 计算语义相似度进行去重
3. **提取结果缓存**：避免重复提取相同内容
4. **用户反馈学习**：根据用户接受/拒绝的行为优化提取策略
