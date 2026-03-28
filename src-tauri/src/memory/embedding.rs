use thiserror::Error;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use std::collections::HashMap;
use std::io::Write;
use candle_core::{Device, Tensor, DType};
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{BertModel, Config, DTYPE};
use tokenizers::Tokenizer;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use sha2::{Sha256, Digest};

#[derive(Debug, Error)]
pub enum EmbeddingError {
    #[error("Embedding service not initialized")]
    NotInitialized,
    #[error("Failed to generate embedding: {0}")]
    GenerationFailed(String),
    #[error("Model loading failed: {0}")]
    ModelLoadFailed(String),
    #[error("Tokenizer loading failed: {0}")]
    TokenizerLoadFailed(String),
    #[error("Device error: {0}")]
    DeviceError(String),
    #[error("Tensor error: {0}")]
    TensorError(String),
    #[error("Model download failed: {0}")]
    DownloadFailed(String),
    #[error("Download was cancelled")]
    DownloadCancelled,
    #[error("Download is already in progress")]
    DownloadInProgress,
    #[error("File integrity check failed: {0}")]
    IntegrityCheckFailed(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadState {
    Idle,
    Downloading,
    Paused,
    Completed,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub model_id: String,
    pub filename: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percentage: f32,
    pub speed_bps: u64,
    pub eta_seconds: u64,
    pub state: DownloadState,
    pub error_message: Option<String>,
}

impl Default for DownloadProgress {
    fn default() -> Self {
        Self {
            model_id: String::new(),
            filename: String::new(),
            downloaded_bytes: 0,
            total_bytes: 0,
            percentage: 0.0,
            speed_bps: 0,
            eta_seconds: 0,
            state: DownloadState::Idle,
            error_message: None,
        }
    }
}

#[derive(Debug, Clone)]
struct DownloadTask {
    progress: DownloadProgress,
    cancel_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    start_time: Instant,
    last_update_time: Instant,
    last_downloaded_bytes: u64,
}

pub struct DownloadManager {
    tasks: Mutex<HashMap<String, DownloadTask>>,
}

impl DownloadManager {
    pub fn new() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
        }
    }

    pub async fn start_download(&self, model_id: &str, filename: &str) -> Result<Arc<AtomicBool>, EmbeddingError> {
        let mut tasks = self.tasks.lock().await;
        
        if let Some(task) = tasks.get(model_id) {
            if task.progress.state == DownloadState::Downloading || task.progress.state == DownloadState::Paused {
                return Err(EmbeddingError::DownloadInProgress);
            }
            // 如果是其他状态（Error, Completed, Idle），移除旧任务允许重新下载
            tasks.remove(model_id);
        }

        let cancel_flag = Arc::new(AtomicBool::new(false));
        let pause_flag = Arc::new(AtomicBool::new(false));
        
        let progress = DownloadProgress {
            model_id: model_id.to_string(),
            filename: filename.to_string(),
            state: DownloadState::Downloading,
            ..Default::default()
        };

        let task = DownloadTask {
            progress,
            cancel_flag: cancel_flag.clone(),
            pause_flag: pause_flag.clone(),
            start_time: Instant::now(),
            last_update_time: Instant::now(),
            last_downloaded_bytes: 0,
        };

        tasks.insert(model_id.to_string(), task);
        Ok(cancel_flag)
    }

