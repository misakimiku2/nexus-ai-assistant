use std::collections::HashSet;
use crate::models::{
    CandidateMemory, ConversationMessage, ExtractionConfig, ExtractedMemory, 
    ExtractedItem, ExtractedTask, MemoryItem, MemoryType,
};

pub const COGNITIVE_MEMORY_EXTRACTION_PROMPT: &str = r#"
你是一个高级认知记忆提取系统（Cognitive Memory Extraction Engine）。

你的任务是从对话中提取"长期有价值的信息"，用于构建用户的长期记忆模型。

⚠️ 注意：
- 不要提取临时信息
- 不要依赖任何特定用户背景
- 所有示例仅用于说明结构，不代表当前用户

--------------------------------
【输入对话】
{conversation}
--------------------------------

请提取以下6类记忆，并以 JSON 输出：

{
  "identity": [],
  "facts": [],
  "preferences": [],
  "tasks": [],
  "constraints": [],
  "skills": []
}

--------------------------------
【定义】

1️⃣ identity（身份特征）
长期稳定的用户背景、角色或定位

示例：
- "用户从事软件开发"
- "用户是内容创作者"

--------------------------------

2️⃣ facts（事实）
用户提到的客观信息（项目、工具、环境）

示例：
- "用户正在开发一个Web应用"
- "用户使用本地模型进行AI开发"

--------------------------------

3️⃣ preferences（偏好）
用户的选择倾向或习惯

示例：
- "用户偏好简单直接的解决方案"
- "用户倾向使用本地部署而非云服务"

--------------------------------

4️⃣ tasks（任务）
用户正在进行的任务，必须使用结构化格式：

{
  "content": "任务描述",
  "status": "pending | in_progress | done",
  "progress": "当前进展（可选）",
  "next_step": "下一步（尽量推测）"
}

示例：
{
  "content": "开发一个AI助手",
  "status": "in_progress",
  "progress": "已完成基础对话功能",
  "next_step": "实现记忆模块"
}

--------------------------------

5️⃣ constraints（限制）
用户的限制、资源约束或能力边界

示例：
- "用户计算资源有限"
- "用户时间有限"

--------------------------------

6️⃣ skills（能力）
用户具备的能力或行为模式

示例：
- "用户具备基础编程能力"
- "用户能够使用AI工具辅助开发"

--------------------------------

【评分规则】

每条记忆必须包含：

{
  "content": "...",
  "importance": 0.0 - 1.0
}

--------------------------------

【去重与抽象】

- 避免重复
- 优先抽象而不是复述
- 提取"长期有价值"的信息

--------------------------------

【输出要求】

- 必须是合法 JSON
- 无解释文本
- 空类别返回 []

--------------------------------

现在开始提取。
"#;

pub fn format_extraction_prompt(conversation: &str) -> String {
    COGNITIVE_MEMORY_EXTRACTION_PROMPT.replace("{conversation}", conversation)
}

pub fn parse_extraction_response(response: &str) -> Result<ExtractedMemory, Box<dyn std::error::Error>> {
    let trimmed = response.trim();
    
    let json_str = if trimmed.starts_with("```json") {
        let end = trimmed.find("```").unwrap_or(trimmed.len());
        &trimmed[7..end].trim()
    } else if trimmed.starts_with("```") {
        let end = trimmed[7..].find("```").unwrap_or(trimmed.len() - 7);
        &trimmed[3..3 + end].trim()
    } else {
        trimmed
    };

    let extracted: ExtractedMemory = serde_json::from_str(json_str)?;
    Ok(extracted)
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
        let mut candidate = CandidateMemory::new(
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_extraction_prompt() {
        let conversation = "User: I'm building a web app.\nAssistant: That's great!";
        let prompt = format_extraction_prompt(conversation);
        assert!(prompt.contains(conversation));
        assert!(prompt.contains("identity"));
    }

    #[test]
    fn test_parse_extraction_response() {
        let response = r#"{"identity":[],"facts":[{"content":"User is building a web app","importance":0.8}],"preferences":[],"tasks":[],"constraints":[],"skills":[]}"#;
        let extracted = parse_extraction_response(response).unwrap();
        assert_eq!(extracted.facts.len(), 1);
        assert_eq!(extracted.facts[0].content, "User is building a web app");
    }

    #[test]
    fn test_should_extract() {
        let config = ExtractionConfig::default();
        
        let short_messages: Vec<ConversationMessage> = (0..3)
            .map(|i| ConversationMessage {
                id: format!("msg-{}", i),
                role: "user".to_string(),
                content: "Short".to_string(),
                is_tool_call: false,
            })
            .collect();
        assert!(!should_extract(&short_messages, &config));

        let mut good_messages: Vec<ConversationMessage> = (0..5)
            .map(|i| ConversationMessage {
                id: format!("msg-{}", i),
                role: if i % 2 == 0 { "user" } else { "assistant" }.to_string(),
                content: "This is a longer message with more content".to_string(),
                is_tool_call: false,
            })
            .collect();
        assert!(should_extract(&good_messages, &config));
    }

    #[test]
    fn test_calculate_confidence() {
        let confidence = calculate_confidence(
            "This is a longer piece of content for testing",
            &MemoryType::Identity,
            2,
        );
        assert!(confidence > 0.5);
        assert!(confidence <= 1.0);
    }

    #[test]
    fn test_check_duplicate_simple() {
        let existing = vec![MemoryItem::new(
            "User is building a web application".to_string(),
            MemoryType::Fact,
            0.8,
        )];

        assert!(check_duplicate_simple("User is building a web application", &existing).is_some());
        assert!(check_duplicate_simple("User is building a web application with React", &existing).is_some());
        assert!(check_duplicate_simple("User likes pizza", &existing).is_none());
    }

    #[test]
    fn test_keyword_overlap() {
        let overlap = calculate_keyword_overlap("user building web app", "user building mobile app");
        assert!(overlap > 0.5);

        let no_overlap = calculate_keyword_overlap("hello world", "foo bar");
        assert_eq!(no_overlap, 0.0);
    }
}
