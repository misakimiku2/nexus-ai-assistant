use crate::models::{
    CandidateMemory, ConversationMessage, ExtractionConfig, ExtractedMemory, 
    ExtractedItem, MemoryItem, MemoryType,
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
【只允许提取以下4类】
1. identity（身份特征）- 稳定身份信息
2. preference（用户偏好） - 长期兴趣、喜好
3. constraint（限制条件） - 会影响决策的条件
4. fact（用户事实） - 与用户直接相关的客观事实
【严禁提取以下内容】
- 模型推断（如："擅长摄影")
- 常识/世界知识（如："杭州夏天很热")
- 稡型推断/短期计划
- AI生成内容
【数量限制】
- identity: ≤2 条
- facts: ≤3 条
- preferences: ≤3 条
- constraints: ≤2 条
- 总计 ≤8 条
【强制要求】
如果提取结果超过 8 条，请只保留最重要的 8 条,其余丢弃。
【合并规则】
禁止拆分细粒度事实,应合并为一条：
错误："今汐有叠层机制"、"守岸人能回血"、"维里奈能闪避"
正确："游戏包含多种角色机制（叠层爆发、护盾、闪避等）"
【输入对话】
{conversation}
【输出格式】直接输出以下 JSON 结构：
{
  "identity": [{"content": "...", "importance": 0.7-1.0}],
  "facts": [{"content": "...", "importance": 0.7-1.0}],
  "preferences": [{"content": "...", "importance": 0.7-1.0}],
  "constraints": [{"content": "...", "importance": 0.7-1.0}]
}
【类别定义】
- identity: 长期稳定的用户身份、职业、角色
- facts: 客观信息（项目、工具、环境）
- preferences: 选择倾向或习惯
- constraints: 限制、资源约束
【评分规则】
- importance: 0.7-1.0，越高越重要（最低 0.7)
- content: 最少 10 个字符
- 空类别返回 []
现在输出 JSON:
"#;