    pub async fn update_progress(&self, model_id: &str, downloaded: u64, total: u64) -> Option<DownloadProgress> {
        let mut tasks = self.tasks.lock().await;
        
        if let Some(task) = tasks.get_mut(model_id) {
            let now = Instant::now();
            let elapsed = now.duration_since(task.last_update_time).as_secs_f64();
            
            let speed = if elapsed >= 0.5 {
                let bytes_diff = downloaded.saturating_sub(task.last_downloaded_bytes);
                let instant_speed = bytes_diff as f64 / elapsed;
                let smoothed_speed = task.progress.speed_bps as f64 * 0.7 + instant_speed * 0.3;
                smoothed_speed as u64
            } else {
                task.progress.speed_bps
            };

            let remaining_bytes = total.saturating_sub(downloaded);
            let eta = if speed > 0 {
                remaining_bytes / speed
            } else {
                0
            };

            let percentage = if total > 0 {
                (downloaded as f64 / total as f64 * 100.0) as f32
            } else {
                0.0
            };

            task.progress.downloaded_bytes = downloaded;
            task.progress.total_bytes = total;
            task.progress.percentage = percentage;
            task.progress.speed_bps = speed;
            task.progress.eta_seconds = eta;
            
            if elapsed >= 0.5 {
                task.last_update_time = now;
                task.last_downloaded_bytes = downloaded;
            }

            Some(task.progress.clone())
        } else {
            None
        }
    }

    pub async fn update_overall_progress(&self, model_id: &str, overall_downloaded: u64, overall_total: u64, current_filename: &str) -> Option<DownloadProgress> {
        let mut tasks = self.tasks.lock().await;
        
        if let Some(task) = tasks.get_mut(model_id) {
            let now = Instant::now();
            let elapsed = now.duration_since(task.last_update_time).as_secs_f64();
            
            let speed = if elapsed >= 0.5 {
                let bytes_diff = overall_downloaded.saturating_sub(task.last_downloaded_bytes);
                let instant_speed = bytes_diff as f64 / elapsed;
                let smoothed_speed = task.progress.speed_bps as f64 * 0.7 + instant_speed * 0.3;
                smoothed_speed as u64
            } else {
                task.progress.speed_bps
            };

            let remaining_bytes = overall_total.saturating_sub(overall_downloaded);
            let eta = if speed > 0 {
                remaining_bytes / speed
            } else {
                0
            };

            let percentage = if overall_total > 0 {
                (overall_downloaded as f64 / overall_total as f64 * 100.0) as f32
            } else {
                0.0
            };

            task.progress.downloaded_bytes = overall_downloaded;
            task.progress.total_bytes = overall_total;
            task.progress.percentage = percentage;
            task.progress.speed_bps = speed;
            task.progress.eta_seconds = eta;
            task.progress.filename = current_filename.to_string();
            
            if elapsed >= 0.5 {
                task.last_update_time = now;
                task.last_downloaded_bytes = overall_downloaded;
            }

            Some(task.progress.clone())
        } else {
            None
        }
    }

    pub async fn set_state(&self, model_id: &str, state: DownloadState) {
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.get_mut(model_id) {
            task.progress.state = state;
        }
    }

    pub async fn set_error(&self, model_id: &str, error: String) {
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.get_mut(model_id) {
            task.progress.state = DownloadState::Error;
            task.progress.error_message = Some(error);
        }
    }

    pub async fn get_progress(&self, model_id: &str) -> Option<DownloadProgress> {
        let tasks = self.tasks.lock().await;
        tasks.get(model_id).map(|t| t.progress.clone())
    }

    pub async fn pause_download(&self, model_id: &str) -> Result<(), EmbeddingError> {
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.get_mut(model_id) {
            if task.progress.state == DownloadState::Downloading {
                task.pause_flag.store(true, Ordering::SeqCst);
                task.progress.state = DownloadState::Paused;
                Ok(())
            } else {
                Err(EmbeddingError::DownloadFailed("Download is not in progress".to_string()))
            }
        } else {
            Err(EmbeddingError::DownloadFailed("No download task found".to_string()))
        }
    }

    pub async fn resume_download(&self, model_id: &str) -> Result<Arc<AtomicBool>, EmbeddingError> {
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.get_mut(model_id) {
            if task.progress.state == DownloadState::Paused {
                task.pause_flag.store(false, Ordering::SeqCst);
                task.progress.state = DownloadState::Downloading;
                task.last_update_time = Instant::now();
                Ok(task.cancel_flag.clone())
            } else {
                Err(EmbeddingError::DownloadFailed("Download is not paused".to_string()))
            }
        } else {
            Err(EmbeddingError::DownloadFailed("No download task found".to_string()))
        }
    }

