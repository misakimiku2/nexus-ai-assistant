use std::collections::HashSet;
use crate::models::{
    CandidateMemory, ConversationMessage, ExtractionConfig, ExtractedMemory, 
    ExtractedItem, ExtractedTask, MemoryItem, MemoryType,
};

pub const COGNITIVE_MEMORY_EXTRACTION_PROMPT: &str = r#"
你是记忆提取系统。从对话中提取长期有价值的信息。

【严格规则】
1. 只输出 JSON，禁止任何解释、推理、注释
2. 不要展示思考过程
3. 不要自我检查
4. 不要逐步推理
5. 输出必须以 { 开始，以 } 结束

【提取原则】
只提取"最重要、最稳定、可复用"的信息。

【忽略内容】
- 临时讨论内容
- 重复表达
- 细节举例
- 枚举类信息（如一堆角色名、物品列表）

【优先提取】
- 用户长期偏好
- 稳定事实
- 关键能力/约束

【数量限制】
- identity: ≤2 条
- facts: ≤3 条
- preferences: ≤3 条
- tasks: ≤2 条
- constraints: ≤2 条
- skills: ≤2 条
- 总计 ≤8 条

【强制要求】
如果提取结果超过 8 条，请只保留最重要的 8 条，其余丢弃。

【合并规则】
禁止拆分细粒度事实，应合并为一条：
错误："今汐有叠层机制"、"守岸人能回血"、"维里奈能闪避"
正确："游戏包含多种角色机制（叠层爆发、护盾、闪避等）"

【输入对话】
{conversation}

【输出格式】直接输出以下 JSON 结构：
{
  "identity": [{"content": "...", "importance": 0.7-1.0}],
  "facts": [{"content": "...", "importance": 0.7-1.0}],
  "preferences": [{"content": "...", "importance": 0.7-1.0}],
  "tasks": [{"content": "...", "status": "pending|in_progress|done", "importance": 0.7-1.0}],
  "constraints": [{"content": "...", "importance": 0.7-1.0}],
  "skills": [{"content": "...", "importance": 0.7-1.0}]
}

【类别定义】
- identity: 长期稳定的用户身份、职业、角色
- facts: 客观信息（项目、工具、环境）
- preferences: 选择倾向或习惯
- tasks: 正在进行的任务
- constraints: 限制、资源约束
- skills: 具备的能力

【评分规则】
- importance: 0.7-1.0，越高越重要（最低 0.7）
- content: 最少 10 个字符
- 空类别返回 []

现在输出 JSON：
"#;

pub fn format_extraction_prompt(conversation: &str) -> String {
    COGNITIVE_MEMORY_EXTRACTION_PROMPT.replace("{conversation}", conversation)
}

pub fn parse_extraction_response(response: &str) -> Result<ExtractedMemory, Box<dyn std::error::Error>> {
    let json_str = extract_json_string(response.trim());
    let extracted: ExtractedMemory = serde_json::from_str(&json_str)?;
    Ok(extracted)
}

fn extract_json_string(text: &str) -> String {
    let trimmed = text.trim();
    
    if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            if end > start {
                return trimmed[start..=end].to_string();
            }
        }
    }
    
    if trimmed.starts_with("```json") {
        let content = &trimmed[7..];
        if let Some(end) = content.find("```") {
            return content[..end].trim().to_string();
        }
        return content.trim().to_string();
    }
    
    if trimmed.starts_with("```") {
        let content = &trimmed[3..];
        if let Some(end) = content.find("```") {
            return content[..end].trim().to_string();
        }
        return content.trim().to_string();
    }
    
    trimmed.to_string()
}

pub fn should_extract(messages: &[ConversationMessage], config: &ExtractionConfig) -> bool {
    if messages.len() < config.min_message_count {
        log::debug!("[Extraction] 消息数量不足: {} < {}", messages.len(), config.min_message_count);
        return false;
    }

    let filtered_messages: Vec<_> = if config.skip_tool_call_messages {
        messages.iter().filter(|m| !m.is_tool_call).collect()
    } else {
        messages.iter().collect()
    };

    if filtered_messages.len() < config.min_message_count {
        log::debug!("[Extraction] 过滤后消息数量不足: {} < {}", filtered_messages.len(), config.min_message_count);
        return false;
    }

    let total_length: usize = filtered_messages.iter().map(|m| m.content.len()).sum();
    if total_length < config.min_conversation_length {
        log::debug!("[Extraction] 对话长度不足: {} < {}", total_length, config.min_conversation_length);
        return false;
    }

    log::info!("[Extraction] 满足提取条件: {} 条消息, {} 字符", filtered_messages.len(), total_length);
    true
}

