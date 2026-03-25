use std::collections::HashSet;
use crate::models::{
    MemoryItem, CandidateMemory, DedupDecision, 
    SimilarMemory, BoostTarget, MergeTarget, 
    ConvergenceConfig, BoostConfig, MemoryType, PipelineResult,
    RetrievalOptions, MultiSourceMergeRequest, MergeResult,
};
use crate::memory::retrieval::MemoryRetriever;
use crate::memory::embedding::{EmbeddingService, cosine_similarity};
use crate::memory::storage::MemoryStorage;
use crate::memory::working_set::WorkingSet;
use crate::memory::merge::MergeService;
use crate::memory::conflict::ConflictDetector;

#[derive(Clone)]
pub struct DeduplicationConfig {
    pub candidate_min_similarity: f32,
    pub accept_exact_threshold: f32,
    pub accept_partial_threshold: f32,
    pub boost_amount: f32,
    pub retrieval_top_k: usize,
}

impl Default for DeduplicationConfig {
    fn default() -> Self {
        Self {
            candidate_min_similarity: 0.80,
            accept_exact_threshold: 0.85,
            accept_partial_threshold: 0.75,
            boost_amount: 0.1,
            retrieval_top_k: 10,
        }
    }
}

pub struct DeduplicationService {
    retriever: MemoryRetriever,
    embedding: EmbeddingService,
    storage: MemoryStorage,
    config: DeduplicationConfig,
    convergence_config: ConvergenceConfig,
    conflict_detector: ConflictDetector,
    merge_service: MergeService,
    boost_config: BoostConfig,
}

impl Clone for DeduplicationService {
    fn clone(&self) -> Self {
        Self {
            retriever: self.retriever.clone(),
            embedding: self.embedding.clone(),
            storage: self.storage.clone(),
            config: self.config.clone(),
            convergence_config: self.convergence_config.clone(),
            conflict_detector: self.conflict_detector.clone(),
            merge_service: self.merge_service.clone(),
            boost_config: self.boost_config.clone(),
        }
    }
}

impl DeduplicationService {
    pub fn new(
        retriever: MemoryRetriever,
        embedding: EmbeddingService,
        storage: MemoryStorage,
        conflict_detector: ConflictDetector,
        merge_service: MergeService,
    ) -> Self {
        Self {
            retriever,
            embedding,
            storage,
            config: DeduplicationConfig::default(),
            convergence_config: ConvergenceConfig::default(),
            conflict_detector,
            merge_service,
            boost_config: BoostConfig::default(),
        }
    }

    pub async fn dedup_candidate(
        &self,
        candidate: &CandidateMemory,
    ) -> Result<DedupDecision, Box<dyn std::error::Error>> {
        log::info!("[DedupService] Candidate 阶段去重（只标记）: {}", 
            candidate.content.chars().take(30).collect::<String>());
        
        let options = RetrievalOptions {
            top_k: self.config.retrieval_top_k,
            min_similarity: self.config.candidate_min_similarity,
            only_active: true,
            ..Default::default()
        };
        
        let retrieved = self.retriever.retrieve(&candidate.content, options).await?;
        
        let similar_memories: Vec<SimilarMemory> = retrieved
            .into_iter()
            .map(|r| SimilarMemory {
                memory: r.item,
                similarity: r.components.similarity,
            })
            .collect();
        
        let max_similarity = similar_memories.iter()
            .map(|s| s.similarity)
            .fold(0.0, f32::max);
        
        log::info!("[DedupService] Candidate 阶段完成: {} 条相似记忆, 最高相似度 {:.2}", 
            similar_memories.len(), max_similarity);
        
        Ok(DedupDecision {
            boost_targets: vec![],
            merge_targets: vec![],
            conflict_targets: vec![],
            similar_memories,
            max_similarity,
        })
    }

    pub async fn dedup_accept(
        &self,
        candidate: &CandidateMemory,
    ) -> Result<DedupDecision, Box<dyn std::error::Error>> {
        log::info!("[DedupService] Accept 阶段去重: {}", 
            candidate.content.chars().take(30).collect::<String>());
        
        let options = RetrievalOptions {
            top_k: self.config.retrieval_top_k,
            min_similarity: self.config.accept_partial_threshold,
            only_active: true,
            ..Default::default()
        };
        
        let retrieved = self.retriever.retrieve(&candidate.content, options).await?;
        
        if retrieved.is_empty() {
            log::info!("[DedupService] 无相似记忆，接受");
            return Ok(DedupDecision {
                boost_targets: vec![],
                merge_targets: vec![],
                conflict_targets: vec![],
                similar_memories: vec![],
                max_similarity: 0.0,
            });
        }
        
        let similar_memories: Vec<SimilarMemory> = retrieved
            .into_iter()
            .map(|r| SimilarMemory {
                memory: r.item,
                similarity: r.components.similarity,
            })
            .collect();
        
        let max_similarity = similar_memories.iter()
            .map(|s| s.similarity)
            .fold(0.0, f32::max);
        
        let decision = self.classify_all_similarities(&candidate, &similar_memories).await?;
        
        log::info!("[DedupService] Accept 阶段完成: boost={}, merge={}, conflict={}", 
            decision.boost_targets.len(),
            decision.merge_targets.len(),
            decision.conflict_targets.len());
        
        Ok(decision)
    }

