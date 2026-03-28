use tauri::{State, AppHandle, Emitter};
use std::sync::Arc;
use std::io::Write;
use tokio::sync::Mutex;
use crate::memory::{
    MemoryStorage, MemoryRetriever, EmbeddingService, EmbeddingConfig, EmbeddingProvider, 
    MemoryEvolutionManager, CandidateStorage, DownloadManager, DownloadProgress, 
    check_model_files_exist, delete_model_files, get_model_dir, cleanup_temp_files,
    get_temp_file_path, DownloadState
};
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
    pub download_manager: Arc<DownloadManager>,
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
        let download_manager = Arc::new(DownloadManager::new());
        
        log::info!("[MemoryState] 记忆状态实例创建完成");
        Self {
            storage: Arc::new(Mutex::new(storage)),
            retriever: Arc::new(Mutex::new(retriever)),
            embedding: Arc::new(Mutex::new(embedding)),
            evolution: Arc::new(Mutex::new(evolution)),
            candidate_storage: Arc::new(Mutex::new(candidate_storage)),
            download_manager,
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

#[tauri::command]
pub async fn check_model_exists(
    model_id: String,
) -> Result<bool, String> {
    Ok(check_model_files_exist(&model_id))
}

#[tauri::command]
pub async fn download_embedding_model(
    model_id: String,
    app: AppHandle,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    let download_manager = state.download_manager.clone();
    
    let config_files = vec!["config.json", "tokenizer.json"];
    let model_files = vec!["model.safetensors", "pytorch_model.bin"];
    
    let model_dir = get_model_dir(&model_id);
    
    // 收集需要下载的配置文件
    let mut config_to_download: Vec<String> = Vec::new();
    for filename in &config_files {
        let file_path = model_dir.join(filename);
        if !file_path.exists() {
            config_to_download.push(filename.to_string());
        }
    }
    
    // 检查模型文件是否已存在
    let mut model_file_exists = false;
    for filename in &model_files {
        let file_path = model_dir.join(filename);
        if file_path.exists() {
            model_file_exists = true;
            break;
        }
    }
    
    // 如果没有模型文件，需要尝试下载
    let need_model_files = !model_file_exists;
    
    if config_to_download.is_empty() && !need_model_files {
        log::info!("[MemoryCommands] 所有文件已存在，无需下载");
        return Ok(());
    }
    
    log::info!("[MemoryCommands] 需要下载的配置文件: {:?}", config_to_download);
    log::info!("[MemoryCommands] 需要下载模型文件: {}", need_model_files);
    
    // 构建客户端，添加更多headers模拟浏览器
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    // 确保模型目录存在
    if !model_dir.exists() {
        std::fs::create_dir_all(&model_dir).map_err(|e| {
            format!("Failed to create model directory: {}", e)
        })?;
        log::info!("[MemoryCommands] 创建模型目录: {:?}", model_dir);
    }
    
    // 启动下载任务（只调用一次）
    let cancel_flag = download_manager.start_download(&model_id, "model").await
        .map_err(|e| e.to_string())?;
    
    let mut downloaded_total: u64 = 0;
    let mut model_file_downloaded = model_file_exists;
    let mut total_size: u64 = 0;
    
    // 获取配置文件大小
    for filename in &config_to_download {
        let url = format!(
            "https://modelscope.cn/models/{}/resolve/master/{}",
            model_id, filename
        );
        
        match client.get(&url).header("Range", "bytes=0-0").send().await {
            Ok(response) => {
                if let Some(content_range) = response.headers().get("content-range") {
                    if let Ok(range_str) = content_range.to_str() {
                        if let Some(total) = range_str.split('/').last() {
                            if let Ok(size) = total.parse::<u64>() {
                                total_size += size;
                                log::info!("[MemoryCommands] 配置文件 {} 大小: {} bytes", filename, size);
                            }
                        }
                    }
                } else if let Some(size) = response.content_length() {
                    total_size += size;
                }
            }
            Err(e) => log::warn!("[MemoryCommands] 无法获取文件 {} 大小: {}", filename, e),
        }
    }
    
    // 获取模型文件大小（尝试两个文件，找到可用的一个）
    let mut available_model_file: Option<String> = None;
    if need_model_files {
        for filename in &model_files {
            let url = format!(
                "https://modelscope.cn/models/{}/resolve/master/{}",
                model_id, filename
            );
            
            match client.get(&url).header("Range", "bytes=0-0").send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        available_model_file = Some(filename.to_string());
                        if let Some(content_range) = response.headers().get("content-range") {
                            if let Ok(range_str) = content_range.to_str() {
                                if let Some(total) = range_str.split('/').last() {
                                    if let Ok(size) = total.parse::<u64>() {
                                        total_size += size;
                                        log::info!("[MemoryCommands] 模型文件 {} 大小: {} bytes", filename, size);
                                    }
                                }
                            }
                        } else if let Some(size) = response.content_length() {
                            total_size += size;
                        }
                        break;
                    }
                }
                Err(e) => log::warn!("[MemoryCommands] 无法获取模型文件 {} 大小: {}", filename, e),
            }
        }
        
        if available_model_file.is_none() {
            download_manager.set_error(&model_id, "No available model file found".to_string()).await;
            download_manager.remove_task(&model_id).await;
            return Err("No available model file found on ModelScope".to_string());
        }
    }
    
    log::info!("[MemoryCommands] 总下载大小: {} bytes ({:.2} MB)", total_size, total_size as f64 / (1024.0 * 1024.0));
    
    // 下载配置文件（必须成功）
    for filename in &config_to_download {
        let file_path = model_dir.join(filename);
        if file_path.exists() {
            log::info!("[MemoryCommands] 文件已存在，跳过: {:?}", file_path);
            continue;
        }
        
        let url = format!(
            "https://modelscope.cn/models/{}/resolve/master/{}",
            model_id, filename
        );
        
        log::info!("[MemoryCommands] 开始下载: {}", url);
        
        let response = match client.get(&url).send().await {
            Ok(r) => r,
            Err(e) => {
                let error = format!("Request failed: {}", e);
                download_manager.set_error(&model_id, error.clone()).await;
                download_manager.remove_task(&model_id).await;
                return Err(error);
            }
        };
        
        if !response.status().is_success() {
            let error = format!("Download failed with status: {}", response.status());
            download_manager.set_error(&model_id, error.clone()).await;
            download_manager.remove_task(&model_id).await;
            return Err(error);
        }
        
        let temp_path = crate::memory::get_temp_file_path(&file_path);
        let mut file = match std::fs::File::create(&temp_path) {
            Ok(f) => f,
            Err(e) => {
                let error = format!("Failed to create temp file: {}", e);
                download_manager.set_error(&model_id, error.clone()).await;
                download_manager.remove_task(&model_id).await;
                return Err(error);
            }
        };
        
        let mut file_downloaded: u64 = 0;
        let mut stream = response.bytes_stream();
        use futures::StreamExt;
        
        while let Some(chunk) = stream.next().await {
            if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                let _ = file.flush();
                drop(file);
                let _ = std::fs::remove_file(&temp_path);
                download_manager.remove_task(&model_id).await;
                return Err("Download cancelled".to_string());
            }
            
            let pause_flag = download_manager.get_pause_flag(&model_id).await;
            if let Some(flag) = pause_flag {
                while flag.load(std::sync::atomic::Ordering::SeqCst) {
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                        let _ = file.flush();
                        drop(file);
                        let _ = std::fs::remove_file(&temp_path);
                        download_manager.remove_task(&model_id).await;
                        return Err("Download cancelled".to_string());
                    }
                }
            }
            
            let chunk = match chunk {
                Ok(c) => c,
                Err(e) => {
                    let error = format!("Failed to read chunk: {}", e);
                    download_manager.set_error(&model_id, error.clone()).await;
                    download_manager.remove_task(&model_id).await;
                    return Err(error);
                }
            };
            
            if let Err(e) = file.write_all(&chunk) {
                let error = format!("Failed to write chunk: {}", e);
                download_manager.set_error(&model_id, error.clone()).await;
                download_manager.remove_task(&model_id).await;
                return Err(error);
            }
            
            file_downloaded += chunk.len() as u64;
            let overall_downloaded = downloaded_total + file_downloaded;
            
            if let Some(progress) = download_manager.update_overall_progress(
                &model_id, 
                overall_downloaded, 
                total_size,
                filename
            ).await {
                let _ = app.emit("embedding-download-progress", &progress);
            }
        }
        
        let _ = file.flush();
        drop(file);
        
        if let Err(e) = std::fs::rename(&temp_path, &file_path) {
            let error = format!("Failed to rename temp file: {}", e);
            download_manager.set_error(&model_id, error.clone()).await;
            download_manager.remove_task(&model_id).await;
            return Err(error);
        }
        
        downloaded_total += file_downloaded;
        log::info!("[MemoryCommands] 文件下载完成: {}", filename);
    }
    
    // 下载模型文件（只需要成功一个）
    if let Some(filename) = &available_model_file {
        let file_path = model_dir.join(filename);
        if !file_path.exists() {
            let url = format!(
                "https://modelscope.cn/models/{}/resolve/master/{}",
                model_id, filename
            );
            
            log::info!("[MemoryCommands] 开始下载模型文件: {}", url);
            
            let response = match client.get(&url).send().await {
                Ok(r) => r,
                Err(e) => {
                    let error = format!("Request failed: {}", e);
                    download_manager.set_error(&model_id, error.clone()).await;
                    download_manager.remove_task(&model_id).await;
                    return Err(error);
                }
            };
            
            if !response.status().is_success() {
                let error = format!("Download failed with status: {}", response.status());
                download_manager.set_error(&model_id, error.clone()).await;
                download_manager.remove_task(&model_id).await;
                return Err(error);
            }
            
            let actual_size = response.content_length().unwrap_or(0);
            let mut total_size_clone = total_size;
            if total_size_clone == 0 && actual_size > 0 {
                total_size_clone = actual_size;
                log::info!("[MemoryCommands] 从响应获取文件大小: {} bytes", actual_size);
            }
            
            let temp_path = crate::memory::get_temp_file_path(&file_path);
            let mut file = match std::fs::File::create(&temp_path) {
                Ok(f) => f,
                Err(e) => {
                    let error = format!("Failed to create temp file: {}", e);
                    download_manager.set_error(&model_id, error.clone()).await;
                    download_manager.remove_task(&model_id).await;
                    return Err(error);
                }
            };
            
            let mut file_downloaded: u64 = 0;
            let mut stream = response.bytes_stream();
            use futures::StreamExt;
            
            while let Some(chunk) = stream.next().await {
                if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                    let _ = file.flush();
                    drop(file);
                    let _ = std::fs::remove_file(&temp_path);
                    download_manager.remove_task(&model_id).await;
                    return Err("Download cancelled".to_string());
                }
                
                let pause_flag = download_manager.get_pause_flag(&model_id).await;
                if let Some(flag) = pause_flag {
                    while flag.load(std::sync::atomic::Ordering::SeqCst) {
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                        if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                            let _ = file.flush();
                            drop(file);
                            let _ = std::fs::remove_file(&temp_path);
                            download_manager.remove_task(&model_id).await;
                            return Err("Download cancelled".to_string());
                        }
                    }
                }
                
                let chunk = match chunk {
                    Ok(c) => c,
                    Err(e) => {
                        let error = format!("Failed to read chunk: {}", e);
                        download_manager.set_error(&model_id, error.clone()).await;
                        download_manager.remove_task(&model_id).await;
                        return Err(error);
                    }
                };
                
                if let Err(e) = file.write_all(&chunk) {
                    let error = format!("Failed to write chunk: {}", e);
                    download_manager.set_error(&model_id, error.clone()).await;
                    download_manager.remove_task(&model_id).await;
                    return Err(error);
                }
                
                file_downloaded += chunk.len() as u64;
                let overall_downloaded = downloaded_total + file_downloaded;
                
                if let Some(progress) = download_manager.update_overall_progress(
                    &model_id, 
                    overall_downloaded, 
                    total_size_clone,
                    filename
                ).await {
                    let _ = app.emit("embedding-download-progress", &progress);
                }
            }
            
            let _ = file.flush();
            drop(file);
            
            if let Err(e) = std::fs::rename(&temp_path, &file_path) {
                let error = format!("Failed to rename temp file: {}", e);
                download_manager.set_error(&model_id, error.clone()).await;
                download_manager.remove_task(&model_id).await;
                return Err(error);
            }
            
            downloaded_total += file_downloaded;
            model_file_downloaded = true;
            log::info!("[MemoryCommands] 模型文件下载完成: {}", filename);
        }
    }
    
    download_manager.set_state(&model_id, crate::memory::DownloadState::Completed).await;
    download_manager.remove_task(&model_id).await;
    
    if model_file_downloaded {
        log::info!("[MemoryCommands] 模型 {} 下载完成", model_id);
        Ok(())
    } else {
        Err("Failed to download model files".to_string())
    }
}

