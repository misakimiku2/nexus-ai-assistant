use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileContent {
    pub content: String,
    pub size: u64,
}

#[tauri::command]
pub async fn read_file(path: String, encoding: Option<String>) -> Result<FileContent, String> {
    let file_path = Path::new(&path);
    
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }
    
    if !file_path.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }
    
    let metadata = fs::metadata(file_path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;
    
    let size = metadata.len();
    
    let content = match encoding.as_deref() {
        Some("base64") => {
            let bytes = fs::read(file_path)
                .map_err(|e| format!("Failed to read file: {}", e))?;
            use base64::{engine::general_purpose::STANDARD, Engine as _};
            STANDARD.encode(&bytes)
        }
        _ => {
            fs::read_to_string(file_path)
                .map_err(|e| format!("Failed to read file: {}", e))?
        }
    };
    
    Ok(FileContent { content, size })
}

#[tauri::command]
pub async fn write_file(path: String, content: String, encoding: Option<String>) -> Result<(), String> {
    let file_path = Path::new(&path);
    
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }
    
    match encoding.as_deref() {
        Some("base64") => {
            use base64::{engine::general_purpose::STANDARD, Engine as _};
            let bytes = STANDARD.decode(&content)
                .map_err(|e| format!("Failed to decode base64: {}", e))?;
            fs::write(file_path, bytes)
                .map_err(|e| format!("Failed to write file: {}", e))?;
        }
        _ => {
            fs::write(file_path, content)
                .map_err(|e| format!("Failed to write file: {}", e))?;
        }
    }
    
    Ok(())
}

#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileInfo>, String> {
    let dir_path = Path::new(&path);
    
    if !dir_path.exists() {
        return Err(format!("Directory not found: {}", path));
    }
    
    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }
    
    let entries = fs::read_dir(dir_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    let mut file_infos = Vec::new();
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let metadata = entry.metadata().map_err(|e| format!("Failed to get metadata: {}", e))?;
        
        let name = entry.file_name()
            .to_string_lossy()
            .to_string();
        
        file_infos.push(FileInfo {
            name,
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });
    }
    
    file_infos.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });
    
    Ok(file_infos)
}

#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    let file_path = Path::new(&path);
    
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }
    
    if file_path.is_dir() {
        fs::remove_dir_all(file_path)
            .map_err(|e| format!("Failed to remove directory: {}", e))?;
    } else {
        fs::remove_file(file_path)
            .map_err(|e| format!("Failed to remove file: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    let dir_path = Path::new(&path);
    
    fs::create_dir_all(dir_path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo, String> {
    let file_path = Path::new(&path);
    
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }
    
    let metadata = fs::metadata(file_path)
        .map_err(|e| format!("Failed to get metadata: {}", e))?;
    
    let name = file_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    
    Ok(FileInfo {
        name,
        is_dir: metadata.is_dir(),
        size: metadata.len(),
    })
}
