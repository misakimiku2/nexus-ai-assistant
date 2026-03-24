use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::memory::{MemoryStorage, MemoryRetriever, EmbeddingService, MemoryEvolutionManager, CandidateStorage};
use crate::models::{
    MemoryItem, MemoryType, TaskStatus, RetrievalOptions, RetrievedMemory,
    MemoryStats, DecayResult, PruneResult, EvolutionStats,
    CandidateMemory, CandidateStatus, ExtractionResult, ExtractionConfig, ConversationMessage,
};

#[derive(Clone)]
pub struct MemoryState {
    pub storage: Arc<Mutex<MemoryStorage>>,
    pub retriever: Arc<Mutex<MemoryRetriever>>,
    pub embedding: Arc<Mutex<EmbeddingService>>,
    pub evolution: Arc<Mutex<MemoryEvolutionManager>>,
    pub candidate_storage: Arc<Mutex<CandidateStorage>>,
}

impl MemoryState {
    pub fn new(storage: MemoryStorage, db_path: std::path::PathBuf) -> Self {
        log::info!("[MemoryState] 创建记忆状态实例...");
        let embedding = EmbeddingService::new();
        let retriever = MemoryRetriever::new(storage.clone(), embedding.clone());
        let evolution = MemoryEvolutionManager::new(storage.clone());
        
        let candidate_storage = CandidateStorage::new(db_path).expect("Failed to initialize candidate storage");
        
        log::info!("[MemoryState] 记忆状态实例创建完成");
        Self {
            storage: Arc::new(Mutex::new(storage)),
            retriever: Arc::new(Mutex::new(retriever)),
            embedding: Arc::new(Mutex::new(embedding)),
            evolution: Arc::new(Mutex::new(evolution)),
            candidate_storage: Arc::new(Mutex::new(candidate_storage)),
        }
    }
}

