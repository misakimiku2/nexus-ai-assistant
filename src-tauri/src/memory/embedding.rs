use thiserror::Error;
use std::path::PathBuf;
use std::sync::Arc;
use candle_core::{Device, Tensor, DType};
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{BertModel, Config, DTYPE};
use tokenizers::Tokenizer;

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

fn get_model_cache_dir() -> PathBuf {
    let cache_dir = dirs::cache_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("nexus-ai-assistant")
        .join("embedding-models");
    
    if !cache_dir.exists() {
        let _ = std::fs::create_dir_all(&cache_dir);
    }
    
    cache_dir
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

        log::info!("[EmbeddingService] 正在从 ModelScope 下载模型文件...");

        let model_path = download_from_modelscope(&model_id, "model.safetensors")
            .or_else(|_| download_from_modelscope(&model_id, "pytorch_model.bin"))?;

        let config_path = download_from_modelscope(&model_id, "config.json")?;

        let tokenizer_path = download_from_modelscope(&model_id, "tokenizer.json")?;

        log::info!("[EmbeddingService] 模型文件下载完成，正在加载...");

        let config_content = std::fs::read_to_string(&config_path)
            .map_err(|e| EmbeddingError::ModelLoadFailed(e.to_string()))?;
        let model_config: Config = serde_json::from_str(&config_content)
            .map_err(|e| EmbeddingError::ModelLoadFailed(e.to_string()))?;

        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&[model_path.clone()], DTYPE, &device)
                .or_else(|_| {
                    VarBuilder::from_pth(&model_path, DTYPE, &device)
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
