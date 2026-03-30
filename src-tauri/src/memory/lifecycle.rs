use crate::memory::storage::MemoryStorage;
use crate::memory::scoring::{calculate_recency_weight, should_deactivate};
use crate::models::{MemoryItem, MemoryType, TaskStatus, DecayResult, PruneResult, RecencyConfig, DeletionConfig, DeactivationResult, EvolutionResult, ConversationMessage, ExtractionConfig};

pub fn should_extract(messages: &[ConversationMessage], _config: &ExtractionConfig) -> bool {
    messages.len() >= 3
}

pub fn check_duplicate_simple(content: &str, existing: &[MemoryItem]) -> Option<String> {
    for memory in existing {
        let similarity = text_similarity(content, &memory.content);
        if similarity > 0.85 {
            return Some(memory.id.clone());
        }
    }
    None
}

fn text_similarity(a: &str, b: &str) -> f32 {
    let a_chars: std::collections::HashSet<char> = a.chars().collect();
    let b_chars: std::collections::HashSet<char> = b.chars().collect();

    if a_chars.is_empty() || b_chars.is_empty() {
        return 0.0;
    }

    let intersection = a_chars.intersection(&b_chars).count();
    let union = a_chars.union(&b_chars).count();

    intersection as f32 / union as f32
}

pub struct MemoryLifecycle {
    storage: MemoryStorage,
    max_memories: usize,
    min_importance_threshold: f32,
}

impl MemoryLifecycle {
    pub fn new(storage: MemoryStorage) -> Self {
        Self {
            storage,
            max_memories: 1000,
            min_importance_threshold: 0.2,
        }
    }

    pub async fn should_extract(&self, message_count: usize, last_extraction_count: usize) -> bool {
        message_count >= last_extraction_count + 3
    }

    pub async fn consolidate(&self) -> Result<usize, Box<dyn std::error::Error>> {
        let stats = self.storage.get_stats().await?;
        
        if stats.total_count <= self.max_memories {
            return Ok(0);
        }

        let pruned = self.storage.prune_memories().await?;
        Ok(pruned)
    }

    pub async fn update_task_progress(
        &self,
        task_id: &str,
        progress: String,
        next_step: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.storage.update_task_status(
            task_id,
            TaskStatus::InProgress,
            Some(progress),
            next_step,
        ).await
    }

    pub async fn complete_task(&self, task_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        self.storage.update_task_status(
            task_id,
            TaskStatus::Done,
            None,
            None,
        ).await
    }

    pub async fn cancel_task(&self, task_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        self.storage.update_task_status(
            task_id,
            TaskStatus::Cancelled,
            None,
            None,
        ).await
    }

    pub fn calculate_importance(
        &self,
        content: &str,
        memory_type: &MemoryType,
        is_repeated: bool,
        has_action: bool,
    ) -> f32 {
        let mut importance: f32 = 0.5;

        match memory_type {
            MemoryType::Identity => importance += 0.3,
            MemoryType::Constraint => importance += 0.15,
            MemoryType::Preference => importance += 0.1,
            MemoryType::Fact => importance += 0.05,
        }

        if content.len() > 100 {
            importance += 0.1;
        }

        if is_repeated {
            importance += 0.1;
        }

        if has_action {
            importance += 0.15;
        }

        importance.clamp(0.0, 1.0)
    }

    pub async fn deduplicate_memories(
        &self,
        new_content: &str,
        existing_memories: &[MemoryItem],
        similarity_threshold: f32,
    ) -> bool {
        for existing in existing_memories {
            let similarity = self.text_similarity(new_content, &existing.content);
            if similarity > similarity_threshold {
                return true;
            }
        }
        false
    }

    fn text_similarity(&self, a: &str, b: &str) -> f32 {
        let a_words: std::collections::HashSet<&str> = a.split_whitespace().collect();
        let b_words: std::collections::HashSet<&str> = b.split_whitespace().collect();

        if a_words.is_empty() || b_words.is_empty() {
            return 0.0;
        }

        let intersection = a_words.intersection(&b_words).count();
        let union = a_words.union(&b_words).count();

        intersection as f32 / union as f32
    }
}

pub struct MemoryEvolutionManager {
    storage: MemoryStorage,
}

impl MemoryEvolutionManager {
    pub fn new(storage: MemoryStorage) -> Self {
        Self { storage }
    }

    pub async fn reinforce(&self, memory_ids: &[String]) -> Result<usize, Box<dyn std::error::Error>> {
        log::info!("[MemoryEvolution] 强化 {} 条记忆", memory_ids.len());
        self.storage.reinforce_memories(memory_ids).await
    }

    pub async fn decay_all(&self) -> Result<DecayResult, Box<dyn std::error::Error>> {
        log::info!("[MemoryEvolution] 开始衰减所有记忆");
        let result = self.storage.decay_memories().await?;
        log::info!("[MemoryEvolution] 衰减完成: 处理 {} 条, 更新 {} 条", result.processed, result.updated);
        Ok(result)
    }

    pub async fn prune(&self) -> Result<PruneResult, Box<dyn std::error::Error>> {
        log::info!("[MemoryEvolution] 开始淘汰低价值记忆");
        let result = self.storage.prune_memories_v2().await?;
        log::info!("[MemoryEvolution] 淘汰完成: 标记不活跃 {} 条, 删除 {} 条", result.marked_inactive, result.deleted);
        Ok(result)
    }

