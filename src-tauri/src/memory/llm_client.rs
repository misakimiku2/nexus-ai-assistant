use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct LlmConfig {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub timeout_secs: u64,
    pub max_tokens: usize,
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
            timeout_secs: 60,
            max_tokens: 1500,
        }
    }
}

impl LlmConfig {
    pub fn from_env() -> Self {
        Self {
            api_key: std::env::var("OPENAI_API_KEY").unwrap_or_default(),
            base_url: std::env::var("OPENAI_BASE_URL")
                .unwrap_or_else(|_| "https://api.openai.com/v1".to_string()),
            model: std::env::var("OPENAI_MODEL")
                .unwrap_or_else(|_| "gpt-4o-mini".to_string()),
            timeout_secs: 60,
            max_tokens: 1500,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: usize,
}

#[derive(Debug, Clone, Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Clone, Deserialize)]
struct ChatChoice {
    message: ChatMessageResponse,
}

#[derive(Debug, Clone, Deserialize)]
struct ChatMessageResponse {
    content: String,
}

pub struct LlmClient {
    config: LlmConfig,
    client: reqwest::Client,
}

impl Clone for LlmClient {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            client: reqwest::Client::new(),
        }
    }
}

impl LlmClient {
    pub fn new(config: LlmConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(config.timeout_secs))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        
        Self { config, client }
    }

    pub fn from_env() -> Self {
        Self::new(LlmConfig::from_env())
    }

    pub async fn generate(&self, prompt: &str) -> Result<String, Box<dyn std::error::Error>> {
        if self.config.api_key.is_empty() {
            return Err("LLM API key not configured".into());
        }

        let request = ChatRequest {
            model: self.config.model.clone(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
            temperature: 0.1,
            max_tokens: self.config.max_tokens,
        };

        let url = format!("{}/chat/completions", self.config.base_url);
        
        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("LLM API error: {} - {}", status, body).into());
        }

        let chat_response: ChatResponse = response.json().await?;
        
        chat_response
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .ok_or_else(|| "No response from LLM".into())
    }

    pub async fn generate_json(&self, prompt: &str) -> Result<String, Box<dyn std::error::Error>> {
        let response = self.generate(prompt).await?;
        let extracted = extract_json_string(&response);
        Ok(extracted)
    }

    pub fn is_configured(&self) -> bool {
        !self.config.api_key.is_empty()
    }
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
    
    if let Some(start) = trimmed.find('[') {
        if let Some(end) = trimmed.rfind(']') {
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

pub fn parse_json_safely<T: for<'de> Deserialize<'de>>(text: &str) -> Result<T, Box<dyn std::error::Error>> {
    let json_str = extract_json_string(text);
    let parsed: T = serde_json::from_str(&json_str)?;
    Ok(parsed)
}
