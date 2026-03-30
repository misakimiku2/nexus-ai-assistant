use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MemoryType {
    Identity,
    Preference,
    Constraint,
    Fact,
}

impl MemoryType {
    pub fn as_str(&self) -> &'static str {
        match self {
            MemoryType::Identity => "identity",
            MemoryType::Preference => "preference",
            MemoryType::Constraint => "constraint",
            MemoryType::Fact => "fact",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "identity" => Some(MemoryType::Identity),
            "preference" => Some(MemoryType::Preference),
            "constraint" => Some(MemoryType::Constraint),
            "fact" => Some(MemoryType::Fact),
            _ => None,
        }
    }
}

pub fn get_default_decay(memory_type: &MemoryType) -> f32 {
    match memory_type {
        MemoryType::Identity => 0.001,
        MemoryType::Constraint => 0.003,
        MemoryType::Preference => 0.005,
        MemoryType::Fact => 0.01,
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
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
    #[serde(rename = "lastAccessedAt")]
    pub last_accessed_at: i64,
    #[serde(rename = "accessCount")]
    pub access_count: i32,
    pub metadata: Option<TaskMetadata>,
    pub version: i32,
    #[serde(rename = "parentIds")]
    pub parent_ids: Vec<String>,
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
            updated_at: now,
            last_accessed_at: now,
            access_count: 0,
            metadata: None,
            version: 1,
            parent_ids: Vec::new(),
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
pub struct ExtractedMemory {
    pub identity: Vec<ExtractedItem>,
    pub facts: Vec<ExtractedItem>,
    pub preferences: Vec<ExtractedItem>,
    pub constraints: Vec<ExtractedItem>,
}

impl Default for ExtractedMemory {
    fn default() -> Self {
        Self {
            identity: Vec::new(),
            facts: Vec::new(),
            preferences: Vec::new(),
            constraints: Vec::new(),
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
    #[serde(rename = "minSimilarity")]
    pub min_similarity: f32,
    #[serde(rename = "onlyActive")]
    pub only_active: bool,
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
            min_importance: Some(0.3),
            min_similarity: 0.3,
            only_active: true,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DedupStage {
    Candidate,
    Accept,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConflictType {
    Preference,
    Fact,
    Status,
}

impl ConflictType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ConflictType::Preference => "preference",
            ConflictType::Fact => "fact",
            ConflictType::Status => "status",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "preference" => Some(ConflictType::Preference),
            "fact" => Some(ConflictType::Fact),
            "status" => Some(ConflictType::Status),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoostTarget {
    #[serde(rename = "memoryId")]
    pub memory_id: String,
    pub similarity: f32,
    #[serde(rename = "boostAmount")]
    pub boost_amount: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeTarget {
    #[serde(rename = "memoryId")]
    pub memory_id: String,
    pub similarity: f32,
    #[serde(rename = "memoryType")]
    pub memory_type: MemoryType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictTarget {
    #[serde(rename = "memoryId")]
    pub memory_id: String,
    pub similarity: f32,
    #[serde(rename = "conflictType")]
    pub conflict_type: ConflictType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarMemory {
    pub memory: MemoryItem,
    pub similarity: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DedupDecision {
    #[serde(rename = "boostTargets")]
    pub boost_targets: Vec<BoostTarget>,
    #[serde(rename = "mergeTargets")]
    pub merge_targets: Vec<MergeTarget>,
    #[serde(rename = "conflictTargets")]
    pub conflict_targets: Vec<ConflictTarget>,
    #[serde(rename = "similarMemories")]
    pub similar_memories: Vec<SimilarMemory>,
    #[serde(rename = "maxSimilarity")]
    pub max_similarity: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiSourceMergeRequest {
    #[serde(rename = "existingMemories")]
    pub existing_memories: Vec<MemoryItem>,
    pub candidate: CandidateMemory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    #[serde(rename = "mergedContent")]
    pub merged_content: String,
    #[serde(rename = "mergedImportance")]
    pub merged_importance: f32,
    #[serde(rename = "mergeReason")]
    pub merge_reason: String,
    #[serde(rename = "isFallback")]
    pub is_fallback: bool,
    #[serde(rename = "parentIds")]
    pub parent_ids: Vec<String>,
    pub merged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictResolveRequest {
    pub existing: MemoryItem,
    pub candidate: CandidateMemory,
    #[serde(rename = "conflictType")]
    pub conflict_type: ConflictType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictResolveResult {
    #[serde(rename = "resolvedContent")]
    pub resolved_content: String,
    #[serde(rename = "resolvedImportance")]
    pub resolved_importance: f32,
    #[serde(rename = "resolveReason")]
    pub resolve_reason: String,
    #[serde(rename = "parentId")]
    pub parent_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvergenceConfig {
    #[serde(rename = "maxMergeRounds")]
    pub max_merge_rounds: usize,
    #[serde(rename = "convergenceThreshold")]
    pub convergence_threshold: f32,
    #[serde(rename = "contentStabilityThreshold")]
    pub content_stability_threshold: f32,
}

impl Default for ConvergenceConfig {
    fn default() -> Self {
        Self {
            max_merge_rounds: 3,
            convergence_threshold: 0.85,
            content_stability_threshold: 0.95,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictDetectionConfig {
    #[serde(rename = "minSimilarity")]
    pub min_similarity: f32,
    #[serde(rename = "maxCandidates")]
    pub max_candidates: usize,
}

impl Default for ConflictDetectionConfig {
    fn default() -> Self {
        Self {
            min_similarity: 0.80,
            max_candidates: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecencyConfig {
    #[serde(rename = "halfLifeDays")]
    pub half_life_days: f32,
}

impl Default for RecencyConfig {
    fn default() -> Self {
        Self {
            half_life_days: 30.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeletionConfig {
    #[serde(rename = "minImportance")]
    pub min_importance: f32,
    #[serde(rename = "maxInactiveDays")]
    pub max_inactive_days: i64,
}

impl Default for DeletionConfig {
    fn default() -> Self {
        Self {
            min_importance: 0.2,
            max_inactive_days: 30,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoostConfig {
    #[serde(rename = "decayFactor")]
    pub decay_factor: f32,
    #[serde(rename = "boostAmount")]
    pub boost_amount: f32,
    #[serde(rename = "maxImportance")]
    pub max_importance: f32,
}

impl Default for BoostConfig {
    fn default() -> Self {
        Self {
            decay_factor: 0.95,
            boost_amount: 0.1,
            max_importance: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PipelineResult {
    #[serde(rename = "conflictsResolved")]
    pub conflicts_resolved: Vec<ConflictResolveResult>,
    pub merged: Option<MergeResult>,
    pub boosted: Vec<MemoryItem>,
    pub accepted: Option<MemoryItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeactivationResult {
    #[serde(rename = "deactivatedCount")]
    pub deactivated_count: usize,
    #[serde(rename = "deactivatedIds")]
    pub deactivated_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvolutionResult {
    pub decay: DecayResult,
    pub deactivation: DeactivationResult,
    pub prune: PruneResult,
}
