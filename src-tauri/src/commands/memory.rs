use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::memory::{MemoryStorage, MemoryRetriever, EmbeddingService, EmbeddingConfig, EmbeddingProvider, MemoryEvolutionManager, CandidateStorage};
use crate::models::{
    MemoryItem, MemoryType, TaskStatus, RetrievalOptions, RetrievedMemory,
    MemoryStats, DecayResult, PruneResult, EvolutionStats,
    CandidateMemory, CandidateStatus, ExtractionResult, ExtractionConfig, ConversationMessage,
    DedupDecision, PipelineResult, EvolutionResult,
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
        
        let embedding = match EmbeddingService::with_config(EmbeddingConfig::default()) {
            Ok(service) => {
                log::info!("[MemoryState] Embedding 服务创建成功, provider: {:?}", service.get_provider());
                service
            }
            Err(e) => {
                log::warn!("[MemoryState] Embedding 服务创建失败，使用 dummy 模式: {}", e);
                EmbeddingService::new()
            }
        };
        
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

#[tauri::command]
pub async fn get_embedding_provider(
    state: State<'_, MemoryState>,
) -> Result<String, String> {
    let embedding = state.embedding.lock().await;
    match embedding.get_provider() {
        EmbeddingProvider::Dummy => Ok("dummy".to_string()),
        EmbeddingProvider::Local { model_id } => Ok(format!("local:{}", model_id)),
    }
}

#[tauri::command]
pub async fn recompute_all_embeddings(
    state: State<'_, MemoryState>,
) -> Result<usize, String> {
    let storage = state.storage.lock().await;
    let embedding = state.embedding.lock().await;
    
    let memories = storage.get_all_memories().await.map_err(|e| e.to_string())?;
    let mut updated = 0;
    
    for memory in memories {
        let emb = embedding.embed(&memory.content).await.map_err(|e| e.to_string())?;
        storage.update_embedding(&memory.id, &emb).await.map_err(|e| e.to_string())?;
        updated += 1;
    }
    
    log::info!("[MemoryCommands] 重新计算所有向量: {} 条", updated);
    Ok(updated)
}

#[tauri::command]
pub async fn get_stored_embedding_dimension(
    state: State<'_, MemoryState>,
) -> Result<Option<usize>, String> {
    let storage = state.storage.lock().await;
    storage.get_embedding_dimension().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_all_embeddings(
    state: State<'_, MemoryState>,
) -> Result<usize, String> {
    let storage = state.storage.lock().await;
    let count = storage.clear_all_embeddings().await.map_err(|e| e.to_string())?;
    log::info!("[MemoryCommands] 清除所有向量: {} 条", count);
    Ok(count)
}

#[tauri::command]
pub fn get_available_embedding_models() -> Vec<(String, String, usize)> {
    crate::memory::get_available_models()
        .into_iter()
        .map(|(id, name, dim)| (id.to_string(), name.to_string(), dim))
        .collect()
}

#[tauri::command]
pub async fn initialize_embedding_with_model(
    model_id: String,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    let mut embedding = state.embedding.lock().await;
    
    let embedding_dim = get_model_dimension(&model_id);
    let config = crate::memory::EmbeddingConfig {
        provider: crate::memory::EmbeddingProvider::Local { model_id },
        embedding_dim,
        max_seq_length: 256,
    };
    
    match crate::memory::EmbeddingService::with_config(config) {
        Ok(service) => {
            *embedding = service;
            log::info!("[MemoryCommands] Embedding 服务初始化成功");
            Ok(())
        }
        Err(e) => {
            log::error!("[MemoryCommands] Embedding 服务初始化失败: {}", e);
            Err(e.to_string())
        }
    }
}

fn get_model_dimension(model_id: &str) -> usize {
    let models = crate::memory::get_available_models();
    for (id, _, dim) in models {
        if id == model_id {
            return dim;
        }
    }
    384
}

#[tauri::command]
pub async fn dedup_candidate(
    id: String,
    state: State<'_, MemoryState>,
) -> Result<DedupDecision, String> {
    let candidate_storage = state.candidate_storage.lock().await;
    let retriever = state.retriever.lock().await;
    let embedding = state.embedding.lock().await;
    let storage = state.storage.lock().await;
    
    let candidate = candidate_storage.get_candidate(&id).map_err(|e| e.to_string())?;
    
    let llm_client = crate::memory::LlmClient::from_env();
    let conflict_detector = crate::memory::ConflictDetector::new(llm_client.clone());
    let merge_retriever = (*retriever).clone();
    let merge_embedding = (*embedding).clone();
    let merge_service = crate::memory::MergeService::new(llm_client, merge_embedding, merge_retriever);
    
    let dedup_service = crate::memory::DeduplicationService::new(
        (*retriever).clone(),
        (*embedding).clone(),
        (*storage).clone(),
        conflict_detector,
        merge_service,
    );
    
    dedup_service.dedup_candidate(&candidate).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn dedup_accept(
    id: String,
    state: State<'_, MemoryState>,
) -> Result<DedupDecision, String> {
    let candidate_storage = state.candidate_storage.lock().await;
    let retriever = state.retriever.lock().await;
    let embedding = state.embedding.lock().await;
    let storage = state.storage.lock().await;
    
    let candidate = candidate_storage.get_candidate(&id).map_err(|e| e.to_string())?;
    
    let llm_client = crate::memory::LlmClient::from_env();
    let conflict_detector = crate::memory::ConflictDetector::new(llm_client.clone());
    let merge_retriever = (*retriever).clone();
    let merge_embedding = (*embedding).clone();
    let merge_service = crate::memory::MergeService::new(llm_client, merge_embedding, merge_retriever);
    
    let dedup_service = crate::memory::DeduplicationService::new(
        (*retriever).clone(),
        (*embedding).clone(),
        (*storage).clone(),
        conflict_detector,
        merge_service,
    );
    
    dedup_service.dedup_accept(&candidate).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn execute_dedup_pipeline(
    id: String,
    decision: DedupDecision,
    state: State<'_, MemoryState>,
) -> Result<PipelineResult, String> {
    let candidate_storage = state.candidate_storage.lock().await;
    let retriever = state.retriever.lock().await;
    let embedding = state.embedding.lock().await;
    let storage = state.storage.lock().await;
    
    let candidate = candidate_storage.get_candidate(&id).map_err(|e| e.to_string())?;
    
    let llm_client = crate::memory::LlmClient::from_env();
    let conflict_detector = crate::memory::ConflictDetector::new(llm_client.clone());
    let merge_retriever = (*retriever).clone();
    let merge_embedding = (*embedding).clone();
    let merge_service = crate::memory::MergeService::new(llm_client, merge_embedding, merge_retriever);
    
    let dedup_service = crate::memory::DeduplicationService::new(
        (*retriever).clone(),
        (*embedding).clone(),
        (*storage).clone(),
        conflict_detector,
        merge_service,
    );
    
    dedup_service.execute_pipeline(&candidate, decision).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn run_memory_evolution(
    state: State<'_, MemoryState>,
) -> Result<EvolutionResult, String> {
    let evolution = state.evolution.lock().await;
    evolution.run_full_evolution().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_embedding(
    content: String,
    state: State<'_, MemoryState>,
) -> Result<Vec<f32>, String> {
    let embedding = state.embedding.lock().await;
    embedding.embed(&content).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_similar_memories(
    embedding: Vec<f32>,
    top_k: usize,
    state: State<'_, MemoryState>,
) -> Result<Vec<RetrievedMemory>, String> {
    let storage = state.storage.lock().await;
    
    let memories = storage.get_all_memories().await.map_err(|e| e.to_string())?;
    
    let mut scored: Vec<(f32, MemoryItem)> = memories
        .into_iter()
        .filter_map(|item| {
            let item_embedding = item.embedding.as_ref()?;
            let similarity = crate::memory::cosine_similarity(&embedding, item_embedding);
            Some((similarity, item))
        })
        .collect();
    
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);
    
    Ok(scored
        .into_iter()
        .map(|(similarity, item)| {
            let memory_score = item.score;
            RetrievedMemory {
                item,
                score: similarity,
                components: crate::models::ScoreComponents {
                    similarity,
                    memory_score,
                },
            }
        })
        .collect())
}

#[tauri::command]
pub async fn boost_memory(
    id: String,
    amount: f32,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    let storage = state.storage.lock().await;
    storage.reinforce_memory(&id, amount).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_memory(
    id: String,
    updates: serde_json::Value,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    let storage = state.storage.lock().await;
    
    if let Some(content) = updates.get("content").and_then(|v| v.as_str()) {
        storage.update_memory_content(&id, content).await.map_err(|e| e.to_string())?;
    }
    
    if let Some(importance) = updates.get("importance").and_then(|v| v.as_f64()) {
        storage.update_memory_importance(&id, importance as f32).await.map_err(|e| e.to_string())?;
    }
    
    Ok(())
}
