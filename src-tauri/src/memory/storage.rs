use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use rusqlite::{Connection, params};
use crate::models::{
    MemoryItem, MemoryType, TaskStatus, TaskMetadata, RetrievalOptions, MemoryStats,
    ChatSession, Message, ChatFolder, DecayResult, PruneResult, EvolutionStats,
    get_default_decay,
};

const EMBEDDING_DIM: usize = 384;

#[derive(Clone)]
pub struct MemoryStorage {
    conn: Arc<Mutex<Connection>>,
}

impl MemoryStorage {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        log::info!("[MemoryStorage] 创建存储实例, 路径: {:?}", app_data_dir);
        std::fs::create_dir_all(&app_data_dir)?;
        let db_path = app_data_dir.join("memory.db");
        log::info!("[MemoryStorage] 数据库路径: {:?}", db_path);
        let conn = Connection::open(&db_path)?;
        
        let storage = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        storage.initialize_database()?;
        log::info!("[MemoryStorage] 数据库表初始化完成");
        Ok(storage)
    }

    pub fn get_connection(&self) -> Arc<Mutex<Connection>> {
        self.conn.clone()
    }

    fn initialize_database(&self) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("[MemoryStorage] 正在初始化数据库表结构...");
        let conn = self.conn.blocking_lock();
        
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                folder_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                active_agents TEXT
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                metadata TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

            CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                is_expanded INTEGER DEFAULT 1,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS memory_items (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('identity', 'fact', 'preference', 'task', 'constraint', 'skill')),
                importance REAL NOT NULL DEFAULT 0.5,
                embedding BLOB,
                source_session_id TEXT,
                created_at INTEGER NOT NULL,
                last_accessed_at INTEGER NOT NULL,
                access_count INTEGER DEFAULT 0,
                metadata TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_items(type);
            CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory_items(importance);
            "#,
        )?;

        let score_exists: bool = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('memory_items') WHERE name = 'score'",
            [],
            |row| row.get::<_, i32>(0)
        )? == 1;

        if !score_exists {
            log::info!("[MemoryStorage] 检测到旧表结构，正在迁移...");
            conn.execute("ALTER TABLE memory_items ADD COLUMN score REAL NOT NULL DEFAULT 0.5", [])?;
            conn.execute("ALTER TABLE memory_items ADD COLUMN decay REAL NOT NULL DEFAULT 0.01", [])?;
            conn.execute("ALTER TABLE memory_items ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1", [])?;
            conn.execute("ALTER TABLE memory_items ADD COLUMN marked_inactive_at INTEGER", [])?;
            
            conn.execute_batch(
                "UPDATE memory_items SET score = importance WHERE score = 0.5;
                 UPDATE memory_items SET decay = CASE type
                     WHEN 'identity' THEN 0.001
                     WHEN 'skill' THEN 0.002
                     WHEN 'constraint' THEN 0.003
                     WHEN 'preference' THEN 0.005
                     WHEN 'fact' THEN 0.01
                     WHEN 'task' THEN 0.02
                     ELSE 0.01
                 END WHERE decay = 0.01;"
            )?;
            log::info!("[MemoryStorage] 数据迁移完成");
        }

        conn.execute_batch(
            r#"
            CREATE INDEX IF NOT EXISTS idx_memory_score ON memory_items(score);
            CREATE INDEX IF NOT EXISTS idx_memory_active ON memory_items(is_active);
            CREATE INDEX IF NOT EXISTS idx_memory_created ON memory_items(created_at);
            "#,
        )?;

        Ok(())
    }

    pub async fn add_memory(&self, item: MemoryItem) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("[MemoryStorage] 添加记忆: type={}, importance={:.2}, score={:.2}, decay={:.3}, content={}", 
            item.memory_type.as_str(), item.importance, item.score, item.decay,
            item.content.chars().take(50).collect::<String>());
        let conn = self.conn.lock().await;
        let embedding_blob = item.embedding.as_ref().map(|e| {
            let bytes: Vec<u8> = e.iter()
                .flat_map(|f| f.to_le_bytes())
                .collect();
            bytes
        });
        
        let metadata_json = item.metadata.as_ref()
            .map(|m| serde_json::to_string(m).unwrap_or_default());

        conn.execute(
            "INSERT OR REPLACE INTO memory_items (id, content, type, importance, score, decay, is_active, marked_inactive_at, embedding, source_session_id, created_at, last_accessed_at, access_count, metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                item.id,
                item.content,
                item.memory_type.as_str(),
                item.importance,
                item.score,
                item.decay,
                item.is_active as i32,
                item.marked_inactive_at,
                embedding_blob,
                item.source_session_id,
                item.created_at,
                item.last_accessed_at,
                item.access_count,
                metadata_json,
            ],
        )?;

        Ok(())
    }

    pub async fn get_all_memories(&self) -> Result<Vec<MemoryItem>, Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            "SELECT id, content, type, importance, score, decay, is_active, marked_inactive_at, embedding, source_session_id, created_at, last_accessed_at, access_count, metadata FROM memory_items ORDER BY score DESC"
        )?;
        
        let items = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let content: String = row.get(1)?;
            let type_str: String = row.get(2)?;
            let importance: f32 = row.get(3)?;
            let score: f32 = row.get(4)?;
            let decay: f32 = row.get(5)?;
            let is_active: i32 = row.get(6)?;
            let marked_inactive_at: Option<i64> = row.get(7)?;
            let embedding_blob: Option<Vec<u8>> = row.get(8)?;
            let source_session_id: Option<String> = row.get(9)?;
            let created_at: i64 = row.get(10)?;
            let last_accessed_at: i64 = row.get(11)?;
            let access_count: i32 = row.get(12)?;
            let metadata_json: Option<String> = row.get(13)?;

            let embedding = embedding_blob.map(|blob| {
                let mut vec = Vec::with_capacity(blob.len() / 4);
                for chunk in blob.chunks(4) {
                    let bytes: [u8; 4] = chunk.try_into().unwrap_or([0; 4]);
                    vec.push(f32::from_le_bytes(bytes));
                }
                vec
            });

            let metadata = metadata_json.and_then(|json| {
                serde_json::from_str::<TaskMetadata>(&json).ok()
            });

            let memory_type = MemoryType::from_str(&type_str).unwrap_or(MemoryType::Fact);

            Ok(MemoryItem {
                id,
                content,
                memory_type,
                importance,
                score,
                decay,
                is_active: is_active != 0,
                marked_inactive_at,
                embedding,
                source_session_id,
                created_at,
                last_accessed_at,
                access_count,
                metadata,
            })
        })?;

        let mut result = Vec::new();
        for item in items {
            result.push(item?);
        }
        Ok(result)
    }

    pub async fn get_memories_by_type(&self, memory_type: MemoryType) -> Result<Vec<MemoryItem>, Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            "SELECT id, content, type, importance, score, decay, is_active, marked_inactive_at, embedding, source_session_id, created_at, last_accessed_at, access_count, metadata FROM memory_items WHERE type = ?1 ORDER BY score DESC"
        )?;
        
        let items = stmt.query_map([memory_type.as_str()], |row| {
            let id: String = row.get(0)?;
            let content: String = row.get(1)?;
            let type_str: String = row.get(2)?;
            let importance: f32 = row.get(3)?;
            let score: f32 = row.get(4)?;
            let decay: f32 = row.get(5)?;
            let is_active: i32 = row.get(6)?;
            let marked_inactive_at: Option<i64> = row.get(7)?;
            let embedding_blob: Option<Vec<u8>> = row.get(8)?;
            let source_session_id: Option<String> = row.get(9)?;
            let created_at: i64 = row.get(10)?;
            let last_accessed_at: i64 = row.get(11)?;
            let access_count: i32 = row.get(12)?;
            let metadata_json: Option<String> = row.get(13)?;

            let embedding = embedding_blob.map(|blob| {
                let mut vec = Vec::with_capacity(blob.len() / 4);
                for chunk in blob.chunks(4) {
                    let bytes: [u8; 4] = chunk.try_into().unwrap_or([0; 4]);
                    vec.push(f32::from_le_bytes(bytes));
                }
                vec
            });

            let metadata = metadata_json.and_then(|json| {
                serde_json::from_str::<TaskMetadata>(&json).ok()
            });

            let memory_type = MemoryType::from_str(&type_str).unwrap_or(MemoryType::Fact);

            Ok(MemoryItem {
                id,
                content,
                memory_type,
                importance,
                score,
                decay,
                is_active: is_active != 0,
                marked_inactive_at,
                embedding,
                source_session_id,
                created_at,
                last_accessed_at,
                access_count,
                metadata,
            })
        })?;

        let mut result = Vec::new();
        for item in items {
            result.push(item?);
        }
        Ok(result)
    }

    pub async fn get_candidates(&self, options: &RetrievalOptions) -> Result<Vec<MemoryItem>, Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        
        let mut query = String::from(
            "SELECT id, content, type, importance, score, decay, is_active, marked_inactive_at, embedding, source_session_id, created_at, last_accessed_at, access_count, metadata FROM memory_items WHERE is_active = 1"
        );
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(types) = &options.memory_types {
            let placeholders: Vec<&str> = types.iter().map(|_| "?").collect();
            query.push_str(&format!(" AND type IN ({})", placeholders.join(",")));
            for t in types {
                params_vec.push(Box::new(t.as_str().to_string()));
            }
        }

        if let Some(min_importance) = options.min_importance {
            query.push_str(" AND importance >= ?");
            params_vec.push(Box::new(min_importance));
        }

        if let Some(session_id) = &options.session_id {
            query.push_str(" AND source_session_id = ?");
            params_vec.push(Box::new(session_id.clone()));
        }

        query.push_str(" ORDER BY score DESC LIMIT ?");
        params_vec.push(Box::new(options.top_k as i32 * 3));

        let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&query)?;
        let items = stmt.query_map(params_refs.as_slice(), |row| {
            let id: String = row.get(0)?;
            let content: String = row.get(1)?;
            let type_str: String = row.get(2)?;
            let importance: f32 = row.get(3)?;
            let score: f32 = row.get(4)?;
            let decay: f32 = row.get(5)?;
            let is_active: i32 = row.get(6)?;
            let marked_inactive_at: Option<i64> = row.get(7)?;
            let embedding_blob: Option<Vec<u8>> = row.get(8)?;
            let source_session_id: Option<String> = row.get(9)?;
            let created_at: i64 = row.get(10)?;
            let last_accessed_at: i64 = row.get(11)?;
            let access_count: i32 = row.get(12)?;
            let metadata_json: Option<String> = row.get(13)?;

            let embedding = embedding_blob.map(|blob| {
                let mut vec = Vec::with_capacity(blob.len() / 4);
                for chunk in blob.chunks(4) {
                    let bytes: [u8; 4] = chunk.try_into().unwrap_or([0; 4]);
                    vec.push(f32::from_le_bytes(bytes));
                }
                vec
            });

            let metadata = metadata_json.and_then(|json| {
                serde_json::from_str::<TaskMetadata>(&json).ok()
            });

            let memory_type = MemoryType::from_str(&type_str).unwrap_or(MemoryType::Fact);

            Ok(MemoryItem {
                id,
                content,
                memory_type,
                importance,
                score,
                decay,
                is_active: is_active != 0,
                marked_inactive_at,
                embedding,
                source_session_id,
                created_at,
                last_accessed_at,
                access_count,
                metadata,
            })
        })?;

        let mut result = Vec::new();
        for item in items {
            result.push(item?);
        }
        Ok(result)
    }

    pub async fn increment_access_count(&self, id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE memory_items SET access_count = access_count + 1, last_accessed_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    }

    pub async fn update_task_status(
        &self,
        id: &str,
        status: TaskStatus,
        progress: Option<String>,
        next_step: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        
        let metadata = TaskMetadata {
            status,
            progress,
            next_step,
        };
        let metadata_json = serde_json::to_string(&metadata)?;

        conn.execute(
            "UPDATE memory_items SET metadata = ?1 WHERE id = ?2",
            params![metadata_json, id],
        )?;

        Ok(())
    }

    pub async fn delete_memory(&self, id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        conn.execute("DELETE FROM memory_items WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub async fn prune_memories(&self) -> Result<usize, Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        
        let deleted = conn.execute(
            "DELETE FROM memory_items WHERE importance < 0.2 AND access_count = 0 AND created_at < ?1",
            params![chrono::Utc::now().timestamp() - 30 * 24 * 3600],
        )?;

        Ok(deleted)
    }

    pub async fn get_stats(&self) -> Result<MemoryStats, Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        
        let total_count: usize = conn.query_row(
            "SELECT COUNT(*) FROM memory_items",
            [],
            |row| row.get::<_, i32>(0).map(|n| n as usize)
        )?;

        let mut by_type = std::collections::HashMap::new();
        let mut stmt = conn.prepare("SELECT type, COUNT(*) FROM memory_items GROUP BY type")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
        })?;
        for row in rows {
            let (t, count) = row?;
            by_type.insert(t, count as usize);
        }

        let avg_importance: f32 = conn.query_row(
            "SELECT AVG(importance) FROM memory_items",
            [],
            |row| row.get::<_, Option<f32>>(0)
        )?.unwrap_or(0.0);

        Ok(MemoryStats {
            total_count,
            by_type,
            avg_importance,
        })
    }

    pub async fn save_session(&self, session: &ChatSession) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        let active_agents_json = session.active_agents.as_ref()
            .map(|a| serde_json::to_string(a).unwrap_or_default());

        conn.execute(
            "INSERT OR REPLACE INTO sessions (id, title, folder_id, created_at, updated_at, active_agents) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                session.id,
                session.title,
                session.folder_id,
                session.created_at,
                session.updated_at,
                active_agents_json,
            ],
        )?;

        Ok(())
    }

    pub async fn load_sessions(&self) -> Result<Vec<ChatSession>, Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            "SELECT id, title, folder_id, created_at, updated_at, active_agents FROM sessions ORDER BY updated_at DESC"
        )?;

        let sessions = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let folder_id: Option<String> = row.get(2)?;
            let created_at: i64 = row.get(3)?;
            let updated_at: i64 = row.get(4)?;
            let active_agents_json: Option<String> = row.get(5)?;

            let active_agents = active_agents_json.and_then(|json| {
                serde_json::from_str::<Vec<String>>(&json).ok()
            });

            Ok(ChatSession {
                id,
                title,
                folder_id,
                created_at,
                updated_at,
                active_agents,
            })
        })?;

        let mut result = Vec::new();
        for session in sessions {
            result.push(session?);
        }
        Ok(result)
    }

    pub async fn delete_session(&self, session_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        conn.execute("DELETE FROM messages WHERE session_id = ?1", params![session_id])?;
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![session_id])?;
        Ok(())
    }

    pub async fn save_messages(&self, session_id: &str, messages: &[Message]) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        
        for msg in messages {
            conn.execute(
                "INSERT OR REPLACE INTO messages (id, session_id, role, content, timestamp, metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    msg.id,
                    msg.session_id,
                    msg.role,
                    msg.content,
                    msg.timestamp,
                    msg.metadata,
                ],
            )?;
        }

        conn.execute(
            "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
            params![chrono::Utc::now().timestamp(), session_id],
        )?;

        Ok(())
    }

    pub async fn load_messages(&self, session_id: &str) -> Result<Vec<Message>, Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            "SELECT id, session_id, role, content, timestamp, metadata FROM messages WHERE session_id = ?1 ORDER BY timestamp ASC"
        )?;

        let messages = stmt.query_map([session_id], |row| {
            Ok(Message {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                timestamp: row.get(4)?,
                metadata: row.get(5)?,
            })
        })?;

        let mut result = Vec::new();
        for msg in messages {
            result.push(msg?);
        }
        Ok(result)
    }

    pub async fn save_folder(&self, folder: &ChatFolder) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        conn.execute(
            "INSERT OR REPLACE INTO folders (id, name, is_expanded, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![folder.id, folder.name, folder.is_expanded as i32, folder.created_at],
        )?;
        Ok(())
    }

    pub async fn load_folders(&self) -> Result<Vec<ChatFolder>, Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            "SELECT id, name, is_expanded, created_at FROM folders ORDER BY created_at DESC"
        )?;

        let folders = stmt.query_map([], |row| {
            let is_expanded: i32 = row.get(2)?;
            Ok(ChatFolder {
                id: row.get(0)?,
                name: row.get(1)?,
                is_expanded: is_expanded != 0,
                created_at: row.get(3)?,
            })
        })?;

        let mut result = Vec::new();
        for folder in folders {
            result.push(folder?);
        }
        Ok(result)
    }

    pub async fn delete_folder(&self, folder_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        conn.execute("UPDATE sessions SET folder_id = NULL WHERE folder_id = ?1", params![folder_id])?;
        conn.execute("DELETE FROM folders WHERE id = ?1", params![folder_id])?;
        Ok(())
    }

    pub async fn reinforce_memories(&self, ids: &[String]) -> Result<usize, Box<dyn std::error::Error>> {
        if ids.is_empty() {
            return Ok(0);
        }
        
        let conn = self.conn.lock().await;
        let now = chrono::Utc::now().timestamp();
        let mut updated = 0;
        
        for id in ids {
            let rows = conn.execute(
                "UPDATE memory_items SET 
                    score = MIN(score + 0.05, 1.0),
                    access_count = access_count + 1,
                    last_accessed_at = ?1,
                    is_active = 1,
                    marked_inactive_at = NULL
                 WHERE id = ?2",
                params![now, id],
            )?;
            updated += rows;
        }
        
        Ok(updated)
    }

    pub async fn decay_memories(&self) -> Result<DecayResult, Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        let now = chrono::Utc::now().timestamp();
        
        let mut stmt = conn.prepare(
            "SELECT id, score, decay, last_accessed_at FROM memory_items WHERE is_active = 1"
        )?;
        
        let items: Vec<(String, f32, f32, i64)> = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?.filter_map(|r| r.ok()).collect();
        
        let processed = items.len();
        let mut updated = 0;
        
        for (id, score, decay, last_accessed) in items {
            let days_since_access = (now - last_accessed) as f32 / (24.0 * 3600.0);
            let new_score = score * (-decay * days_since_access).exp();
            
            let rows = conn.execute(
                "UPDATE memory_items SET score = ?1 WHERE id = ?2",
                params![new_score, id],
            )?;
            updated += rows;
        }
        
        Ok(DecayResult { processed, updated })
    }

    pub async fn prune_memories_v2(&self) -> Result<PruneResult, Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        let now = chrono::Utc::now().timestamp();
        let seven_days_ago = now - 7 * 24 * 3600;
        
        let marked_inactive = conn.execute(
            "UPDATE memory_items SET is_active = 0, marked_inactive_at = ?1 
             WHERE score < 0.3 AND is_active = 1",
            params![now],
        )?;
        
        let deleted = conn.execute(
            "DELETE FROM memory_items 
             WHERE score < 0.1 AND is_active = 0 AND marked_inactive_at < ?1",
            params![seven_days_ago],
        )?;
        
        Ok(PruneResult { marked_inactive, deleted })
    }

    pub async fn get_evolution_stats(&self) -> Result<EvolutionStats, Box<dyn std::error::Error>> {
        let conn = self.conn.lock().await;
        
        let active_count: usize = conn.query_row(
            "SELECT COUNT(*) FROM memory_items WHERE is_active = 1",
            [],
            |row| row.get::<_, i32>(0).map(|n| n as usize)
        )?;
        
        let inactive_count: usize = conn.query_row(
            "SELECT COUNT(*) FROM memory_items WHERE is_active = 0",
            [],
            |row| row.get::<_, i32>(0).map(|n| n as usize)
        )?;
        
        let avg_score: f32 = conn.query_row(
            "SELECT AVG(score) FROM memory_items WHERE is_active = 1",
            [],
            |row| row.get::<_, Option<f32>>(0)
        )?.unwrap_or(0.0);
        
        let avg_decay: f32 = conn.query_row(
            "SELECT AVG(decay) FROM memory_items WHERE is_active = 1",
            [],
            |row| row.get::<_, Option<f32>>(0)
        )?.unwrap_or(0.0);
        
        Ok(EvolutionStats {
            active_count,
            inactive_count,
            avg_score,
            avg_decay,
        })
    }
}
