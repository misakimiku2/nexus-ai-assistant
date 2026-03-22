use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use super::fetch::FetchResult;

const DEFAULT_MAX_ENTRIES: usize = 100;
const DEFAULT_TTL_SECS: u64 = 1800;

#[derive(Debug, Clone)]
pub struct CacheEntry {
    pub result: FetchResult,
    pub cached_at: Instant,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub last_accessed: Instant,
}

impl CacheEntry {
    pub fn new(result: FetchResult, etag: Option<String>, last_modified: Option<String>) -> Self {
        let now = Instant::now();
        Self {
            result,
            cached_at: now,
            etag,
            last_modified,
            last_accessed: now,
        }
    }

    pub fn is_expired(&self, ttl: Duration) -> bool {
        self.cached_at.elapsed() > ttl
    }

    pub fn touch(&mut self) {
        self.last_accessed = Instant::now();
    }
}

pub struct FetchCache {
    entries: Mutex<HashMap<String, CacheEntry>>,
    max_entries: usize,
    ttl: Duration,
}

impl FetchCache {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            max_entries: DEFAULT_MAX_ENTRIES,
            ttl: Duration::from_secs(DEFAULT_TTL_SECS),
        }
    }

    pub fn with_config(max_entries: usize, ttl_secs: u64) -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            max_entries,
            ttl: Duration::from_secs(ttl_secs),
        }
    }

    pub fn get(&self, url: &str) -> Option<CacheEntry> {
        let mut entries = self.entries.lock().ok()?;
        if let Some(entry) = entries.get_mut(url) {
            if entry.is_expired(self.ttl) {
                entries.remove(url);
                println!("[cache] Entry expired for: {}", url);
                return None;
            }
            entry.touch();
            println!("[cache] Cache hit for: {}", url);
            return Some(entry.clone());
        }
        println!("[cache] Cache miss for: {}", url);
        None
    }

    pub fn set(&self, url: String, result: FetchResult, etag: Option<String>, last_modified: Option<String>) {
        if let Ok(mut entries) = self.entries.lock() {
            if entries.len() >= self.max_entries {
                self.evict_lru(&mut entries);
            }
            let entry = CacheEntry::new(result, etag, last_modified);
            entries.insert(url, entry);
            println!("[cache] Cached entry, total: {}", entries.len());
        }
    }

    pub fn invalidate(&self, url: &str) -> bool {
        if let Ok(mut entries) = self.entries.lock() {
            if entries.remove(url).is_some() {
                println!("[cache] Invalidated: {}", url);
                return true;
            }
        }
        false
    }

    pub fn clear(&self) {
        if let Ok(mut entries) = self.entries.lock() {
            entries.clear();
            println!("[cache] Cache cleared");
        }
    }

    pub fn len(&self) -> usize {
        self.entries.lock().map(|e| e.len()).unwrap_or(0)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    fn evict_lru(&self, entries: &mut HashMap<String, CacheEntry>) {
        let mut oldest_key: Option<String> = None;
        let mut oldest_time = Instant::now();

        for (key, entry) in entries.iter() {
            if entry.last_accessed < oldest_time {
                oldest_time = entry.last_accessed;
                oldest_key = Some(key.clone());
            }
        }

        if let Some(key) = oldest_key {
            entries.remove(&key);
            println!("[cache] Evicted LRU entry: {}", key);
        }
    }
}

impl Default for FetchCache {
    fn default() -> Self {
        Self::new()
    }
}

use std::sync::OnceLock;

pub static GLOBAL_CACHE: OnceLock<FetchCache> = OnceLock::new();

pub fn get_global_cache() -> &'static FetchCache {
    GLOBAL_CACHE.get_or_init(|| FetchCache::new())
}
