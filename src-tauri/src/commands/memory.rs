use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::memory::{MemoryStorage, MemoryRetriever, EmbeddingService, MemoryEvolutionManager};
use crate::models::{
    MemoryItem, MemoryType, TaskStatus, RetrievalOptions, RetrievedMemory,
    MemoryStats, DecayResult, PruneResult, EvolutionStats,
};

#[derive(Clone)]
pub struct MemoryState {
    pub storage: Arc<Mutex<MemoryStorage>>,
    pub retriever: Arc<Mutex<MemoryRetriever>>,
    pub embedding: Arc<Mutex<EmbeddingService>>,
    pub evolution: Arc<Mutex<MemoryEvolutionManager>>,
}

impl MemoryState {
    pub fn new(storage: MemoryStorage) -> Self {
        log::info!("[MemoryState] 创建记忆状态实例...");
        let embedding = EmbeddingService::new();
        let retriever = MemoryRetriever::new(storage.clone(), embedding.clone());
        let evolution = MemoryEvolutionManager::new(storage.clone());
        log::info!("[MemoryState] 记忆状态实例创建完成");
        Self {
            storage: Arc::new(Mutex::new(storage)),
            retriever: Arc::new(Mutex::new(retriever)),
            embedding: Arc::new(Mutex::new(embedding)),
            evolution: Arc::new(Mutex::new(evolution)),
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
