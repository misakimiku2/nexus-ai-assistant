use crate::models::{MemoryItem, RecencyConfig, DeletionConfig};

pub fn calculate_recency_weight(last_accessed_at: i64, config: &RecencyConfig) -> f32 {
    let now = chrono::Utc::now().timestamp();
    let days_since_access = (now - last_accessed_at) as f32 / (24.0 * 3600.0);
    
    (-days_since_access / config.half_life_days).exp()
}

pub fn calculate_score(memory: &MemoryItem, config: &RecencyConfig) -> f32 {
    let recency_weight = calculate_recency_weight(memory.last_accessed_at, config);
    let access_factor = 1.0 + (memory.access_count as f32 * 0.05);
    
    memory.importance * recency_weight * access_factor
}

pub fn calculate_all_scores(memories: &[MemoryItem], config: &RecencyConfig) -> Vec<(String, f32)> {
    memories.iter()
        .map(|m| (m.id.clone(), calculate_score(m, config)))
        .collect()
}

pub fn should_deactivate(memory: &MemoryItem, config: &DeletionConfig) -> bool {
    if memory.importance >= config.min_importance {
        return false;
    }
    
    let now = chrono::Utc::now().timestamp();
    let days_since_access = (now - memory.last_accessed_at) / (24 * 3600);
    
    days_since_access > config.max_inactive_days
}