pub fn calculate_confidence(
    content: &str,
    memory_type: &MemoryType,
    source_message_count: usize,
) -> f32 {
    let mut confidence: f32 = 0.5;

    if content.len() > 20 {
        confidence += 0.1;
    }
    if content.len() > 50 {
        confidence += 0.05;
    }

    if source_message_count > 1 {
        confidence += 0.1;
    }
    if source_message_count > 3 {
        confidence += 0.05;
    }

    match memory_type {
        MemoryType::Identity | MemoryType::Preference => {
            confidence += 0.1;
        }
        MemoryType::Constraint => {
            confidence += 0.05;
        }
        _ => {}
    }

    confidence.min(1.0_f32)
}

pub fn check_duplicate_simple(
    content: &str,
    existing: &[MemoryItem],
) -> Option<String> {
    for memory in existing {
        if memory.content == content {
            log::debug!("[Extraction] 精确匹配重复: {}", memory.id);
            return Some(memory.id.clone());
        }

        if memory.content.contains(content) {
            log::debug!("[Extraction] 包含匹配重复: {}", memory.id);
            return Some(memory.id.clone());
        }

        if content.contains(&memory.content) && memory.content.len() > 20 {
            log::debug!("[Extraction] 反向包含匹配重复: {}", memory.id);
            return Some(memory.id.clone());
        }

        let overlap = calculate_keyword_overlap(content, &memory.content);
        if overlap > 0.8 {
            log::debug!("[Extraction] 关键词重叠重复: {} (overlap: {})", memory.id, overlap);
            return Some(memory.id.clone());
        }
    }
    None
}

fn calculate_keyword_overlap(a: &str, b: &str) -> f32 {
    let a_words: HashSet<&str> = a.split_whitespace().collect();
    let b_words: HashSet<&str> = b.split_whitespace().collect();
    
    if a_words.is_empty() || b_words.is_empty() {
        return 0.0;
    }
    
    let intersection = a_words.intersection(&b_words).count();
    let min_len = a_words.len().min(b_words.len());
    
    (intersection as f32) / (min_len as f32)
}

pub fn convert_extracted_to_candidates(
    extracted: ExtractedMemory,
    session_id: String,
    message_ids: Vec<String>,
) -> Vec<CandidateMemory> {
    let mut candidates = Vec::new();

    for item in extracted.identity {
        let confidence = calculate_confidence(&item.content, &MemoryType::Identity, message_ids.len());
        candidates.push(CandidateMemory::new(
            item.content,
            MemoryType::Identity,
            confidence,
            session_id.clone(),
            message_ids.clone(),
            item.importance,
        ));
    }

    for item in extracted.facts {
        let confidence = calculate_confidence(&item.content, &MemoryType::Fact, message_ids.len());
        candidates.push(CandidateMemory::new(
            item.content,
            MemoryType::Fact,
            confidence,
            session_id.clone(),
            message_ids.clone(),
            item.importance,
        ));
    }

    for item in extracted.preferences {
        let confidence = calculate_confidence(&item.content, &MemoryType::Preference, message_ids.len());
        candidates.push(CandidateMemory::new(
            item.content,
            MemoryType::Preference,
            confidence,
            session_id.clone(),
            message_ids.clone(),
            item.importance,
        ));
    }

    for task in extracted.tasks {
        let confidence = calculate_confidence(&task.content, &MemoryType::Task, message_ids.len());
        let candidate = CandidateMemory::new(
            task.content,
            MemoryType::Task,
            confidence,
            session_id.clone(),
            message_ids.clone(),
            task.importance,
        );
        candidates.push(candidate);
    }

    for item in extracted.constraints {
        let confidence = calculate_confidence(&item.content, &MemoryType::Constraint, message_ids.len());
        candidates.push(CandidateMemory::new(
            item.content,
            MemoryType::Constraint,
            confidence,
            session_id.clone(),
            message_ids.clone(),
            item.importance,
        ));
    }

    for item in extracted.skills {
        let confidence = calculate_confidence(&item.content, &MemoryType::Skill, message_ids.len());
        candidates.push(CandidateMemory::new(
            item.content,
            MemoryType::Skill,
            confidence,
            session_id.clone(),
            message_ids.clone(),
            item.importance,
        ));
    }

    log::info!("[Extraction] 转换完成: {} 条候选记忆", candidates.len());
    candidates
}

pub fn format_conversation_for_extraction(messages: &[ConversationMessage]) -> String {
    messages
        .iter()
        .map(|m| format!("{}: {}", m.role, m.content))
        .collect::<Vec<_>>()
        .join("\n\n")
}
