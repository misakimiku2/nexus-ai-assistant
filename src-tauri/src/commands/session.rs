use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::memory::MemoryStorage;
use crate::models::{ChatSession, Message, ChatFolder};

pub struct SessionState {
    pub storage: Arc<Mutex<MemoryStorage>>,
}

impl SessionState {
    pub fn new(storage: MemoryStorage) -> Self {
        Self {
            storage: Arc::new(Mutex::new(storage)),
        }
    }
}

#[tauri::command]
pub async fn save_session(
    session: ChatSession,
    state: State<'_, SessionState>,
) -> Result<(), String> {
    let storage = state.storage.lock().await;
    storage.save_session(&session).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_sessions(
    state: State<'_, SessionState>,
) -> Result<Vec<ChatSession>, String> {
    let storage = state.storage.lock().await;
    storage.load_sessions().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_session(
    session_id: String,
    state: State<'_, SessionState>,
) -> Result<(), String> {
    let storage = state.storage.lock().await;
    storage.delete_session(&session_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_messages(
    session_id: String,
    messages: Vec<Message>,
    state: State<'_, SessionState>,
) -> Result<(), String> {
    let storage = state.storage.lock().await;
    storage.save_messages(&session_id, &messages).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_messages(
    session_id: String,
    state: State<'_, SessionState>,
) -> Result<Vec<Message>, String> {
    let storage = state.storage.lock().await;
    storage.load_messages(&session_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_folder(
    folder: ChatFolder,
    state: State<'_, SessionState>,
) -> Result<(), String> {
    let storage = state.storage.lock().await;
    storage.save_folder(&folder).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_folders(
    state: State<'_, SessionState>,
) -> Result<Vec<ChatFolder>, String> {
    let storage = state.storage.lock().await;
    storage.load_folders().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_folder(
    folder_id: String,
    state: State<'_, SessionState>,
) -> Result<(), String> {
    let storage = state.storage.lock().await;
    storage.delete_folder(&folder_id).await.map_err(|e| e.to_string())
}