#[tauri::command]
pub async fn pause_embedding_download(
    model_id: String,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    state.download_manager.pause_download(&model_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_embedding_download(
    model_id: String,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    state.download_manager.resume_download(&model_id).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn cancel_embedding_download(
    model_id: String,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    state.download_manager.cancel_download(&model_id).await.map_err(|e| e.to_string())?;
    cleanup_temp_files(&model_id);
    Ok(())
}

#[tauri::command]
pub async fn get_download_progress(
    model_id: String,
    state: State<'_, MemoryState>,
) -> Result<Option<DownloadProgress>, String> {
    Ok(state.download_manager.get_progress(&model_id).await)
}

#[tauri::command]
pub async fn open_model_folder(
    model_id: String,
) -> Result<(), String> {
    let model_dir = get_model_dir(&model_id);
    
    if !model_dir.exists() {
        return Err("Model folder does not exist".to_string());
    }
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&model_dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&model_dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&model_dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    
    log::info!("[MemoryCommands] 打开模型文件夹: {:?}", model_dir);
    Ok(())
}

#[tauri::command]
pub async fn delete_embedding_model(
    model_id: String,
) -> Result<(), String> {
    delete_model_files(&model_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn verify_model_integrity(
    model_id: String,
) -> Result<bool, String> {
    let model_dir = get_model_dir(&model_id);
    
    let config_path = model_dir.join("config.json");
    let tokenizer_path = model_dir.join("tokenizer.json");
    let model_path = model_dir.join("model.safetensors");
    let alt_model_path = model_dir.join("pytorch_model.bin");
    
    let config_ok = config_path.exists() && config_path.metadata().map(|m| m.len() > 0).unwrap_or(false);
    let tokenizer_ok = tokenizer_path.exists() && tokenizer_path.metadata().map(|m| m.len() > 0).unwrap_or(false);
    let model_ok = (model_path.exists() && model_path.metadata().map(|m| m.len() > 0).unwrap_or(false))
        || (alt_model_path.exists() && alt_model_path.metadata().map(|m| m.len() > 0).unwrap_or(false));
    
    Ok(config_ok && tokenizer_ok && model_ok)
}

#[tauri::command]
pub async fn get_model_folder_path(
    model_id: String,
) -> Result<String, String> {
    let model_dir = get_model_dir(&model_id);
    Ok(model_dir.to_string_lossy().to_string())
}
