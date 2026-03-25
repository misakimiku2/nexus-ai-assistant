use crate::models::{MemoryType, RetrievalOptions, RetrievedMemory, ScoreComponents, ModelType};
use crate::memory::storage::MemoryStorage;
use crate::memory::embedding::{EmbeddingService, cosine_similarity};

const W_SIMILARITY: f32 = 0.6;
const W_MEMORY_SCORE: f32 = 0.4;

#[derive(Clone)]
pub struct MemoryRetriever {
    storage: MemoryStorage,
    embedding: EmbeddingService,
}

impl MemoryRetriever {
    pub fn new(storage: MemoryStorage, embedding: EmbeddingService) -> Self {
        Self { storage, embedding }
    }

    pub async fn retrieve(
        &self,
        query: &str,
        options: RetrievalOptions,
    ) -> Result<Vec<RetrievedMemory>, Box<dyn std::error::Error>> {
        log::info!("[MemoryRetriever] 开始检索记忆, query={:?}..., top_k={}, min_similarity={}, only_active={}", 
            query.chars().take(50).collect::<String>(), options.top_k, options.min_similarity, options.only_active);
        
        let query_embedding = self.embedding.embed(query).await?;

        let candidates = self.storage.get_candidates(&options).await?;
        log::info!("[MemoryRetriever] 获取到 {} 个候选记忆", candidates.len());

        let candidates_count = candidates.len();
        let min_similarity = options.min_similarity;
        let mut scored: Vec<RetrievedMemory> = candidates
            .into_iter()
            .filter_map(|item| {
                let embedding = item.embedding.as_ref()?;
                let similarity = cosine_similarity(&query_embedding, embedding);
                
                if similarity < min_similarity {
                    log::debug!("[MemoryRetriever] 过滤低相似度记忆: similarity={:.3} < {:.3}, content={}", 
                        similarity, min_similarity, item.content.chars().take(30).collect::<String>());
                    return None;
                }
                
                let memory_score = item.score;
                let final_score = similarity * W_SIMILARITY + memory_score * W_MEMORY_SCORE;

                Some(RetrievedMemory {
                    item,
                    score: final_score,
                    components: ScoreComponents {
                        similarity,
                        memory_score,
                    },
                })
            })
            .collect();

        scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

        let top_k = match options.model_type {
            Some(ModelType::Local) => options.top_k.min(5),
            Some(ModelType::Online) => options.top_k.min(10),
            None => options.top_k,
        };
        scored.truncate(top_k);

        log::info!("[MemoryRetriever] 检索完成, 返回 {} 条记忆 (top_k={}), 过滤 {} 条低相似度记忆", 
            scored.len(), top_k, candidates_count - scored.len());

        Ok(scored)
    }

    pub async fn retrieve_by_type(
        &self,
        query: &str,
        memory_type: MemoryType,
        top_k: usize,
    ) -> Result<Vec<RetrievedMemory>, Box<dyn std::error::Error>> {
        let options = RetrievalOptions {
            top_k,
            memory_types: Some(vec![memory_type]),
            ..Default::default()
        };
        self.retrieve(query, options).await
    }

    pub async fn retrieve_for_local_model(
        &self,
        query: &str,
        options: RetrievalOptions,
    ) -> Result<Vec<RetrievedMemory>, Box<dyn std::error::Error>> {
        let mut options = options;
        options.model_type = Some(ModelType::Local);
        self.retrieve(query, options).await
    }

    pub async fn retrieve_for_online_model(
        &self,
        query: &str,
        options: RetrievalOptions,
    ) -> Result<Vec<RetrievedMemory>, Box<dyn std::error::Error>> {
        let mut options = options;
        options.model_type = Some(ModelType::Online);
        self.retrieve(query, options).await
    }
}

pub fn format_memories_for_prompt(memories: &[RetrievedMemory]) -> String {
    if memories.is_empty() {
        return String::new();
    }

    let mut lines: Vec<String> = vec![
        "## 【Relevant Memories】".to_string(),
        String::new(),
        "以下是与你当前对话相关的记忆信息，请参考这些信息来更好地理解用户：".to_string(),
        String::new(),
    ];

    let identity: Vec<_> = memories.iter().filter(|m| m.item.memory_type == MemoryType::Identity).collect();
    let facts: Vec<_> = memories.iter().filter(|m| m.item.memory_type == MemoryType::Fact).collect();
    let preferences: Vec<_> = memories.iter().filter(|m| m.item.memory_type == MemoryType::Preference).collect();
    let tasks: Vec<_> = memories.iter().filter(|m| m.item.memory_type == MemoryType::Task).collect();
    let constraints: Vec<_> = memories.iter().filter(|m| m.item.memory_type == MemoryType::Constraint).collect();
    let skills: Vec<_> = memories.iter().filter(|m| m.item.memory_type == MemoryType::Skill).collect();

    if !identity.is_empty() {
        lines.push("### 身份特征".to_string());
        for i in identity {
            lines.push(format!("- {}", i.item.content));
        }
        lines.push(String::new());
    }

    if !facts.is_empty() {
        lines.push("### 已知事实".to_string());
        for f in facts {
            lines.push(format!("- {}", f.item.content));
        }
        lines.push(String::new());
    }

    if !preferences.is_empty() {
        lines.push("### 用户偏好".to_string());
        for p in preferences {
            lines.push(format!("- {}", p.item.content));
        }
        lines.push(String::new());
    }

    if !tasks.is_empty() {
        lines.push("### 进行中的任务".to_string());
        for t in tasks {
            if let Some(meta) = &t.item.metadata {
                lines.push(format!("- {} [{}]", t.item.content, meta.status.as_str()));
                if let Some(progress) = &meta.progress {
                    lines.push(format!("  进展: {}", progress));
                }
                if let Some(next_step) = &meta.next_step {
                    lines.push(format!("  下一步: {}", next_step));
                }
            } else {
                lines.push(format!("- {}", t.item.content));
            }
        }
        lines.push(String::new());
    }

    if !constraints.is_empty() {
        lines.push("### 限制条件".to_string());
        for c in constraints {
            lines.push(format!("- {}", c.item.content));
        }
        lines.push(String::new());
    }

    if !skills.is_empty() {
        lines.push("### 用户能力".to_string());
        for s in skills {
            lines.push(format!("- {}", s.item.content));
        }
        lines.push(String::new());
    }

    lines.join("\n")
}
