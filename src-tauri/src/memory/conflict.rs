use crate::models::{
    MemoryType, ConflictType, ConflictTarget, 
    ConflictResolveRequest, ConflictResolveResult, ConflictDetectionConfig,
    SimilarMemory,
};
use crate::memory::llm_client::LlmClient;

pub const CONFLICT_DETECTION_PROMPT: &str = r#"
你是记忆冲突检测系统。判断两条记忆是否存在语义冲突。

【严格规则】
1. 只输出 JSON，禁止任何解释、推理、注释
2. 不要展示思考过程
3. 不要自我检查
4. 不要逐步推理
5. 输出必须以 { 开始，以 } 结束

【记忆 A】
{content_a}

【记忆 B】
{content_b}

【冲突类型】
- preference: 偏好冲突（对同一事物的偏好变化）
- fact: 事实冲突（关于同一事实的矛盾陈述）
- status: 状态冲突（任务或状态的变化）

【输出格式】直接输出：
{
  "has_conflict": true或false,
  "conflict_type": "preference"或"fact"或"status"或null,
  "reason": "简短原因"
}

【注意】
- 互补信息不是冲突
- 例："用户使用Python" + "用户也使用JavaScript" = 无冲突

现在输出 JSON：
"#;

pub const CONFLICT_RESOLVE_PROMPT: &str = r#"
你是记忆冲突解决系统。合并两条冲突的记忆。

【严格规则】
1. 只输出 JSON，禁止任何解释、推理、注释
2. 不要展示思考过程
3. 不要自我检查
4. 不要逐步推理
5. 输出必须以 { 开始，以 } 结束

【冲突记忆 A】
类型: {type_a}
内容: {content_a}
重要性: {importance_a}

【冲突记忆 B】（更新）
类型: {type_b}
内容: {content_b}
重要性: {importance_b}

【冲突类型】
{conflict_type}

【解决原则】
1. 优先保留更新信息（B）
2. 偏好变化：记录变化
3. 状态变化：记录最终状态

【输出格式】直接输出：
{
  "resolved_content": "解决后的记忆内容",
  "resolved_importance": 0.0-1.0,
  "resolve_reason": "简短理由"
}

现在输出 JSON：
"#;

#[derive(Clone)]
pub struct ConflictDetector {
    llm_client: LlmClient,
    config: ConflictDetectionConfig,
}

impl ConflictDetector {
    pub fn new(llm_client: LlmClient) -> Self {
        Self {
            llm_client,
            config: ConflictDetectionConfig::default(),
        }
    }

    pub fn with_config(llm_client: LlmClient, config: ConflictDetectionConfig) -> Self {
        Self { llm_client, config }
    }

    pub async fn detect_conflicts_batch(
        &self,
        candidate_content: &str,
        similar_memories: &[SimilarMemory],
    ) -> Result<Vec<ConflictTarget>, Box<dyn std::error::Error>> {
        let mut conflict_targets = Vec::new();
        
        let candidates: Vec<_> = similar_memories.iter()
            .filter(|s| s.similarity >= self.config.min_similarity)
            .take(self.config.max_candidates)
            .collect();
        
        log::info!("[ConflictDetector] 冲突检测候选: {} 条", candidates.len());
        
        for similar in candidates {
            let conflict = self.detect_conflict(candidate_content, &similar.memory.content).await?;
            
            if let Some(conflict_type) = conflict {
                conflict_targets.push(ConflictTarget {
                    memory_id: similar.memory.id.clone(),
                    similarity: similar.similarity,
                    conflict_type,
                });
            }
        }
        
        Ok(conflict_targets)
    }

    pub async fn detect_conflict(
        &self,
        content_a: &str,
        content_b: &str,
    ) -> Result<Option<ConflictType>, Box<dyn std::error::Error>> {
        let prompt = CONFLICT_DETECTION_PROMPT
            .replace("{content_a}", content_a)
            .replace("{content_b}", content_b);
        
        let response = match self.llm_client.generate_json(&prompt).await {
            Ok(r) => r,
            Err(e) => {
                log::warn!("[ConflictDetector] LLM 调用失败: {}", e);
                return Ok(None);
            }
        };
        
        let result = self.parse_detection_response(&response)?;
        
        if result.has_conflict {
            Ok(result.conflict_type)
        } else {
            Ok(None)
        }
    }

    fn parse_detection_response(&self, response: &str) -> Result<ConflictDetectionResult, Box<dyn std::error::Error>> {
        let parsed: serde_json::Value = serde_json::from_str(response)?;
        
        let conflict_type = match parsed["conflict_type"].as_str() {
            Some("preference") => Some(ConflictType::Preference),
            Some("fact") => Some(ConflictType::Fact),
            Some("status") => Some(ConflictType::Status),
            _ => None,
        };
        
        Ok(ConflictDetectionResult {
            has_conflict: parsed["has_conflict"].as_bool().unwrap_or(false),
            conflict_type,
            reason: parsed["reason"].as_str().map(|s| s.to_string()),
        })
    }

    pub async fn resolve_conflict(
        &self,
        request: ConflictResolveRequest,
    ) -> Result<ConflictResolveResult, Box<dyn std::error::Error>> {
        log::info!("[ConflictResolver] 开始解决冲突");
        
        let prompt = CONFLICT_RESOLVE_PROMPT
            .replace("{type_a}", request.existing.memory_type.as_str())
            .replace("{content_a}", &request.existing.content)
            .replace("{importance_a}", &format!("{:.2}", request.existing.importance))
            .replace("{type_b}", request.candidate.memory_type.as_str())
            .replace("{content_b}", &request.candidate.content)
            .replace("{importance_b}", &format!("{:.2}", request.candidate.importance))
            .replace("{conflict_type}", &format!("{:?}", request.conflict_type));
        
        match self.llm_client.generate_json(&prompt).await {
            Ok(response) => {
                match self.parse_resolve_response(&response) {
                    Ok(mut result) => {
                        result.parent_id = request.existing.id.clone();
                        Ok(result)
                    },
                    Err(_) => Ok(self.fallback_resolve(&request)),
                }
            }
            Err(_) => Ok(self.fallback_resolve(&request)),
        }
    }

    fn fallback_resolve(&self, request: &ConflictResolveRequest) -> ConflictResolveResult {
        log::info!("[ConflictResolver] 使用 fallback 解决冲突");
        
        ConflictResolveResult {
            resolved_content: format!("{}（已更新：{}）", request.existing.content, request.candidate.content),
            resolved_importance: request.candidate.importance,
            resolve_reason: "LLM 解决失败，使用简单拼接".to_string(),
            parent_id: request.existing.id.clone(),
        }
    }

    fn parse_resolve_response(&self, response: &str) -> Result<ConflictResolveResult, Box<dyn std::error::Error>> {
        let parsed: serde_json::Value = serde_json::from_str(response)?;
        
        Ok(ConflictResolveResult {
            resolved_content: parsed["resolved_content"].as_str().unwrap_or("").to_string(),
            resolved_importance: parsed["resolved_importance"].as_f64().unwrap_or(0.5) as f32,
            resolve_reason: parsed["resolve_reason"].as_str().unwrap_or("").to_string(),
            parent_id: String::new(),
        })
    }
}

struct ConflictDetectionResult {
    has_conflict: bool,
    conflict_type: Option<ConflictType>,
    reason: Option<String>,
}
