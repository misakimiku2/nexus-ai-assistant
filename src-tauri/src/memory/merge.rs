use crate::models::{
    MemoryItem, CandidateMemory, MultiSourceMergeRequest, MergeResult,
    ConvergenceConfig, RetrievalOptions,
};
use crate::memory::embedding::EmbeddingService;
use crate::memory::retrieval::MemoryRetriever;
use crate::memory::llm_client::LlmClient;

pub const MULTI_SOURCE_MERGE_PROMPT: &str = r#"
你是记忆合并系统。将多条相似记忆合并为一条完整记忆。

【严格规则】
1. 只输出 JSON，禁止任何解释、推理、注释
2. 不要展示思考过程
3. 不要自我检查
4. 不要逐步推理
5. 输出必须以 { 开始，以 } 结束

【待合并记忆】
{memories_text}

【候选记忆】
类型: {candidate_type}
内容: {candidate_content}
重要性: {candidate_importance}

【合并原则】
1. 保留所有关键信息
2. 消除冗余表述
3. 优先保留更具体的信息

【输出格式】直接输出：
{
  "merged_content": "合并后的记忆内容",
  "merged_importance": 0.0-1.0,
  "merge_reason": "简短理由"
}

现在输出 JSON：
"#;

#[derive(Clone)]
pub struct MergeService {
    llm_client: LlmClient,
    embedding: EmbeddingService,
    retriever: MemoryRetriever,
    config: ConvergenceConfig,
}

impl MergeService {
    pub fn new(llm_client: LlmClient, embedding: EmbeddingService, retriever: MemoryRetriever) -> Self {
        Self {
            llm_client,
            embedding,
            retriever,
            config: ConvergenceConfig::default(),
        }
    }

    pub fn with_config(
        llm_client: LlmClient, 
        embedding: EmbeddingService, 
        retriever: MemoryRetriever, 
        config: ConvergenceConfig
    ) -> Self {
        Self {
            llm_client,
            embedding,
            retriever,
            config,
        }
    }

    pub async fn multi_source_merge(
        &self,
        request: MultiSourceMergeRequest,
    ) -> Result<MergeResult, Box<dyn std::error::Error>> {
        log::info!("[MergeService] 开始多源合并: {} 条现有记忆 + 1 条候选", 
            request.existing_memories.len());
        
        let memories_text = request.existing_memories.iter()
            .enumerate()
            .map(|(i, m)| format!(
                "记忆 {}: 类型={}, 内容=\"{}\", 重要性={:.2}",
                i + 1, m.memory_type.as_str(), m.content, m.importance
            ))
            .collect::<Vec<_>>()
            .join("\n");
        
        let prompt = MULTI_SOURCE_MERGE_PROMPT
            .replace("{memories_text}", &memories_text)
            .replace("{candidate_type}", &request.candidate.memory_type.as_str())
            .replace("{candidate_content}", &request.candidate.content)
            .replace("{candidate_importance}", &format!("{:.2}", request.candidate.importance));
        
        let result = match self.llm_client.generate_json(&prompt).await {
            Ok(response) => {
                match self.parse_merge_response(&response) {
                    Ok(r) => r,
                    Err(_) => self.fallback_multi_merge(&request),
                }
            }
            Err(_) => self.fallback_multi_merge(&request),
        };
        
        let final_result = self.check_convergence(result).await?;
        
        log::info!("[MergeService] 多源合并完成: {}", 
            final_result.merged_content.chars().take(50).collect::<String>());
        
        Ok(final_result)
    }

    async fn check_convergence(
        &self,
        result: MergeResult,
    ) -> Result<MergeResult, Box<dyn std::error::Error>> {
        if result.merged_content.is_empty() {
            return Ok(result);
        }
        
        let options = RetrievalOptions {
            top_k: 5,
            min_similarity: self.config.convergence_threshold,
            only_active: true,
            ..Default::default()
        };
        
        let retrieved = self.retriever.retrieve(&result.merged_content, options).await?;
        let max_similarity = retrieved.iter()
            .map(|r| r.components.similarity)
            .fold(0.0, f32::max);
        
        if max_similarity < self.config.convergence_threshold {
            log::info!("[MergeService] 收敛检查通过: max_similarity={:.2} < {:.2}", 
                max_similarity, self.config.convergence_threshold);
            return Ok(result);
        }
        
        log::info!("[MergeService] 收敛检查未通过: max_similarity={:.2} >= {:.2}", 
            max_similarity, self.config.convergence_threshold);
        
        Ok(result)
    }

    fn fallback_multi_merge(&self, request: &MultiSourceMergeRequest) -> MergeResult {
        log::info!("[MergeService] 使用 fallback 多源合并");
        
        let mut all_contents: Vec<&str> = request.existing_memories.iter()
            .map(|m| m.content.as_str())
            .collect();
        all_contents.push(&request.candidate.content);
        
        let merged_content = all_contents.join("；");
        
        let max_importance = request.existing_memories.iter()
            .map(|m| m.importance)
            .fold(request.candidate.importance, f32::max);
        
        MergeResult {
            merged_content,
            merged_importance: max_importance,
            merge_reason: "LLM 合并失败，使用简单拼接".to_string(),
            is_fallback: true,
            parent_ids: vec![],
            merged: false,
        }
    }

    fn parse_merge_response(&self, response: &str) -> Result<MergeResult, Box<dyn std::error::Error>> {
        let parsed: serde_json::Value = serde_json::from_str(response)?;
        
        Ok(MergeResult {
            merged_content: parsed["merged_content"].as_str().unwrap_or("").to_string(),
            merged_importance: parsed["merged_importance"].as_f64().unwrap_or(0.5) as f32,
            merge_reason: parsed["merge_reason"].as_str().unwrap_or("").to_string(),
            is_fallback: false,
            parent_ids: vec![],
            merged: false,
        })
    }
}
