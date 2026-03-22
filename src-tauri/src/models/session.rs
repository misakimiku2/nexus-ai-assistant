use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    #[serde(rename = "folderId")]
    pub folder_id: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
    #[serde(rename = "activeAgents")]
    pub active_agents: Option<Vec<String>>,
}

impl ChatSession {
    pub fn new(title: String) -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            title,
            folder_id: None,
            created_at: now,
            updated_at: now,
            active_agents: None,
        }
    }

    pub fn with_folder(mut self, folder_id: String) -> Self {
        self.folder_id = Some(folder_id);
        self
    }

    pub fn with_agents(mut self, agents: Vec<String>) -> Self {
        self.active_agents = Some(agents);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: i64,
    pub metadata: Option<String>,
}

impl Message {
    pub fn new(session_id: String, role: String, content: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            session_id,
            role,
            content,
            timestamp: chrono::Utc::now().timestamp(),
            metadata: None,
        }
    }

    pub fn with_metadata(mut self, metadata: String) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFolder {
    pub id: String,
    pub name: String,
    #[serde(rename = "isExpanded")]
    pub is_expanded: bool,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
}

impl ChatFolder {
    pub fn new(name: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            is_expanded: true,
            created_at: chrono::Utc::now().timestamp(),
        }
    }
}
