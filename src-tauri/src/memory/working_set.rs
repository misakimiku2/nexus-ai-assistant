use std::collections::HashMap;
use crate::models::{
    MemoryItem, CandidateMemory, ConflictTarget, BoostTarget, 
    BoostConfig, ConflictResolveResult,
};
use crate::memory::embedding::EmbeddingService;
use crate::memory::storage::MemoryStorage;
use crate::memory::conflict::ConflictDetector;
use crate::models::{ConflictResolveRequest, MultiSourceMergeRequest, MergeResult};

#[derive(Clone)]
pub struct WorkingMemory {
    pub memory: MemoryItem,
    pub is_modified: bool,
    pub is_deleted: bool,
}

pub struct WorkingSet {
    pub memories: HashMap<String, WorkingMemory>,
    embedding: EmbeddingService,
    boost_config: BoostConfig,
}

impl Clone for WorkingSet {
    fn clone(&self) -> Self {
        Self {
            memories: self.memories.clone(),
            embedding: self.embedding.clone(),
            boost_config: self.boost_config.clone(),
        }
    }
}

impl WorkingSet {
    pub fn new(embedding: EmbeddingService) -> Self {
        Self {
            memories: HashMap::new(),
            embedding,
            boost_config: BoostConfig::default(),
        }
    }

    pub fn with_config(embedding: EmbeddingService, boost_config: BoostConfig) -> Self {
        Self {
            memories: HashMap::new(),
            embedding,
            boost_config,
        }
    }

    pub async fn load_from_storage(&mut self, storage: &MemoryStorage, memory_ids: &[String]) -> Result<(), Box<dyn std::error::Error>> {
        let memories = storage.get_memories_by_ids(memory_ids).await?;
        
        for memory in memories {
            self.memories.insert(memory.id.clone(), WorkingMemory {
                memory,
                is_modified: false,
                is_deleted: false,
            });
        }
        
        log::info!("[WorkingSet] 加载 {} 条记忆到工作集（按 ID 加载）", self.memories.len());
        Ok(())
    }

    pub fn get_memory(&self, id: &str) -> Option<&MemoryItem> {
        self.memories.get(id).map(|wm| &wm.memory)
    }

    pub fn get_memory_mut(&mut self, id: &str) -> Option<&mut MemoryItem> {
        self.memories.get_mut(id).map(|wm| {
            wm.is_modified = true;
            &mut wm.memory
        })
    }

    pub fn add_memory(&mut self, memory: MemoryItem) {
        self.memories.insert(memory.id.clone(), WorkingMemory {
            memory,
            is_modified: true,
            is_deleted: false,
        });
    }

    pub fn mark_deleted(&mut self, id: &str) {
        if let Some(wm) = self.memories.get_mut(id) {
            wm.is_deleted = true;
            wm.is_modified = true;
        }
    }

    pub fn get_all_active(&self) -> Vec<&MemoryItem> {
        self.memories.values()
            .filter(|wm| !wm.is_deleted && wm.memory.is_active)
            .map(|wm| &wm.memory)
            .collect()
    }

    pub fn get_modified(&self) -> Vec<&MemoryItem> {
        self.memories.values()
            .filter(|wm| wm.is_modified && !wm.is_deleted)
            .map(|wm| &wm.memory)
            .collect()
    }

    pub fn get_deleted_ids(&self) -> Vec<String> {
        self.memories.values()
            .filter(|wm| wm.is_deleted)
            .map(|wm| wm.memory.id.clone())
            .collect()
    }

    pub async fn resolve_conflicts(
        &mut self,
        candidate: &CandidateMemory,
        conflict_targets: &[ConflictTarget],
        conflict_detector: &ConflictDetector,
    ) -> Result<Vec<ConflictResolveResult>, Box<dyn std::error::Error>> {
        let mut results = Vec::new();
        
        for target in conflict_targets {
            let existing = self.get_memory(&target.memory_id)
                .ok_or("Memory not found in working set")?
                .clone();
            
            let request = ConflictResolveRequest {
                existing: existing.clone(),
                candidate: candidate.clone(),
                conflict_type: target.conflict_type.clone(),
            };
            
            let resolved = conflict_detector.resolve_conflict(request).await?;
            
            let new_content = resolved.resolved_content.clone();
            let new_importance = resolved.resolved_importance;
            
            let emb = self.embedding.embed(&new_content).await?;
            
            if let Some(memory) = self.get_memory_mut(&target.memory_id) {
                memory.content = new_content;
                memory.importance = new_importance;
                memory.score = new_importance;
                memory.version += 1;
                memory.updated_at = chrono::Utc::now().timestamp();
                memory.last_accessed_at = chrono::Utc::now().timestamp();
                memory.embedding = Some(emb);
            }
            
            results.push(ConflictResolveResult {
                resolved_content: resolved.resolved_content,
                resolved_importance: resolved.resolved_importance,
                resolve_reason: resolved.resolve_reason,
                parent_id: target.memory_id.clone(),
            });
        }
        
        log::info!("[WorkingSet] 解决 {} 个冲突", results.len());
        Ok(results)
    }

    pub fn boost_memories(&mut self, targets: &[BoostTarget]) -> Vec<MemoryItem> {
        let mut boosted = Vec::new();
        
        let decay_factor = self.boost_config.decay_factor;
        let max_importance = self.boost_config.max_importance;
        
        for target in targets {
            if let Some(memory) = self.get_memory_mut(&target.memory_id) {
                memory.importance = (memory.importance * decay_factor + target.boost_amount)
                    .min(max_importance);
                memory.score = memory.importance;
                memory.access_count += 1;
                memory.last_accessed_at = chrono::Utc::now().timestamp();
                memory.version += 1;
                memory.updated_at = chrono::Utc::now().timestamp();
                
                boosted.push(memory.clone());
            }
        }
        
        log::info!("[WorkingSet] 提升 {} 条记忆权重（递减收益）", boosted.len());
        boosted
    }

    pub async fn commit_to_storage(&self, storage: &MemoryStorage) -> Result<CommitResult, Box<dyn std::error::Error>> {
        let mut updated_count = 0;
        let mut deleted_count = 0;
        let mut created_count = 0;
        
        for wm in self.memories.values() {
            if wm.is_deleted {
                let mut memory = wm.memory.clone();
                memory.is_active = false;
                memory.updated_at = chrono::Utc::now().timestamp();
                storage.add_memory(memory).await?;
                deleted_count += 1;
            } else if wm.is_modified {
                storage.add_memory(wm.memory.clone()).await?;
                if wm.memory.version == 1 {
                    created_count += 1;
                } else {
                    updated_count += 1;
                }
            }
        }
        
        log::info!("[WorkingSet] 提交完成: 创建 {} 条, 更新 {} 条, 删除 {} 条", 
            created_count, updated_count, deleted_count);
        
        Ok(CommitResult {
            created_count,
            updated_count,
            deleted_count,
        })
    }
}

pub struct CommitResult {
    pub created_count: usize,
    pub updated_count: usize,
    pub deleted_count: usize,
}
