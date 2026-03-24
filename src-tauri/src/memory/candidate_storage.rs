use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::models::{CandidateMemory, CandidateStatus, MemoryType, MemoryItem};

use std::sync::Mutex as StdMutex;

#[derive(Debug)]
pub enum CandidateStorageError {
    Database(rusqlite::Error),
    NotFound(String),
    InvalidStatus(String),
}

impl std::fmt::Display for CandidateStorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CandidateStorageError::Database(e) => write!(f, "Database error: {}", e),
            CandidateStorageError::NotFound(id) => write!(f, "Candidate not found: {}", id),
            CandidateStorageError::InvalidStatus(s) => write!(f, "Invalid status: {}", s),
        }
    }
}

impl std::error::Error for CandidateStorageError {}

pub struct CandidateStorage {
    conn: Arc<StdMutex<Connection>>,
}

impl CandidateStorage {
    pub fn new(db_path: PathBuf) -> Result<Self, CandidateStorageError> {
        log::info!("[CandidateStorage] 初始化候选记忆存储, 路径: {:?}", db_path);
        
        let conn = Connection::open(&db_path).map_err(CandidateStorageError::Database)?;
        let storage = Self { 
            conn: Arc::new(StdMutex::new(conn)),
        };
        storage.initialize()?;
        Ok(storage)
    }

