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

pub fn parse_extraction_response(response: &str) -> Result<crate::models::ExtractedMemory, Box<dyn std::error::Error>> {
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

    let extracted: crate::models::ExtractedMemory = serde_json::from_str(json_str)?;
    Ok(extracted)
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
}