    async fn classify_all_similarities(
        &self,
        candidate: &CandidateMemory,
        similar_memories: &[SimilarMemory],
    ) -> Result<DedupDecision, Box<dyn std::error::Error>> {
        let mut boost_targets: Vec<BoostTarget> = Vec::new();
        let mut merge_candidates: Vec<SimilarMemory> = Vec::new();
        
        for similar in similar_memories {
            if similar.similarity >= self.config.accept_exact_threshold {
                boost_targets.push(BoostTarget {
                    memory_id: similar.memory.id.clone(),
                    similarity: similar.similarity,
                    boost_amount: self.config.boost_amount,
                });
            } else if similar.similarity >= self.config.accept_partial_threshold {
                merge_candidates.push(similar.clone());
            }
        }
        
        let conflict_targets = self.conflict_detector
            .detect_conflicts_batch(&candidate.content, &merge_candidates)
            .await?;
        
        let conflict_ids: HashSet<String> = conflict_targets.iter()
            .map(|c| c.memory_id.clone())
            .collect();
        
        let merge_targets: Vec<MergeTarget> = merge_candidates.iter()
            .filter(|s| !conflict_ids.contains(&s.memory.id))
            .map(|s| MergeTarget {
                memory_id: s.memory.id.clone(),
                similarity: s.similarity,
                memory_type: s.memory.memory_type.clone(),
            })
            .collect();
        
        let max_similarity = similar_memories.iter()
            .map(|s| s.similarity)
            .fold(0.0, f32::max);
        
        Ok(DedupDecision {
            boost_targets,
            merge_targets,
            conflict_targets,
            similar_memories: similar_memories.to_vec(),
            max_similarity,
        })
    }

    pub async fn execute_pipeline(
        &self,
        candidate: &CandidateMemory,
        decision: DedupDecision,
    ) -> Result<PipelineResult, Box<dyn std::error::Error>> {
        log::info!("[DedupService] 开始执行 Pipeline（Working Set 模式）");
        
        let mut result = PipelineResult::default();
        
        let all_memory_ids: Vec<String> = decision.similar_memories.iter()
            .map(|s| s.memory.id.clone())
            .collect();
        
        let mut working_set = WorkingSet::with_config(
            self.embedding.clone(),
            self.boost_config.clone(),
        );
        working_set.load_from_storage(&self.storage, &all_memory_ids).await?;
        
        if !decision.conflict_targets.is_empty() {
            let conflict_result = working_set.resolve_conflicts(
                candidate,
                &decision.conflict_targets,
                &self.conflict_detector,
            ).await?;
            result.conflicts_resolved = conflict_result;
            
            let new_merge_targets = self.recalculate_merge_targets(
                &working_set,
                candidate,
                &decision.merge_targets,
            ).await?;
            
            if !new_merge_targets.is_empty() {
                let merge_result = self.multi_source_merge_in_working_set(
                    &mut working_set,
                    candidate,
                    &new_merge_targets,
                ).await?;
                result.merged = Some(merge_result);
            }
        } else if !decision.merge_targets.is_empty() {
            let merge_result = self.multi_source_merge_in_working_set(
                &mut working_set,
                candidate,
                &decision.merge_targets,
            ).await?;
            result.merged = Some(merge_result);
        }
        
        if !decision.boost_targets.is_empty() {
            let boosted = working_set.boost_memories(&decision.boost_targets);
            result.boosted = boosted;
        }
        
        if decision.boost_targets.is_empty() 
            && decision.merge_targets.is_empty() 
            && decision.conflict_targets.is_empty() {
            let memory = self.create_memory_with_parent_ids(
                &candidate.content,
                &candidate.memory_type,
                candidate.importance,
                vec![],
            ).await?;
            result.accepted = Some(memory);
        }
        
        let _commit_result = working_set.commit_to_storage(&self.storage).await?;
        
        log::info!("[DedupService] Pipeline 执行完成");
        Ok(result)
    }