    pub async fn cancel_download(&self, model_id: &str) -> Result<(), EmbeddingError> {
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.get_mut(model_id) {
            task.cancel_flag.store(true, Ordering::SeqCst);
            task.pause_flag.store(false, Ordering::SeqCst);
            task.progress.state = DownloadState::Idle;
            Ok(())
        } else {
            Err(EmbeddingError::DownloadFailed("No download task found".to_string()))
        }
    }

    pub async fn get_pause_flag(&self, model_id: &str) -> Option<Arc<AtomicBool>> {
        let tasks = self.tasks.lock().await;
        tasks.get(model_id).map(|t| t.pause_flag.clone())
    }

    pub async fn remove_task(&self, model_id: &str) {
        let mut tasks = self.tasks.lock().await;
        tasks.remove(model_id);
    }
}

impl Default for DownloadManager {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum EmbeddingProvider {
    Dummy,
    Local { model_id: String },
}

impl Default for EmbeddingProvider {
    fn default() -> Self {
        Self::Local {
            model_id: "BAAI/bge-small-zh-v1.5".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct EmbeddingConfig {
    pub provider: EmbeddingProvider,
    pub embedding_dim: usize,
    pub max_seq_length: usize,
}

impl Default for EmbeddingConfig {
    fn default() -> Self {
        Self {
            provider: EmbeddingProvider::default(),
            embedding_dim: 512,
            max_seq_length: 512,
        }
    }
}

struct LocalModel {
    model: BertModel,
    tokenizer: Tokenizer,
    device: Device,
}

pub struct EmbeddingService {
    initialized: bool,
    embedding_dim: usize,
    provider: EmbeddingProvider,
    local_model: Option<Arc<LocalModel>>,
}

impl Clone for EmbeddingService {
    fn clone(&self) -> Self {
        Self {
            initialized: self.initialized,
            embedding_dim: self.embedding_dim,
            provider: self.provider.clone(),
            local_model: self.local_model.clone(),
        }
    }
}

pub fn get_model_cache_dir() -> PathBuf {
    let cache_dir = dirs::cache_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("nexus-ai-assistant")
        .join("embedding-models");
    
    if !cache_dir.exists() {
        let _ = std::fs::create_dir_all(&cache_dir);
    }
    
    cache_dir
}

pub fn get_model_dir(model_id: &str) -> PathBuf {
    get_model_cache_dir().join(model_id.replace('/', "_"))
}

pub fn check_model_files_exist(model_id: &str) -> bool {
    let model_dir = get_model_dir(model_id);
    
    let model_exists = model_dir.join("model.safetensors").exists() 
        || model_dir.join("pytorch_model.bin").exists();
    let config_exists = model_dir.join("config.json").exists();
    let tokenizer_exists = model_dir.join("tokenizer.json").exists();
    
    model_exists && config_exists && tokenizer_exists
}

pub fn verify_file_integrity(file_path: &PathBuf, expected_size: Option<u64>) -> Result<bool, EmbeddingError> {
    if !file_path.exists() {
        return Ok(false);
    }

    let metadata = std::fs::metadata(file_path)
        .map_err(|e| EmbeddingError::IntegrityCheckFailed(e.to_string()))?;

    if let Some(expected) = expected_size {
        if metadata.len() < expected {
            return Ok(false);
        }
    }

    Ok(true)
}

pub fn calculate_file_hash(file_path: &PathBuf) -> Result<String, EmbeddingError> {
    let mut file = std::fs::File::open(file_path)
        .map_err(|e| EmbeddingError::IntegrityCheckFailed(e.to_string()))?;
    
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)
        .map_err(|e| EmbeddingError::IntegrityCheckFailed(e.to_string()))?;
    
    let hash = hasher.finalize();
    Ok(format!("{:x}", hash))
}

pub fn delete_model_files(model_id: &str) -> Result<(), EmbeddingError> {
    let model_dir = get_model_dir(model_id);
    
    if model_dir.exists() {
        std::fs::remove_dir_all(&model_dir)
            .map_err(|e| EmbeddingError::DownloadFailed(format!("Failed to delete model files: {}", e)))?;
        log::info!("[EmbeddingService] 已删除模型文件: {:?}", model_dir);
    }
    
    Ok(())
}

pub fn get_temp_file_path(file_path: &PathBuf) -> PathBuf {
    let mut temp_path = file_path.clone();
    let file_name = temp_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("temp");
    let temp_name = format!("{}.downloading", file_name);
    temp_path.set_file_name(temp_name);
    temp_path
}

pub fn cleanup_temp_files(model_id: &str) {
    let model_dir = get_model_dir(model_id);
    
    if model_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&model_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.ends_with(".downloading") {
                        let _ = std::fs::remove_file(&path);
                        log::info!("[EmbeddingService] 清理临时文件: {:?}", path);
                    }
                }
            }
        }
    }
}