    pub async fn run_evolution_cycle(&self) -> Result<(DecayResult, PruneResult), Box<dyn std::error::Error>> {
        log::info!("[MemoryEvolution] 开始演化周期");
        let decay_result = self.decay_all().await?;
        let prune_result = self.prune().await?;
        log::info!("[MemoryEvolution] 演化周期完成");
        Ok((decay_result, prune_result))
    }

    pub async fn decay_with_recency(&self) -> Result<DecayResult, Box<dyn std::error::Error>> {
        log::info!("[MemoryEvolution] 开始衰减（含时间维度）");
        
        let memories = self.storage.get_all_memories().await?;
        let recency_config = RecencyConfig::default();
        let now = chrono::Utc::now().timestamp();
        
        let processed = memories.len();
        let mut updated = 0;
        
        for memory in memories {
            if !memory.is_active {
                continue;
            }
            
            let recency_weight = calculate_recency_weight(memory.last_accessed_at, &recency_config);
            let access_factor = 1.0 + (memory.access_count as f32 * 0.05);
            
            let new_score = memory.importance * recency_weight * access_factor;
            let new_importance = memory.importance * 0.995;
            
            let mut updated_memory = memory.clone();
            updated_memory.score = new_score;
            updated_memory.importance = new_importance;
            updated_memory.updated_at = now;
            
            self.storage.add_memory(updated_memory).await?;
            updated += 1;
        }
        
        log::info!("[MemoryEvolution] 衰减完成: 处理 {} 条, 更新 {} 条", processed, updated);
        
        Ok(DecayResult { processed, updated })
    }

    pub async fn deactivate_low_value_memories(&self) -> Result<DeactivationResult, Box<dyn std::error::Error>> {
        log::info!("[MemoryEvolution] 开始逻辑删除低价值记忆");
        
        let config = DeletionConfig::default();
        let memories = self.storage.get_all_memories().await?;
        
        let mut deactivated_count = 0;
        let mut deactivated_ids: Vec<String> = Vec::new();
        
        for memory in memories {
            if should_deactivate(&memory, &config) {
                let mut deactivated_memory = memory.clone();
                deactivated_memory.is_active = false;
                deactivated_memory.updated_at = chrono::Utc::now().timestamp();
                
                self.storage.add_memory(deactivated_memory).await?;
                deactivated_ids.push(memory.id.clone());
                deactivated_count += 1;
                log::info!("[MemoryEvolution] 逻辑删除低价值记忆: {} (importance={:.2}, days_inactive={})", 
                    memory.id, memory.importance, 
                    (chrono::Utc::now().timestamp() - memory.last_accessed_at) / (24 * 3600));
            }
        }
        
        log::info!("[MemoryEvolution] 逻辑删除完成: {} 条记忆", deactivated_count);
        
        Ok(DeactivationResult {
            deactivated_count,
            deactivated_ids,
        })
    }

    pub async fn run_full_evolution(&self) -> Result<EvolutionResult, Box<dyn std::error::Error>> {
        log::info!("[MemoryEvolution] 开始完整演化周期");
        
        let decay_result = self.decay_with_recency().await?;
        let deactivation_result = self.deactivate_low_value_memories().await?;
        let prune_result = self.prune().await?;
        
        log::info!("[MemoryEvolution] 演化周期完成: 衰减 {} 条, 逻辑删除 {} 条, 标记不活跃 {} 条", 
            decay_result.updated, deactivation_result.deactivated_count, prune_result.marked_inactive);
        
        Ok(EvolutionResult {
            decay: decay_result,
            deactivation: deactivation_result,
            prune: prune_result,
        })
    }
}

pub fn default_memory_routing(query: &str) -> Vec<MemoryType> {
    let query_lower = query.to_lowercase();

    let preference_keywords = ["偏好", "喜欢", "习惯", "prefer", "like", "habit", "want"];
    let problem_keywords = ["问题", "解决", "如何", "怎么", "problem", "solve", "how", "help"];

    if preference_keywords.iter().any(|k| query_lower.contains(k)) {
        return vec![MemoryType::Preference];
    }

    if problem_keywords.iter().any(|k| query_lower.contains(k)) {
        return vec![MemoryType::Constraint];
    }

    vec![MemoryType::Constraint]
}

pub fn format_memories_for_auto_injection(memories: &[crate::models::RetrievedMemory]) -> String {
    let mut sections: Vec<String> = Vec::new();

    let constraints: Vec<_> = memories.iter().filter(|m| m.item.memory_type == MemoryType::Constraint).collect();
    if !constraints.is_empty() {
        sections.push("## Constraints".to_string());
        for c in constraints {
            sections.push(format!("- {}", c.item.content));
        }
    }

    let preferences: Vec<_> = memories.iter().filter(|m| m.item.memory_type == MemoryType::Preference).collect();
    if !preferences.is_empty() {
        sections.push("## Preferences".to_string());
        for p in preferences {
            sections.push(format!("- {}", p.item.content));
        }
    }

    sections.join("\n")
}

pub const CONSTRAINT_AWARENESS_PROMPT: &str = r#"
## Constraint Awareness

请在回答时自动考虑用户的限制条件（constraints），并调整输出复杂度和方案。

例如：
- 如果用户计算资源有限，优先推荐轻量级方案
- 如果用户时间有限，优先提供快速解决方案
- 如果用户技术能力有限，避免过于复杂的实现

当前用户约束：
{constraints}
"#;