    async fn recalculate_merge_targets(
        &self,
        working_set: &WorkingSet,
        candidate: &CandidateMemory,
        original_merge_targets: &[MergeTarget],
    ) -> Result<Vec<MergeTarget>, Box<dyn std::error::Error>> {
        let mut new_targets = Vec::new();
        
        let candidate_embedding = self.embedding.embed(&candidate.content).await?;
        
        for target in original_merge_targets {
            if let Some(memory) = working_set.get_memory(&target.memory_id) {
                if let Some(embedding) = &memory.embedding {
                    let similarity = cosine_similarity(&candidate_embedding, embedding);
                    
                    if similarity >= self.config.accept_partial_threshold 
                        && similarity < self.config.accept_exact_threshold {
                        new_targets.push(MergeTarget {
                            memory_id: target.memory_id.clone(),
                            similarity,
                            memory_type: target.memory_type.clone(),
                        });
                    }
                }
            }
        }
        
        log::info!("[DedupService] 重新计算 merge_targets: {} -> {}", 
            original_merge_targets.len(), new_targets.len());
        
        Ok(new_targets)
    }

    async fn multi_source_merge_in_working_set(
        &self,
        working_set: &mut WorkingSet,
        candidate: &CandidateMemory,
        merge_targets: &[MergeTarget],
    ) -> Result<crate::models::MergeResult, Box<dyn std::error::Error>> {
        let candidate_embedding = self.embedding.embed(&candidate.content).await?;
        
        let existing_memories: Vec<MemoryItem> = merge_targets.iter()
            .filter_map(|t| working_set.get_memory(&t.memory_id).cloned())
            .collect();
        
        let request = MultiSourceMergeRequest {
            existing_memories,
            candidate: candidate.clone(),
        };
        
        let result = self.merge_service.multi_source_merge(request).await?;
        
        let merged_embedding = self.embedding.embed(&result.merged_content).await?;
        let mut max_similarity = 0.0;
        let mut most_similar_id: Option<String> = None;
        
        let merge_target_ids: HashSet<String> = merge_targets.iter()
            .map(|t| t.memory_id.clone())
            .collect();
        
        for (id, wm) in working_set.memories.iter() {
            if wm.is_deleted {
                continue;
            }
            
            if merge_target_ids.contains(id) {
                continue;
            }
            
            if let Some(existing_embedding) = &wm.memory.embedding {
                let similarity = cosine_similarity(&merged_embedding, existing_embedding);
                if similarity > max_similarity {
                    max_similarity = similarity;
                    most_similar_id = Some(id.clone());
                }
            }
        }
        
        if max_similarity > self.config.accept_exact_threshold {
            log::info!("[DedupService] Merge 后发现高相似度记忆 {:.2}，执行 boost 而非创建新记忆", max_similarity);
            
            if let Some(similar_id) = most_similar_id {
                let boost_target = BoostTarget {
                    memory_id: similar_id.clone(),
                    similarity: max_similarity,
                    boost_amount: self.config.boost_amount,
                };
                working_set.boost_memories(&[boost_target]);
            }
            
            return Ok(crate::models::MergeResult {
                merged_content: String::new(),
                merged_importance: 0.0,
                merge_reason: format!("已有记忆足够好（相似度 {:.2}），不创建新记忆", max_similarity),
                is_fallback: false,
                parent_ids: vec![],
                merged: false,
            });
        }
        
        for target in merge_targets {
            working_set.mark_deleted(&target.memory_id);
        }
        
        let mut parent_ids: Vec<String> = merge_targets.iter()
            .map(|t| t.memory_id.clone())
            .collect();
        parent_ids.push(candidate.id.clone());
        
        let new_memory = self.create_memory_with_parent_ids(
            &result.merged_content,
            &candidate.memory_type,
            result.merged_importance,
            parent_ids.clone(),
        ).await?;
        
        working_set.add_memory(new_memory);
        
        Ok(crate::models::MergeResult {
            merged_content: result.merged_content,
            merged_importance: result.merged_importance,
            merge_reason: result.merge_reason,
            is_fallback: result.is_fallback,
            parent_ids,
            merged: true,
        })
    }

    async fn create_memory_with_parent_ids(
        &self,
        content: &str,
        memory_type: &MemoryType,
        importance: f32,
        parent_ids: Vec<String>,
    ) -> Result<MemoryItem, Box<dyn std::error::Error>> {
        let emb = self.embedding.embed(content).await?;
        
        let memory = MemoryItem {
            id: uuid::Uuid::new_v4().to_string(),
            content: content.to_string(),
            memory_type: memory_type.clone(),
            importance,
            score: importance,
            embedding: Some(emb),
            version: 1,
            parent_ids,
            is_active: true,
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
            last_accessed_at: chrono::Utc::now().timestamp(),
            access_count: 1,
            decay: 0.01,
            source_session_id: None,
            metadata: None,
            marked_inactive_at: None,
        };
        
        log::info!("[DedupService] 创建新记忆: version=1, parent_ids={:?}", memory.parent_ids);
        Ok(memory)
    }
}