fn download_from_modelscope(model_id: &str, filename: &str) -> Result<PathBuf, EmbeddingError> {
    let cache_dir = get_model_cache_dir();
    let model_dir = cache_dir.join(model_id.replace('/', "_"));
    
    if !model_dir.exists() {
        let _ = std::fs::create_dir_all(&model_dir);
    }
    
    let file_path = model_dir.join(filename);
    
    if file_path.exists() {
        log::info!("[EmbeddingService] 文件已存在: {:?}", file_path);
        return Ok(file_path);
    }
    
    let url = format!(
        "https://modelscope.cn/models/{}/resolve/master/{}",
        model_id, filename
    );
    
    log::info!("[EmbeddingService] 从 ModelScope 下载: {}", url);
    
    let response = reqwest::blocking::Client::new()
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .map_err(|e| EmbeddingError::DownloadFailed(format!("Request failed: {}", e)))?;
    
    if !response.status().is_success() {
        return Err(EmbeddingError::DownloadFailed(format!(
            "Download failed with status: {}",
            response.status()
        )));
    }
    
    let bytes = response.bytes()
        .map_err(|e| EmbeddingError::DownloadFailed(format!("Read response failed: {}", e)))?;
    
    std::fs::write(&file_path, &bytes)
        .map_err(|e| EmbeddingError::DownloadFailed(format!("Write file failed: {}", e)))?;
    
    log::info!("[EmbeddingService] 文件下载完成: {:?}", file_path);
    Ok(file_path)
}