    fn initialize(&self) -> Result<(), CandidateStorageError> {
        let conn = self.conn.lock().map_err(|_| {
            CandidateStorageError::Database(rusqlite::Error::InvalidParameterName("lock failed".into()))
        })?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS candidate_memories (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                memory_type TEXT NOT NULL,
                confidence REAL NOT NULL,
                source_session_id TEXT NOT NULL,
                source_message_ids TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                status TEXT NOT NULL,
                importance REAL NOT NULL
            )",
            [],
        ).map_err(CandidateStorageError::Database)?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_candidate_status ON candidate_memories(status)",
            [],
        ).map_err(CandidateStorageError::Database)?;

        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_candidate_session ON candidate_memories(source_session_id)",
            [],
        ).map_err(CandidateStorageError::Database)?;

        
        Ok(())
    }

    pub fn add_candidate(&self, candidate: CandidateMemory) -> Result<String, CandidateStorageError> {
        let conn = self.conn.lock().map_err(|_| {
            CandidateStorageError::Database(rusqlite::Error::InvalidParameterName("lock failed".into()))
        })?;
        
        let source_message_ids = serde_json::to_string(&candidate.source_message_ids)
            .map_err(|e| CandidateStorageError::Database(rusqlite::Error::ToSqlConversionFailure(Box::new(e))))?;
        
        conn.execute(
            "INSERT INTO candidate_memories (id, content, memory_type, confidence, source_session_id, source_message_ids, created_at, status, importance)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                candidate.id,
                candidate.content,
                candidate.memory_type.as_str(),
                candidate.confidence,
                candidate.source_session_id,
                source_message_ids,
                candidate.created_at,
                candidate.status.as_str(),
                candidate.importance,
            ],
        ).map_err(CandidateStorageError::Database)?;
        
        Ok(candidate.id)
    }

    pub fn get_pending_candidates(&self) -> Result<Vec<CandidateMemory>, CandidateStorageError> {
        let conn = self.conn.lock().map_err(|_| {
            CandidateStorageError::Database(rusqlite::Error::InvalidParameterName("lock failed".into()))
        })?;
        
        let mut stmt = conn
            .prepare(
                "SELECT id, content, memory_type, confidence, source_session_id, source_message_ids, created_at, status, importance
                 FROM candidate_memories 
                 WHERE status = 'pending'
                 ORDER BY created_at DESC",
            )
            .map_err(CandidateStorageError::Database)?;

        let candidates = stmt
            .query_map([], |row| {
                let memory_type_str: String = row.get(2)?;
                let memory_type = MemoryType::from_str(&memory_type_str)
                    .ok_or_else(|| rusqlite::Error::InvalidColumnType(2, memory_type_str.clone(), rusqlite::types::Type::Text))?;
                
                let status_str: String = row.get(7)?;
                let status = CandidateStatus::from_str(&status_str)
                    .ok_or_else(|| rusqlite::Error::InvalidColumnType(7, status_str.clone(), rusqlite::types::Type::Text))?;
                
                let source_message_ids_str: String = row.get(5)?;
                let source_message_ids: Vec<String> = serde_json::from_str(&source_message_ids_str)
                    .map_err(|e| rusqlite::Error::FromSqlConversionFailure(5, rusqlite::types::Type::Text, Box::new(e)))?;
                
                Ok(CandidateMemory {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    memory_type,
                    confidence: row.get(3)?,
                    source_session_id: row.get(4)?,
                    source_message_ids,
                    created_at: row.get(6)?,
                    status,
                    importance: row.get(8)?,
                })
            })
            .map_err(CandidateStorageError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CandidateStorageError::Database)?;
        
        Ok(candidates)
    }

    pub fn get_candidate(&self, id: &str) -> Result<CandidateMemory, CandidateStorageError> {
        let conn = self.conn.lock().map_err(|_| {
            CandidateStorageError::Database(rusqlite::Error::InvalidParameterName("lock failed".into()))
        })?;
        
        let mut stmt = conn
            .prepare(
                "SELECT id, content, memory_type, confidence, source_session_id, source_message_ids, created_at, status, importance
                 FROM candidate_memories 
                 WHERE id = ?1",
            )
            .map_err(CandidateStorageError::Database)?;
        
        let candidate = stmt
            .query_row(params![id], |row| {
                let memory_type_str: String = row.get(2)?;
                let memory_type = MemoryType::from_str(&memory_type_str)
                    .ok_or_else(|| rusqlite::Error::InvalidColumnType(2, memory_type_str.clone(), rusqlite::types::Type::Text))?;
                
                let status_str: String = row.get(7)?;
                let status = CandidateStatus::from_str(&status_str)
                    .ok_or_else(|| rusqlite::Error::InvalidColumnType(7, status_str.clone(), rusqlite::types::Type::Text))?;
                
                let source_message_ids_str: String = row.get(5)?;
                let source_message_ids: Vec<String> = serde_json::from_str(&source_message_ids_str)
                    .map_err(|e| rusqlite::Error::FromSqlConversionFailure(5, rusqlite::types::Type::Text, Box::new(e)))?;
                
                Ok(CandidateMemory {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    memory_type,
                    confidence: row.get(3)?,
                    source_session_id: row.get(4)?,
                    source_message_ids,
                    created_at: row.get(6)?,
                    status,
                    importance: row.get(8)?,
                })
            })
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => CandidateStorageError::NotFound(id.to_string()),
                e => CandidateStorageError::Database(e),
            })?;
        
        Ok(candidate)
    }

    pub fn update_status(&self, id: &str, status: CandidateStatus) -> Result<(), CandidateStorageError> {
        let conn = self.conn.lock().map_err(|_| {
            CandidateStorageError::Database(rusqlite::Error::InvalidParameterName("lock failed".into()))
        })?;
        
        let rows_affected = conn
            .execute(
                "UPDATE candidate_memories SET status = ?1 WHERE id = ?2",
                params![status.as_str(), id],
            )
            .map_err(CandidateStorageError::Database)?;
        
        if rows_affected == 0 {
            return Err(CandidateStorageError::NotFound(id.to_string()));
        }
        
        Ok(())
    }

    pub fn delete_candidate(&self, id: &str) -> Result<(), CandidateStorageError> {
        let conn = self.conn.lock().map_err(|_| {
            CandidateStorageError::Database(rusqlite::Error::InvalidParameterName("lock failed".into()))
        })?;
        
        let rows_affected = conn
            .execute("DELETE FROM candidate_memories WHERE id = ?1", params![id])
            .map_err(CandidateStorageError::Database)?;

        if rows_affected == 0 {
            return Err(CandidateStorageError::NotFound(id.to_string()));
        }

        Ok(())
    }

    pub fn clear_old_candidates(&self, max_age_hours: i64) -> Result<usize, CandidateStorageError> {
        let conn = self.conn.lock().map_err(|_| {
            CandidateStorageError::Database(rusqlite::Error::InvalidParameterName("lock failed".into()))
        })?;
        
        let cutoff_time = chrono::Utc::now().timestamp() - (max_age_hours * 3600);
        
        let rows_affected = conn
            .execute(
                "DELETE FROM candidate_memories WHERE created_at < ?1 AND status != 'pending'",
                params![cutoff_time],
            )
            .map_err(CandidateStorageError::Database)?;
        
        Ok(rows_affected)
    }

    pub fn candidate_to_memory_item(candidate: CandidateMemory) -> MemoryItem {
        MemoryItem::new(
            candidate.content,
            candidate.memory_type,
            candidate.importance,
        )
        .with_session_id(candidate.source_session_id)
    }
}
