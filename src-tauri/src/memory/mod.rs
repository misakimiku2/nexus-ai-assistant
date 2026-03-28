mod storage;
mod embedding;
mod extraction;
mod retrieval;
mod lifecycle;
mod candidate_storage;
mod scoring;
mod llm_client;
mod conflict;
mod merge;
mod working_set;
mod deduplication;

pub use storage::*;
pub use embedding::{
    EmbeddingService, EmbeddingError, EmbeddingProvider, EmbeddingConfig, 
    cosine_similarity, get_default_model_path, get_available_models,
    DownloadState, DownloadProgress, DownloadManager,
    get_model_cache_dir, get_model_dir, check_model_files_exist, 
    verify_file_integrity, calculate_file_hash, delete_model_files,
    get_temp_file_path, cleanup_temp_files, download_model_file_with_progress,
};
pub use extraction::*;
pub use retrieval::*;
pub use lifecycle::*;
pub use candidate_storage::*;
pub use scoring::*;
pub use llm_client::{LlmClient, LlmConfig};
pub use conflict::ConflictDetector;
pub use merge::MergeService;
pub use working_set::{WorkingSet, WorkingMemory, CommitResult};
pub use deduplication::{DeduplicationService, DeduplicationConfig};