pub async fn download_model_file_with_progress<F>(
    model_id: &str,
    filename: &str,
    download_manager: Arc<DownloadManager>,
    progress_callback: F,
) -> Result<PathBuf, EmbeddingError>
where
    F: Fn(DownloadProgress) + Send + 'static,
{
    let model_dir = get_model_dir(model_id);
    
    if !model_dir.exists() {
        let _ = std::fs::create_dir_all(&model_dir);
    }
    
    let file_path = model_dir.join(filename);
    
    if file_path.exists() {
        log::info!("[EmbeddingService] 文件已存在: {:?}", file_path);
        return Ok(file_path);
    }

    let temp_path = get_temp_file_path(&file_path);
    
    let cancel_flag = download_manager.start_download(model_id, filename).await?;
    
    let url = format!(
        "https://modelscope.cn/models/{}/resolve/master/{}",
        model_id, filename
    );
    
    log::info!("[EmbeddingService::Async] 开始下载 (带进度): {}", url);

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| {
            let _ = futures::executor::block_on(download_manager.set_error(model_id, e.to_string()));
            EmbeddingError::DownloadFailed(format!("Request failed: {}", e))
        })?;
    
    if !response.status().is_success() {
        let error = format!("Download failed with status: {}", response.status());
        download_manager.set_error(model_id, error.clone()).await;
        return Err(EmbeddingError::DownloadFailed(error));
    }

    let total_size = response.content_length().unwrap_or(0);
    
    let mut file = std::fs::File::create(&temp_path).map_err(|e| {
        let _ = futures::executor::block_on(download_manager.set_error(model_id, e.to_string()));
        EmbeddingError::DownloadFailed(format!("Failed to create temp file: {}", e))
    })?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    use futures::StreamExt;

    while let Some(chunk) = stream.next().await {
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = file.flush();
            drop(file);
            let _ = std::fs::remove_file(&temp_path);
            download_manager.remove_task(model_id).await;
            return Err(EmbeddingError::DownloadCancelled);
        }

        let pause_flag = download_manager.get_pause_flag(model_id).await;
        if let Some(flag) = pause_flag {
            while flag.load(Ordering::SeqCst) {
                tokio::time::sleep(Duration::from_millis(100)).await;
                
                if cancel_flag.load(Ordering::SeqCst) {
                    let _ = file.flush();
                    drop(file);
                    let _ = std::fs::remove_file(&temp_path);
                    download_manager.remove_task(model_id).await;
                    return Err(EmbeddingError::DownloadCancelled);
                }
            }
        }

        let chunk = chunk.map_err(|e| {
            let _ = futures::executor::block_on(download_manager.set_error(model_id, e.to_string()));
            EmbeddingError::DownloadFailed(format!("Failed to read chunk: {}", e))
        })?;

        file.write_all(&chunk).map_err(|e| {
            let _ = futures::executor::block_on(download_manager.set_error(model_id, e.to_string()));
            EmbeddingError::DownloadFailed(format!("Failed to write chunk: {}", e))
        })?;

        downloaded += chunk.len() as u64;

        if let Some(progress) = download_manager.update_progress(model_id, downloaded, total_size).await {
            progress_callback(progress);
        }
    }

    let _ = file.flush();
    drop(file);

    std::fs::rename(&temp_path, &file_path).map_err(|e| {
        let _ = futures::executor::block_on(download_manager.set_error(model_id, e.to_string()));
        EmbeddingError::DownloadFailed(format!("Failed to rename temp file: {}", e))
    })?;

    download_manager.set_state(model_id, DownloadState::Completed).await;
    
    log::info!("[EmbeddingService::Async] 文件下载完成: {:?}", file_path);
    Ok(file_path)
}

impl EmbeddingService {
    pub fn new() -> Self {
        log::info!("[EmbeddingService] 创建向量服务实例");
        Self {
            initialized: false,
            embedding_dim: 512,
            provider: EmbeddingProvider::Dummy,
            local_model: None,
        }
    }

    pub fn with_config(config: EmbeddingConfig) -> Result<Self, EmbeddingError> {
        log::info!("[EmbeddingService] 创建向量服务实例, provider: {:?}", config.provider);
        
        let mut service = Self {
            initialized: false,
            embedding_dim: config.embedding_dim,
            provider: config.provider.clone(),
            local_model: None,
        };

        if matches!(config.provider, EmbeddingProvider::Local { .. }) {
            match service.load_local_model(&config) {
                Ok(model) => {
                    service.local_model = Some(Arc::new(model));
                    service.initialized = true;
                    log::info!("[EmbeddingService] 本地模型加载成功");
                }
                Err(e) => {
                    log::warn!("[EmbeddingService] 本地模型加载失败，将使用 dummy 模式: {}", e);
                    service.provider = EmbeddingProvider::Dummy;
                    service.initialized = true;
                }
            }
        } else {
            service.initialized = true;
        }

        Ok(service)
    }

