use reqwest::Url;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use tauri::command;
use urlencoding::encode as url_encode;

use super::cache::get_global_cache;
use super::pdf;
use super::renderer;

const MIN_CONTENT_LENGTH: usize = 200;
const DEFAULT_MAX_LENGTH: usize = 8000;
const DEFAULT_TIMEOUT: u64 = 30000;
const DEFAULT_CHUNK_SIZE: usize = 4000;

fn encode_url_if_needed(url_str: &str) -> Result<String, String> {
    let parsed = Url::parse(url_str).map_err(|e| format!("Invalid URL: {}", e))?;
    
    let path = parsed.path();
    let query = parsed.query().unwrap_or("");
    let fragment = parsed.fragment().unwrap_or("");
    
    let path_needs_encoding = path.chars().any(|c| !c.is_ascii());
    let query_needs_encoding = query.chars().any(|c| !c.is_ascii());
    let fragment_needs_encoding = fragment.chars().any(|c| !c.is_ascii());
    
    if !path_needs_encoding && !query_needs_encoding && !fragment_needs_encoding {
        return Ok(url_str.to_string());
    }
    
    println!("[fetch_url] URL contains non-ASCII characters, encoding...");
    
    let mut encoded_url = String::new();
    encoded_url.push_str(parsed.scheme());
    encoded_url.push_str("://");
    
    if let Some(host) = parsed.host_str() {
        encoded_url.push_str(host);
    }
    
    if let Some(port) = parsed.port() {
        encoded_url.push(':');
        encoded_url.push_str(&port.to_string());
    }
    
    if path_needs_encoding {
        let encoded_path: String = path
            .split('/')
            .map(|segment| {
                if segment.is_empty() {
                    String::new()
                } else if segment.chars().all(|c| c.is_ascii()) {
                    segment.to_string()
                } else {
                    url_encode(segment).into_owned()
                }
            })
            .collect::<Vec<_>>()
            .join("/");
        encoded_url.push_str(&encoded_path);
    } else {
        encoded_url.push_str(path);
    }
    
    if let Some(q) = parsed.query() {
        encoded_url.push('?');
        if query_needs_encoding {
            let encoded_query: String = q
                .split('&')
                .map(|pair| {
                    if let Some((key, value)) = pair.split_once('=') {
                        let encoded_value = if value.chars().all(|c| c.is_ascii()) {
                            value.to_string()
                        } else {
                            url_encode(value).into_owned()
                        };
                        format!("{}={}", key, encoded_value)
                    } else if pair.chars().all(|c| c.is_ascii()) {
                        pair.to_string()
                    } else {
                        url_encode(pair).into_owned()
                    }
                })
                .collect::<Vec<_>>()
                .join("&");
            encoded_url.push_str(&encoded_query);
        } else {
            encoded_url.push_str(q);
        }
    }
    
    if let Some(f) = parsed.fragment() {
        encoded_url.push('#');
        if fragment_needs_encoding {
            encoded_url.push_str(&url_encode(f));
        } else {
            encoded_url.push_str(f);
        }
    }
    
    println!("[fetch_url] Encoded URL: {}", encoded_url);
    Ok(encoded_url)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentChunk {
    pub index: usize,
    pub content: String,
    pub is_last: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchMetadata {
    pub length: usize,
    pub domain: String,
    pub extraction_method: String,
    pub chunk_count: usize,
    pub truncated: bool,
    pub content_type: String,
    pub page_count: Option<usize>,
    pub cached: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchResult {
    pub success: bool,
    pub title: String,
    pub content: String,
    pub summary: Option<String>,
    pub content_chunks: Option<Vec<ContentChunk>>,
    pub metadata: FetchMetadata,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FetchOptions {
    pub max_length: Option<usize>,
    pub timeout: Option<u64>,
    pub user_agent: Option<String>,
    pub chunk_size: Option<usize>,
    pub use_cache: Option<bool>,
    pub force_refresh: Option<bool>,
    pub render_js: Option<bool>,
    pub js_render_timeout: Option<u64>,
}

fn is_safe_url(url_str: &str) -> Result<Url, String> {
    let parsed = Url::parse(url_str).map_err(|e| format!("Invalid URL: {}", e))?;

    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Only HTTP and HTTPS URLs are allowed".to_string());
    }

    if let Some(host) = parsed.host_str() {
        let blocked: &[&str] = &[
            "localhost",
            "127.0.0.1",
            "0.0.0.0",
            "10.",
            "172.16.",
            "192.168.",
            "::1",
            "fe80::",
            "169.254.",
        ];

        for pattern in blocked {
            if host.starts_with(pattern) || host == *pattern {
                return Err("Access to internal network is not allowed".to_string());
            }
        }
    }

    Ok(parsed)
}

fn clean_text(text: &str) -> String {
    text.lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn clean_html(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    let mut last_was_space = false;

    for c in html.chars() {
        match c {
            '<' => {
                in_tag = true;
                if !last_was_space {
                    result.push(' ');
                    last_was_space = true;
                }
            }
            '>' => {
                in_tag = false;
            }
            _ if !in_tag => {
                if c.is_whitespace() {
                    if !last_was_space {
                        result.push(' ');
                        last_was_space = true;
                    }
                } else {
                    result.push(c);
                    last_was_space = false;
                }
            }
            _ => {}
        }
    }

    clean_text(&result)
}

fn extract_with_readability(html: &str, url: &Url) -> Option<(String, String)> {
    use readability::extractor;

    let mut cursor = std::io::Cursor::new(html);
    let product = extractor::extract(&mut cursor, url).ok()?;
    let content = clean_html(&product.content);

    if content.len() >= MIN_CONTENT_LENGTH {
        Some((product.title, content))
    } else {
        None
    }
}

fn extract_with_scraper(html: &str) -> (String, String) {
    let document = Html::parse_document(html);

    let title = document
        .select(&Selector::parse("title").unwrap())
        .next()
        .map(|el| el.text().collect::<String>())
        .unwrap_or_default();

    let exclude_class_or_id: &[&str] = &[
        "navbox",
        "navbox-inner",
        "navigation",
        "mw-navigation",
        "catlinks",
        "mw-category",
        "sisterproject",
        "mbox-small",
        "mw-data-after-content",
        "mw-indicators",
        "printfooter",
        "mw-hidden-catlinks",
        "siteSub",
        "ambox",
        "ombox",
        "tmbox",
        "dmbox",
        "cmbox",
        "fmbox",
        "vertical-navbox",
        "sidebar",
        "mw-footer",
        "footer",
    ];

    fn has_excluded_class_or_id<'a>(el: scraper::ElementRef<'a>, exclude_list: &[&str]) -> bool {
        let mut current = Some(el);
        while let Some(node) = current {
            if let Some(id) = node.value().id() {
                let id_str: &str = &id;
                if exclude_list.contains(&id_str) {
                    return true;
                }
            }
            for class in node.value().classes() {
                let class_str: &str = &class;
                if exclude_list.contains(&class_str) {
                    return true;
                }
            }
            current = node.parent().and_then(|n| scraper::ElementRef::wrap(n));
        }
        false
    }

    let main_content_selectors = [
        ".mw-parser-output",
        "#mw-content-text",
        ".mw-content-ltr",
        "article",
        "#content",
        ".content",
        "main",
        ".post-content",
        ".article-content",
        ".entry-content",
    ];

    let mut content_parts = Vec::new();

    for selector_str in &main_content_selectors {
        if let Ok(selector) = Selector::parse(selector_str) {
            if let Some(main_content) = document.select(&selector).next() {
                println!("[extract_with_scraper] Found main content with selector: {}", selector_str);
                
                let headings: Vec<String> = main_content
                    .select(&Selector::parse("h1, h2, h3, h4, h5, h6").unwrap())
                    .filter(|el| !has_excluded_class_or_id(*el, exclude_class_or_id))
                    .map(|el| el.text().collect::<String>())
                    .filter(|s| s.trim().len() > 2)
                    .collect();

                let paragraphs: Vec<String> = main_content
                    .select(&Selector::parse("p").unwrap())
                    .filter(|el| !has_excluded_class_or_id(*el, exclude_class_or_id))
                    .map(|el| el.text().collect::<String>())
                    .filter(|s| s.trim().len() > 10)
                    .collect();

                let list_items: Vec<String> = main_content
                    .select(&Selector::parse("li").unwrap())
                    .filter(|el| !has_excluded_class_or_id(*el, exclude_class_or_id))
                    .map(|el| el.text().collect::<String>())
                    .filter(|s| s.trim().len() > 5 && s.trim().len() < 200)
                    .collect();

                let table_cells: Vec<String> = main_content
                    .select(&Selector::parse("td, th").unwrap())
                    .filter(|el| !has_excluded_class_or_id(*el, exclude_class_or_id))
                    .map(|el| el.text().collect::<String>())
                    .filter(|s| s.trim().len() > 2)
                    .collect();

                if !headings.is_empty() {
                    content_parts.push(headings.join("\n"));
                }
                if !paragraphs.is_empty() {
                    content_parts.push(paragraphs.join("\n\n"));
                }
                if !list_items.is_empty() {
                    content_parts.push(list_items.join("\n"));
                }
                if !table_cells.is_empty() {
                    content_parts.push(table_cells.join(" | "));
                }

                if !content_parts.is_empty() {
                    let content = content_parts.join("\n\n");
                    if content.len() >= MIN_CONTENT_LENGTH {
                        println!("[extract_with_scraper] Main content length: {} chars", content.len());
                        return (title, clean_text(&content));
                    }
                }
            }
        }
    }

    println!("[extract_with_scraper] No main content found, falling back to full page extraction");

    let all_paragraphs: Vec<String> = document
        .select(&Selector::parse("p").unwrap())
        .map(|el| el.text().collect::<String>())
        .filter(|s| s.trim().len() > 10)
        .collect();

    let all_list_items: Vec<String> = document
        .select(&Selector::parse("li").unwrap())
        .map(|el| el.text().collect::<String>())
        .filter(|s| s.trim().len() > 5 && s.trim().len() < 200)
        .collect();

    let all_headings: Vec<String> = document
        .select(&Selector::parse("h1, h2, h3, h4, h5, h6").unwrap())
        .map(|el| el.text().collect::<String>())
        .filter(|s| s.trim().len() > 2)
        .collect();

    let all_table_cells: Vec<String> = document
        .select(&Selector::parse("td, th").unwrap())
        .map(|el| el.text().collect::<String>())
        .filter(|s| s.trim().len() > 2)
        .collect();

    if !all_headings.is_empty() {
        content_parts.push(all_headings.join("\n"));
    }
    
    if !all_paragraphs.is_empty() {
        content_parts.push(all_paragraphs.join("\n\n"));
    }
    
    if !all_list_items.is_empty() {
        content_parts.push(all_list_items.join("\n"));
    }
    
    if !all_table_cells.is_empty() {
        content_parts.push(all_table_cells.join(" | "));
    }

    let combined = content_parts.join("\n\n");
    let cleaned = clean_text(&combined);
    
    println!("[extract_with_scraper] Paragraphs: {}", all_paragraphs.len());
    println!("[extract_with_scraper] List items: {}", all_list_items.len());
    println!("[extract_with_scraper] Headings: {}", all_headings.len());
    println!("[extract_with_scraper] Table cells: {}", all_table_cells.len());
    println!("[extract_with_scraper] Total content length: {} chars", cleaned.chars().count());

    if !cleaned.is_empty() {
        return (title, cleaned);
    }

    (title, String::new())
}

fn extract_body_text(html: &str) -> (String, String) {
    let document = Html::parse_document(html);

    let title = document
        .select(&Selector::parse("title").unwrap())
        .next()
        .map(|el| el.text().collect::<String>())
        .unwrap_or_default();

    let body_text = document
        .select(&Selector::parse("body").unwrap())
        .next()
        .map(|el| el.text().collect::<String>())
        .unwrap_or_default();

    (title, clean_text(&body_text))
}

fn extract_content(html: &str, url: &Url) -> (String, String, String) {
    if let Some((title, content)) = extract_with_readability(html, url) {
        return (title, content, "readability".to_string());
    }

    let (title, content) = extract_with_scraper(html);
    if content.len() >= MIN_CONTENT_LENGTH {
        return (title, content, "scraper".to_string());
    }

    let (title, content) = extract_body_text(html);
    (title, content, "fallback".to_string())
}

fn chunk_content_smart(content: &str, chunk_size: usize) -> Vec<ContentChunk> {
    let chars: Vec<char> = content.chars().collect();
    
    if chars.len() <= chunk_size {
        return vec![ContentChunk {
            index: 0,
            content: content.to_string(),
            is_last: true,
        }];
    }

    let mut chunks = Vec::new();
    let mut start = 0;
    let sentence_endings = ['。', '！', '？', '.', '!', '?', '\n'];

    while start < chars.len() {
        let ideal_end = std::cmp::min(start + chunk_size, chars.len());
        
        if ideal_end == chars.len() {
            let chunk_content: String = chars[start..].iter().collect();
            chunks.push(ContentChunk {
                index: chunks.len(),
                content: chunk_content,
                is_last: true,
            });
            break;
        }

        let search_range = &chars[start..ideal_end];
        
        let mut last_ending_char_idx = None;
        for (i, &ch) in search_range.iter().enumerate() {
            if sentence_endings.contains(&ch) {
                last_ending_char_idx = Some(i);
            }
        }
        
        if let Some(ending_offset) = last_ending_char_idx {
            let actual_end = start + ending_offset + 1;
            let chunk_content: String = chars[start..actual_end].iter().collect();
            chunks.push(ContentChunk {
                index: chunks.len(),
                content: chunk_content,
                is_last: false,
            });
            start = actual_end;
        } else {
            let chunk_content: String = chars[start..ideal_end].iter().collect();
            chunks.push(ContentChunk {
                index: chunks.len(),
                content: format!("{}...", chunk_content),
                is_last: false,
            });
            start = ideal_end;
        }
    }

    if let Some(last) = chunks.last_mut() {
        last.is_last = true;
    }

    chunks
}

#[command]
pub async fn fetch_url(url: String, options: Option<FetchOptions>) -> Result<FetchResult, String> {
    let options = options.unwrap_or(FetchOptions {
        max_length: None,
        timeout: None,
        user_agent: None,
        chunk_size: None,
        use_cache: None,
        force_refresh: None,
        render_js: None,
        js_render_timeout: None,
    });

    let max_length = options.max_length.unwrap_or(DEFAULT_MAX_LENGTH);
    let timeout = options.timeout.unwrap_or(DEFAULT_TIMEOUT);
    let chunk_size = options.chunk_size.unwrap_or(DEFAULT_CHUNK_SIZE);
    let use_cache = options.use_cache.unwrap_or(true);
    let force_refresh = options.force_refresh.unwrap_or(false);
    let render_js = options.render_js.unwrap_or(false);
    let js_render_timeout = options.js_render_timeout;
    let user_agent = options.user_agent.unwrap_or_else(|| {
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string()
    });

    let encoded_url = encode_url_if_needed(&url)?;
    let parsed_url = is_safe_url(&encoded_url)?;
    let domain = parsed_url
        .host_str()
        .unwrap_or("unknown")
        .to_string();

    println!("[fetch_url] URL: {}", url);
    println!("[fetch_url] Use cache: {}, Force refresh: {}, Render JS: {}", use_cache, force_refresh, render_js);

    if use_cache && !force_refresh {
        let cache = get_global_cache();
        if let Some(entry) = cache.get(&encoded_url) {
            let mut result = entry.result.clone();
            result.metadata.cached = true;
            println!("[fetch_url] Returning cached result");
            return Ok(result);
        }
    }

    if render_js && renderer::is_js_render_available() {
        println!("[fetch_url] Using JS renderer");
        match renderer::render_js_page(&encoded_url, js_render_timeout).await {
            Ok(render_result) => {
                let (title, full_content, extraction_method) = extract_content(&render_result.html, &parsed_url);
                
                let result = build_result(
                    title,
                    full_content,
                    extraction_method,
                    domain.clone(),
                    "text/html".to_string(),
                    max_length,
                    chunk_size,
                );

                if use_cache && result.success {
                    let cache = get_global_cache();
                    cache.set(encoded_url, result.clone(), None, None);
                }

                return Ok(result);
            }
            Err(e) => {
                println!("[fetch_url] JS render failed, falling back to HTTP: {}", e);
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(timeout))
        .user_agent(&user_agent)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(encoded_url.clone())
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        return Ok(FetchResult {
            success: false,
            title: String::new(),
            content: String::new(),
            summary: None,
            content_chunks: None,
            metadata: FetchMetadata {
                length: 0,
                domain,
                extraction_method: String::new(),
                chunk_count: 0,
                truncated: false,
                content_type: String::new(),
                page_count: None,
                cached: false,
            },
            error: Some(format!("HTTP error: {}", response.status())),
        });
    }

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let etag = response
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let last_modified = response
        .headers()
        .get("last-modified")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if content_type.contains("application/pdf") {
        println!("[fetch_url] Detected PDF content");
        let pdf_bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read PDF: {}", e))?;

        return handle_pdf(pdf_bytes.to_vec(), domain, use_cache, encoded_url, etag, last_modified);
    }

    if !content_type.contains("text/html") && !content_type.contains("application/xhtml") {
        let error_msg = format!("Unsupported content type: {}", content_type);
        return Ok(FetchResult {
            success: false,
            title: String::new(),
            content: String::new(),
            summary: None,
            content_chunks: None,
            metadata: FetchMetadata {
                length: 0,
                domain,
                extraction_method: String::new(),
                chunk_count: 0,
                truncated: false,
                content_type,
                page_count: None,
                cached: false,
            },
            error: Some(error_msg),
        });
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let (title, full_content, extraction_method) = extract_content(&html, &parsed_url);

    let result = build_result(
        title,
        full_content,
        extraction_method,
        domain.clone(),
        content_type.clone(),
        max_length,
        chunk_size,
    );

    if use_cache && result.success {
        let cache = get_global_cache();
        cache.set(encoded_url, result.clone(), etag, last_modified);
    }

    Ok(result)
}

fn handle_pdf(
    pdf_bytes: Vec<u8>,
    domain: String,
    use_cache: bool,
    url: String,
    etag: Option<String>,
    last_modified: Option<String>,
) -> Result<FetchResult, String> {
    match pdf::extract_pdf_content(&pdf_bytes) {
        Ok(pdf_result) => {
            let result = FetchResult {
                success: true,
                title: pdf_result.title.unwrap_or_else(|| "PDF Document".to_string()),
                content: pdf_result.content.clone(),
                summary: None,
                content_chunks: None,
                metadata: FetchMetadata {
                    length: pdf_result.content.chars().count(),
                    domain,
                    extraction_method: "pdf-extract".to_string(),
                    chunk_count: 1,
                    truncated: false,
                    content_type: "application/pdf".to_string(),
                    page_count: Some(pdf_result.page_count),
                    cached: false,
                },
                error: None,
            };

            if use_cache {
                let cache = get_global_cache();
                cache.set(url, result.clone(), etag, last_modified);
            }

            Ok(result)
        }
        Err(e) => Ok(FetchResult {
            success: false,
            title: String::new(),
            content: String::new(),
            summary: None,
            content_chunks: None,
            metadata: FetchMetadata {
                length: 0,
                domain,
                extraction_method: String::new(),
                chunk_count: 0,
                truncated: false,
                content_type: "application/pdf".to_string(),
                page_count: None,
                cached: false,
            },
            error: Some(format!("PDF extraction failed: {}", e)),
        }),
    }
}

fn build_result(
    title: String,
    full_content: String,
    extraction_method: String,
    domain: String,
    content_type: String,
    max_length: usize,
    chunk_size: usize,
) -> FetchResult {
    let original_length = full_content.chars().count();

    println!("[fetch_url] Title: {}", title);
    println!("[fetch_url] Extraction method: {}", extraction_method);
    println!("[fetch_url] Original content length: {} chars", original_length);
    println!("[fetch_url] Max length threshold: {} chars", max_length);
    println!("[fetch_url] Chunk size: {} chars", chunk_size);

    if original_length > max_length {
        println!("[fetch_url] Content exceeds max_length, chunking enabled!");
        let chunks = chunk_content_smart(&full_content, chunk_size);
        let chunk_count = chunks.len();
        println!("[fetch_url] Created {} chunks", chunk_count);

        let all_content: String = chunks
            .iter()
            .map(|c| c.content.as_str())
            .collect::<Vec<_>>()
            .join("\n\n---\n\n");

        println!("[fetch_url] Final content length: {} chars", all_content.chars().count());

        FetchResult {
            success: true,
            title,
            content: all_content,
            summary: None,
            content_chunks: Some(chunks),
            metadata: FetchMetadata {
                length: original_length,
                domain,
                extraction_method,
                chunk_count,
                truncated: false,
                content_type,
                page_count: None,
                cached: false,
            },
            error: None,
        }
    } else {
        println!("[fetch_url] Content within limit, returning as-is");

        FetchResult {
            success: true,
            title,
            content: full_content.clone(),
            summary: None,
            content_chunks: None,
            metadata: FetchMetadata {
                length: original_length,
                domain,
                extraction_method,
                chunk_count: 1,
                truncated: false,
                content_type,
                page_count: None,
                cached: false,
            },
            error: None,
        }
    }
}