#[tauri::command]
pub async fn retrieve_memories(
    query: String,
    options: RetrievalOptions,
    state: State<'_, MemoryState>,
) -> Result<Vec<RetrievedMemory>, String> {
    let retriever = state.retriever.lock().await;
    retriever.retrieve(&query, options).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_memory(
    item: MemoryItem,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    let storage = state.storage.lock().await;
    let embedding = state.embedding.lock().await;
    
    let mut item = item;
    if item.embedding.is_none() {
        let emb = embedding.embed(&item.content).await.map_err(|e| e.to_string())?;
        item.embedding = Some(emb);
    }
    
    storage.add_memory(item).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_memories(
    state: State<'_, MemoryState>,
) -> Result<Vec<MemoryItem>, String> {
    let storage = state.storage.lock().await;
    storage.get_all_memories().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_memories_by_type(
    memory_type: MemoryType,
    state: State<'_, MemoryState>,
) -> Result<Vec<MemoryItem>, String> {
    let storage = state.storage.lock().await;
    storage.get_memories_by_type(memory_type).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_task_status(
    id: String,
    status: TaskStatus,
    progress: Option<String>,
    next_step: Option<String>,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    let storage = state.storage.lock().await;
    storage.update_task_status(&id, status, progress, next_step).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_memory(
    id: String,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    let storage = state.storage.lock().await;
    storage.delete_memory(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn prune_memories(
    state: State<'_, MemoryState>,
) -> Result<usize, String> {
    let storage = state.storage.lock().await;
    storage.prune_memories().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_memory_stats(
    state: State<'_, MemoryState>,
) -> Result<MemoryStats, String> {
    let storage = state.storage.lock().await;
    storage.get_stats().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn initialize_embedding_service(
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    let mut embedding = state.embedding.lock().await;
    embedding.initialize().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_embedding_dimension(
    state: State<'_, MemoryState>,
) -> Result<usize, String> {
    let embedding = state.embedding.lock().await;
    Ok(embedding.get_embedding_dim())
}

#[tauri::command]
pub async fn reinforce_memories(
    ids: Vec<String>,
    state: State<'_, MemoryState>,
) -> Result<usize, String> {
    let evolution = state.evolution.lock().await;
    evolution.reinforce(&ids).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn decay_memories(
    state: State<'_, MemoryState>,
) -> Result<DecayResult, String> {
    let evolution = state.evolution.lock().await;
    evolution.decay_all().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn prune_memories_v2(
    state: State<'_, MemoryState>,
) -> Result<PruneResult, String> {
    let evolution = state.evolution.lock().await;
    evolution.prune().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn run_evolution_cycle(
    state: State<'_, MemoryState>,
) -> Result<(DecayResult, PruneResult), String> {
    let evolution = state.evolution.lock().await;
    evolution.run_evolution_cycle().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_evolution_stats(
    state: State<'_, MemoryState>,
) -> Result<EvolutionStats, String> {
    let storage = state.storage.lock().await;
    storage.get_evolution_stats().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn should_extract_memories(
    messages: Vec<ConversationMessage>,
    config: ExtractionConfig,
) -> Result<bool, String> {
    Ok(crate::memory::should_extract(&messages, &config))
}

#[tauri::command]
pub async fn get_pending_candidates(
    state: State<'_, MemoryState>,
) -> Result<Vec<CandidateMemory>, String> {
    let candidate_storage = state.candidate_storage.lock().await;
    candidate_storage.get_pending_candidates().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn accept_candidate(
    id: String,
    state: State<'_, MemoryState>,
) -> Result<MemoryItem, String> {
    let candidate_storage = state.candidate_storage.lock().await;
    let storage = state.storage.lock().await;
    let embedding = state.embedding.lock().await;
    
    let candidate = candidate_storage.get_candidate(&id).map_err(|e| e.to_string())?;
    
    let existing = storage.get_all_memories().await.map_err(|e| e.to_string())?;
    if let Some(_duplicate_id) = crate::memory::check_duplicate_simple(&candidate.content, &existing) {
        candidate_storage.update_status(&id, CandidateStatus::Rejected).map_err(|e| e.to_string())?;
        return Err("Candidate is duplicate, rejected".to_string());
    }
    
    let mut memory_item = CandidateStorage::candidate_to_memory_item(candidate);
    let emb = embedding.embed(&memory_item.content).await.map_err(|e| e.to_string())?;
    memory_item.embedding = Some(emb);
    
    storage.add_memory(memory_item.clone()).await.map_err(|e| e.to_string())?;
    
    candidate_storage.update_status(&id, CandidateStatus::Accepted).map_err(|e| e.to_string())?;
    
    log::info!("[MemoryCommands] 候选记忆已接受: {} -> {}", id, memory_item.id);
    Ok(memory_item)
}

#[tauri::command]
pub async fn reject_candidate(
    id: String,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    let candidate_storage = state.candidate_storage.lock().await;
    candidate_storage.update_status(&id, CandidateStatus::Rejected).map_err(|e| e.to_string())?;
    log::info!("[MemoryCommands] 候选记忆已拒绝: {}", id);
    Ok(())
}

#[tauri::command]
pub async fn accept_all_candidates(
    state: State<'_, MemoryState>,
) -> Result<Vec<MemoryItem>, String> {
    let candidate_storage = state.candidate_storage.lock().await;
    let storage = state.storage.lock().await;
    let embedding = state.embedding.lock().await;
    
    let candidates = candidate_storage.get_pending_candidates().map_err(|e| e.to_string())?;
    let mut existing = storage.get_all_memories().await.map_err(|e| e.to_string())?;
    
    let mut accepted = Vec::new();
    
    for candidate in candidates {
        if crate::memory::check_duplicate_simple(&candidate.content, &existing).is_some() {
            log::info!("[MemoryCommands] 候选记忆重复，跳过: {}", candidate.content.chars().take(30).collect::<String>());
            candidate_storage.update_status(&candidate.id, CandidateStatus::Rejected).map_err(|e| e.to_string())?;
            continue;
        }
        
        let mut memory_item = CandidateStorage::candidate_to_memory_item(candidate.clone());
        let emb = embedding.embed(&memory_item.content).await.map_err(|e| e.to_string())?;
        memory_item.embedding = Some(emb);
        
        storage.add_memory(memory_item.clone()).await.map_err(|e| e.to_string())?;
        candidate_storage.update_status(&candidate.id, CandidateStatus::Accepted).map_err(|e| e.to_string())?;
        
        existing.push(memory_item.clone());
        accepted.push(memory_item);
    }
    
    log::info!("[MemoryCommands] 批量接受候选记忆: {} 条", accepted.len());
    Ok(accepted)
}

#[tauri::command]
pub async fn add_candidate_memory(
    candidate: CandidateMemory,
    state: State<'_, MemoryState>,
) -> Result<String, String> {
    let candidate_storage = state.candidate_storage.lock().await;
    let id = candidate_storage.add_candidate(candidate).map_err(|e| e.to_string())?;
    log::info!("[MemoryCommands] 添加候选记忆: {}", id);
    Ok(id)
}

#[tauri::command]
pub async fn clear_old_candidates(
    max_age_hours: i64,
    state: State<'_, MemoryState>,
) -> Result<usize, String> {
    let candidate_storage = state.candidate_storage.lock().await;
    let count = candidate_storage.clear_old_candidates(max_age_hours).map_err(|e| e.to_string())?;
    log::info!("[MemoryCommands] 清理旧候选记忆: {} 条", count);
    Ok(count)
}