    fn load_local_model(&self, config: &EmbeddingConfig) -> Result<LocalModel, EmbeddingError> {
        let model_id = match &config.provider {
            EmbeddingProvider::Local { model_id } => model_id.clone(),
            _ => return Err(EmbeddingError::ModelLoadFailed("Invalid provider".to_string())),
        };

        log::info!("[EmbeddingService] 正在加载本地模型: {}", model_id);

        let device = Device::cuda_if_available(0)
            .unwrap_or(Device::Cpu);
        
        log::info!("[EmbeddingService] 使用设备: {:?}", device);

        let model_dir = get_model_dir(&model_id);
        
        let model_path = model_dir.join("model.safetensors");
        let alt_model_path = model_dir.join("pytorch_model.bin");
        let config_path = model_dir.join("config.json");
        let tokenizer_path = model_dir.join("tokenizer.json");

        if !config_path.exists() || !tokenizer_path.exists() {
            return Err(EmbeddingError::ModelLoadFailed(
                "Model files not found. Please download the model first.".to_string()
            ));
        }

        let model_file = if model_path.exists() {
            model_path
        } else if alt_model_path.exists() {
            alt_model_path
        } else {
            return Err(EmbeddingError::ModelLoadFailed(
                "Model weights file not found. Please download the model first.".to_string()
            ));
        };

        log::info!("[EmbeddingService] 加载模型文件: {:?}", model_file);

        let config_content = std::fs::read_to_string(&config_path)
            .map_err(|e| EmbeddingError::ModelLoadFailed(e.to_string()))?;
        let model_config: Config = serde_json::from_str(&config_content)
            .map_err(|e| EmbeddingError::ModelLoadFailed(e.to_string()))?;

        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&[model_file.clone()], DTYPE, &device)
                .or_else(|_| {
                    VarBuilder::from_pth(&model_file, DTYPE, &device)
                })
                .map_err(|e| EmbeddingError::ModelLoadFailed(e.to_string()))?
        };

        let model = BertModel::load(vb, &model_config)
            .map_err(|e| EmbeddingError::ModelLoadFailed(e.to_string()))?;

        let mut tokenizer = Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| EmbeddingError::TokenizerLoadFailed(e.to_string()))?;
        
        let truncation_params = tokenizers::TruncationParams {
            max_length: config.max_seq_length,
            ..Default::default()
        };
        tokenizer.with_truncation(Some(truncation_params))
            .map_err(|e| EmbeddingError::TokenizerLoadFailed(e.to_string()))?;

        log::info!("[EmbeddingService] 本地模型加载完成");

        Ok(LocalModel {
            model,
            tokenizer,
            device,
        })
    }

    pub async fn initialize(&mut self) -> Result<(), EmbeddingError> {
        log::info!("[EmbeddingService] 初始化向量服务...");
        
        if matches!(self.provider, EmbeddingProvider::Local { .. }) && self.local_model.is_none() {
            let config = EmbeddingConfig {
                provider: self.provider.clone(),
                embedding_dim: self.embedding_dim,
                max_seq_length: 512,
            };
            
            match self.load_local_model(&config) {
                Ok(model) => {
                    self.local_model = Some(Arc::new(model));
                    log::info!("[EmbeddingService] 本地模型加载成功");
                }
                Err(e) => {
                    log::warn!("[EmbeddingService] 本地模型加载失败，使用 dummy 模式: {}", e);
                    self.provider = EmbeddingProvider::Dummy;
                }
            }
        }
        
        self.initialized = true;
        log::info!("[EmbeddingService] 向量服务初始化完成 (provider={:?}, embedding_dim={})", 
            self.provider, self.embedding_dim);
        Ok(())
    }

    pub async fn embed(&self, text: &str) -> Result<Vec<f32>, EmbeddingError> {
        if !self.initialized {
            return Err(EmbeddingError::NotInitialized);
        }

        match &self.provider {
            EmbeddingProvider::Dummy => {
                let embedding = self.dummy_embed(text);
                log::debug!("[EmbeddingService] Dummy embed: text_len={}, dim={}", text.len(), embedding.len());
                Ok(embedding)
            }
            EmbeddingProvider::Local { .. } => {
                let model = self.local_model.as_ref()
                    .ok_or_else(|| EmbeddingError::NotInitialized)?;
                self.local_embed(text, model)
            }
        }
    }

    pub async fn embed_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>, EmbeddingError> {
        let mut embeddings = Vec::new();
        for text in texts {
            embeddings.push(self.embed(text).await?);
        }
        Ok(embeddings)
    }

    fn local_embed(&self, text: &str, local_model: &LocalModel) -> Result<Vec<f32>, EmbeddingError> {
        let tokenizer = &local_model.tokenizer;
        let model = &local_model.model;
        let device = &local_model.device;

        let encoded = tokenizer.encode(text, true)
            .map_err(|e| EmbeddingError::GenerationFailed(e.to_string()))?;

        let input_ids = encoded.get_ids();
        let attention_mask = encoded.get_attention_mask();
        let token_type_ids = encoded.get_type_ids();

        let input_ids_tensor = Tensor::new(
            input_ids, 
            device
        ).map_err(|e| EmbeddingError::TensorError(e.to_string()))?
            .unsqueeze(0)
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let attention_mask_tensor = Tensor::new(
            attention_mask, 
            device
        ).map_err(|e| EmbeddingError::TensorError(e.to_string()))?
            .unsqueeze(0)
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let token_type_ids_tensor = Tensor::new(
            token_type_ids, 
            device
        ).map_err(|e| EmbeddingError::TensorError(e.to_string()))?
            .unsqueeze(0)
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let embeddings = model.forward(&input_ids_tensor, &token_type_ids_tensor, Some(&attention_mask_tensor))
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let attention_mask_float = attention_mask_tensor
            .to_dtype(DType::F32)
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let mask_sum = attention_mask_float.sum(1)
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let mask_sum = mask_sum.unsqueeze(1)
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let (_, seq_len, hidden_dim) = embeddings.dims3()
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let attention_mask_expanded = attention_mask_float
            .unsqueeze(2)
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?
            .expand((1, seq_len, hidden_dim))
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let weighted = (&embeddings * &attention_mask_expanded)
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let sum_embedding = weighted.sum(1)
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let mean_embedding = sum_embedding.broadcast_div(&mask_sum)
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let norm = mean_embedding.sqr()
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?
            .sum(1)
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?
            .sqrt()
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let normalized = mean_embedding
            .broadcast_div(&norm)
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let normalized_1d = normalized.squeeze(0)
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        let embedding_vec = normalized_1d.to_vec1::<f32>()
            .map_err(|e| EmbeddingError::TensorError(e.to_string()))?;

        log::debug!("[EmbeddingService] Local embed: text_len={}, dim={}", text.len(), embedding_vec.len());
        Ok(embedding_vec)
    }

    fn dummy_embed(&self, text: &str) -> Vec<f32> {
        let mut embedding = vec![0.0f32; self.embedding_dim];
        
        let bytes = text.as_bytes();
        for (i, byte) in bytes.iter().enumerate() {
            if i >= self.embedding_dim {
                break;
            }
            embedding[i] = (*byte as f32) / 255.0;
        }

        let norm: f32 = embedding.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for val in embedding.iter_mut() {
                *val /= norm;
            }
        }

        embedding
    }

    pub fn get_embedding_dim(&self) -> usize {
        self.embedding_dim
    }

    pub fn is_initialized(&self) -> bool {
        self.initialized
    }

    pub fn get_provider(&self) -> &EmbeddingProvider {
        &self.provider
    }
}

impl Default for EmbeddingService {
    fn default() -> Self {
        Self::new()
    }
}

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }

    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot / (norm_a * norm_b)
    }
}

pub fn get_default_model_path() -> PathBuf {
    get_model_cache_dir()
}

pub fn get_available_models() -> Vec<(&'static str, &'static str, usize)> {
    vec![
        ("BAAI/bge-small-zh-v1.5", "BGE-small-zh-v1.5 (中文, 512维, 推荐)", 512),
        ("BAAI/bge-base-zh-v1.5", "BGE-base-zh-v1.5 (中文, 768维, 平衡)", 768),
        ("BAAI/bge-large-zh-v1.5", "BGE-large-zh-v1.5 (中文, 1024维, 高质量)", 1024),
        ("sentence-transformers/all-MiniLM-L6-v2", "MiniLM-L6-v2 (英文, 384维, 快速)", 384),
        ("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", "多语言 MiniLM (多语言, 384维)", 384),
    ]
}
