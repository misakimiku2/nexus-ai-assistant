use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MemoryType {
    Identity,
    Fact,
    Preference,
    Task,
    Constraint,
    Skill,
}

impl MemoryType {
    pub fn as_str(&self) -> &'static str {
        match self {
            MemoryType::Identity => "identity",
            MemoryType::Fact => "fact",
            MemoryType::Preference => "preference",
            MemoryType::Task => "task",
            MemoryType::Constraint => "constraint",
            MemoryType::Skill => "skill",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "identity" => Some(MemoryType::Identity),
            "fact" => Some(MemoryType::Fact),
            "preference" => Some(MemoryType::Preference),
            "task" => Some(MemoryType::Task),
            "constraint" => Some(MemoryType::Constraint),
            "skill" => Some(MemoryType::Skill),
            _ => None,
        }
    }
}

pub fn get_default_decay(memory_type: &MemoryType) -> f32 {
    match memory_type {
        MemoryType::Identity => 0.001,
        MemoryType::Skill => 0.002,
        MemoryType::Constraint => 0.003,
        MemoryType::Preference => 0.005,
        MemoryType::Fact => 0.01,
        MemoryType::Task => 0.02,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Done,
    Cancelled,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskStatus::Pending => "pending",
            TaskStatus::InProgress => "in_progress",
            TaskStatus::Done => "done",
            TaskStatus::Cancelled => "cancelled",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(TaskStatus::Pending),
            "in_progress" => Some(TaskStatus::InProgress),
            "done" => Some(TaskStatus::Done),
            "cancelled" => Some(TaskStatus::Cancelled),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskMetadata {
    pub status: TaskStatus,
    pub progress: Option<String>,
    pub next_step: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryItem {
    pub id: String,
    pub content: String,
    #[serde(rename = "memoryType")]
    pub memory_type: MemoryType,
    pub importance: f32,
    pub score: f32,
    pub decay: f32,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    #[serde(rename = "markedInactiveAt")]
    pub marked_inactive_at: Option<i64>,
    pub embedding: Option<Vec<f32>>,
    #[serde(rename = "sourceSessionId")]
    pub source_session_id: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "lastAccessedAt")]
    pub last_accessed_at: i64,
    #[serde(rename = "accessCount")]
    pub access_count: i32,
    pub metadata: Option<TaskMetadata>,
}

impl MemoryItem {
    pub fn new(content: String, memory_type: MemoryType, importance: f32) -> Self {
        let now = chrono::Utc::now().timestamp();
        let decay = get_default_decay(&memory_type);
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            content,
            memory_type,
            importance,
            score: importance,
            decay,
            is_active: true,
            marked_inactive_at: None,
            embedding: None,
            source_session_id: None,
            created_at: now,
            last_accessed_at: now,
            access_count: 0,
            metadata: None,
        }
    }

    pub fn with_session_id(mut self, session_id: String) -> Self {
        self.source_session_id = Some(session_id);
        self
    }

    pub fn with_metadata(mut self, metadata: TaskMetadata) -> Self {
        self.metadata = Some(metadata);
        self
    }

    pub fn with_embedding(mut self, embedding: Vec<f32>) -> Self {
        self.embedding = Some(embedding);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedItem {
    pub content: String,
    pub importance: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedTask {
    pub content: String,
    pub status: TaskStatus,
    pub progress: Option<String>,
    pub next_step: Option<String>,
    pub importance: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedMemory {
    pub identity: Vec<ExtractedItem>,
    pub facts: Vec<ExtractedItem>,
    pub preferences: Vec<ExtractedItem>,
    pub tasks: Vec<ExtractedTask>,
    pub constraints: Vec<ExtractedItem>,
    pub skills: Vec<ExtractedItem>,
}

impl Default for ExtractedMemory {
    fn default() -> Self {
        Self {
            identity: Vec::new(),
            facts: Vec::new(),
            preferences: Vec::new(),
            tasks: Vec::new(),
            constraints: Vec::new(),
            skills: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ModelType {
    Local,
    Online,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetrievalOptions {
    #[serde(rename = "topK")]
    pub top_k: usize,
    #[serde(rename = "memoryTypes")]
    pub memory_types: Option<Vec<MemoryType>>,
    #[serde(rename = "minImportance")]
    pub min_importance: Option<f32>,
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    #[serde(rename = "modelType")]
    pub model_type: Option<ModelType>,
}

impl Default for RetrievalOptions {
    fn default() -> Self {
        Self {
            top_k: 10,
            memory_types: None,
            min_importance: None,
            session_id: None,
            model_type: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreComponents {
    pub similarity: f32,
    #[serde(rename = "memoryScore")]
    pub memory_score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetrievedMemory {
    pub item: MemoryItem,
    pub score: f32,
    pub components: ScoreComponents,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStats {
    #[serde(rename = "totalCount")]
    pub total_count: usize,
    #[serde(rename = "byType")]
    pub by_type: std::collections::HashMap<String, usize>,
    #[serde(rename = "avgImportance")]
    pub avg_importance: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecayResult {
    pub processed: usize,
    pub updated: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PruneResult {
    #[serde(rename = "markedInactive")]
    pub marked_inactive: usize,
    pub deleted: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvolutionStats {
    #[serde(rename = "activeCount")]
    pub active_count: usize,
    #[serde(rename = "inactiveCount")]
    pub inactive_count: usize,
    #[serde(rename = "avgScore")]
    pub avg_score: f32,
    #[serde(rename = "avgDecay")]
    pub avg_decay: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CandidateStatus {
    Pending,
    Accepted,
    Rejected,
    Merged,
}

impl CandidateStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            CandidateStatus::Pending => "pending",
            CandidateStatus::Accepted => "accepted",
            CandidateStatus::Rejected => "rejected",
            CandidateStatus::Merged => "merged",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(CandidateStatus::Pending),
            "accepted" => Some(CandidateStatus::Accepted),
            "rejected" => Some(CandidateStatus::Rejected),
            "merged" => Some(CandidateStatus::Merged),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidateMemory {
    pub id: String,
    pub content: String,
    #[serde(rename = "memoryType")]
    pub memory_type: MemoryType,
    pub confidence: f32,
    #[serde(rename = "sourceSessionId")]
    pub source_session_id: String,
    #[serde(rename = "sourceMessageIds")]
    pub source_message_ids: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    pub status: CandidateStatus,
    pub importance: f32,
}

impl CandidateMemory {
    pub fn new(
        content: String,
        memory_type: MemoryType,
        confidence: f32,
        source_session_id: String,
        source_message_ids: Vec<String>,
        importance: f32,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            content,
            memory_type,
            confidence,
            source_session_id,
            source_message_ids,
            created_at: chrono::Utc::now().timestamp(),
            status: CandidateStatus::Pending,
            importance,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractionResult {
    pub candidates: Vec<CandidateMemory>,
    #[serde(rename = "extractionTimeMs")]
    pub extraction_time_ms: u64,
    #[serde(rename = "modelUsed")]
    pub model_used: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractionConfig {
    #[serde(rename = "minMessageCount")]
    pub min_message_count: usize,
    #[serde(rename = "minConversationLength")]
    pub min_conversation_length: usize,
    #[serde(rename = "skipToolCallMessages")]
    pub skip_tool_call_messages: bool,
}

impl Default for ExtractionConfig {
    fn default() -> Self {
        Self {
            min_message_count: 4,
            min_conversation_length: 200,
            skip_tool_call_messages: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    #[serde(rename = "isToolCall")]
    pub is_tool_call: bool,
}
