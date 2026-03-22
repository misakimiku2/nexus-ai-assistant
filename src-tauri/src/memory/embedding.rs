use thiserror::Error;

#[derive(Debug, Error)]
pub enum EmbeddingError {
    #[error("Embedding service not initialized")]
    NotInitialized,
    #[error("Failed to generate embedding: {0}")]
    GenerationFailed(String),
    #[error("Model loading failed: {0}")]
    ModelLoadFailed(String),
}

#[derive(Debug, Clone)]
pub struct EmbeddingService {
    initialized: bool,
    embedding_dim: usize,
}

impl EmbeddingService {
    pub fn new() -> Self {
        log::info!("[EmbeddingService] 创建向量服务实例 (dummy模式)");
        Self {
            initialized: true,
            embedding_dim: 384,
        }
    }

    pub async fn initialize(&mut self) -> Result<(), EmbeddingError> {
        log::info!("[EmbeddingService] 初始化向量服务...");
        self.initialized = true;
        log::info!("[EmbeddingService] 向量服务初始化完成 (embedding_dim={})", self.embedding_dim);
        Ok(())
    }

    pub async fn embed(&self, text: &str) -> Result<Vec<f32>, EmbeddingError> {
        if !self.initialized {
            return Err(EmbeddingError::NotInitialized);
        }

        let embedding = self.dummy_embed(text);
        log::debug!("[EmbeddingService] 生成向量: text_len={}, dim={}", text.len(), embedding.len());
        Ok(embedding)
    }

    pub async fn embed_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>, EmbeddingError> {
        let mut embeddings = Vec::new();
        for text in texts {
            embeddings.push(self.embed(text).await?);
        }
        Ok(embeddings)
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
