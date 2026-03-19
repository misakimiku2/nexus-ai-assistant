use reqwest::Url;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchEngine {
    Auto,
    Bing,
    Duckduckgo,
    Baidu,
}

impl Default for SearchEngine {
    fn default() -> Self {
        SearchEngine::Auto
    }
}

impl std::str::FromStr for SearchEngine {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "auto" => Ok(SearchEngine::Auto),
            "bing" => Ok(SearchEngine::Bing),
            "duckduckgo" => Ok(SearchEngine::Duckduckgo),
            "baidu" => Ok(SearchEngine::Baidu),
            _ => Ok(SearchEngine::Auto),
        }
    }
}

fn is_result_relevant(query: &str, results: &[SearchResult]) -> bool {
    if results.is_empty() {
        return false;
    }
    
    let query_lower = query.to_lowercase();
    let query_keywords: Vec<&str> = query_lower
        .split_whitespace()
        .filter(|w| w.chars().count() >= 2)
        .collect();
    
    if query_keywords.is_empty() {
        return true;
    }
    
    let mut relevant_count = 0;
    for result in results {
        let title_lower = result.title.to_lowercase();
        let snippet_lower = result.snippet.to_lowercase();
        let combined = format!("{} {}", title_lower, snippet_lower);
        
        let mut keyword_matches = 0;
        for keyword in &query_keywords {
            if combined.contains(keyword) {
                keyword_matches += 1;
            }
        }
        
        if keyword_matches > 0 {
            relevant_count += 1;
        }
    }
    
    let relevance_ratio = relevant_count as f32 / results.len() as f32;
    relevance_ratio >= 0.3
}

fn clean_duckduckgo_url(url: &str) -> String {
    if url.starts_with("//duckduckgo.com/l/?uddg=") {
        if let Ok(parsed) = Url::parse(&format!("https:{}", url)) {
            for (key, value) in parsed.query_pairs() {
                if key == "uddg" {
                    return value.to_string();
                }
            }
        }
    }
    if url.starts_with("/l/?uddg=") {
        if let Ok(parsed) = Url::parse(&format!("https://duckduckgo.com{}", url)) {
            for (key, value) in parsed.query_pairs() {
                if key == "uddg" {
                    return value.to_string();
                }
            }
        }
    }
    url.to_string()
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

fn parse_duckduckgo_lite(html: &str) -> Vec<SearchResult> {
    let document = Html::parse_document(html);
    let mut results: Vec<SearchResult> = Vec::new();

    let link_selector = Selector::parse("a.result-link").ok();
    let snippet_selector = Selector::parse("td.result-snippet").ok();

    if let (Some(link_sel), Some(snippet_sel)) = (link_selector, snippet_selector) {
        let links: Vec<_> = document.select(&link_sel).collect();
        let snippets: Vec<_> = document.select(&snippet_sel).collect();

        for (i, link) in links.iter().enumerate() {
            if results.len() >= 10 {
                break;
            }

            let title = link.text().collect::<String>().trim().to_string();
            let url = link
                .value()
                .attr("href")
                .map(|u| clean_duckduckgo_url(u))
                .unwrap_or_default();

            let snippet = snippets
                .get(i)
                .map(|s| s.text().collect::<String>().trim().to_string())
                .unwrap_or_default();

            if !title.is_empty() && !url.is_empty() {
                results.push(SearchResult { title, url, snippet });
            }
        }
    }

    if results.is_empty() {
        if let Ok(row_selector) = Selector::parse("tr") {
            if let Ok(a_selector) = Selector::parse("a") {
                for row in document.select(&row_selector) {
                    if results.len() >= 10 {
                        break;
                    }

                    if let Some(link) = row.select(&a_selector).next() {
                        let title = link.text().collect::<String>().trim().to_string();
                        if let Some(href) = link.value().attr("href") {
                            let url = clean_duckduckgo_url(href);
                            if !title.is_empty() && url.starts_with("http") && !url.contains("duckduckgo.com") {
                                results.push(SearchResult {
                                    title,
                                    url,
                                    snippet: String::new(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    results
}

fn parse_bing(html: &str) -> Vec<SearchResult> {
    let document = Html::parse_document(html);
    let mut results: Vec<SearchResult> = Vec::new();

    log::info!("Parsing Bing HTML, length: {} bytes", html.len());

    // Primary selector: #b_content #b_results .b_algo (from page-assist)
    if let Ok(container_selector) = Selector::parse("#b_content #b_results .b_algo") {
        if let Ok(title_selector) = Selector::parse("h2 a") {
            if let Ok(snippet_selector) = Selector::parse(".b_caption p") {
                for container in document.select(&container_selector) {
                    if results.len() >= 10 {
                        break;
                    }

                    // Try .tilk first (page-assist approach), then h2 a
                    let url = container
                        .select(&Selector::parse(".tilk").unwrap_or_else(|_| title_selector.clone()))
                        .next()
                        .and_then(|el| el.value().attr("href"))
                        .or_else(|| {
                            container.select(&title_selector).next().and_then(|el| el.value().attr("href"))
                        })
                        .unwrap_or_default()
                        .to_string();

                    let title = container
                        .select(&title_selector)
                        .next()
                        .map(|el| el.text().collect::<String>().trim().to_string())
                        .unwrap_or_default();

                    let snippet = container
                        .select(&snippet_selector)
                        .next()
                        .map(|el| el.text().collect::<String>().trim().to_string())
                        .unwrap_or_default();

                    if !title.is_empty() && !url.is_empty() && url.starts_with("http") {
                        results.push(SearchResult { title, url, snippet });
                    }
                }
            }
        }
    }

    // Parse news results: .b_nwsAns (from page-assist)
    if results.len() < 10 {
        if let Ok(news_selector) = Selector::parse("#b_content #b_results .b_nwsAns") {
            if let Ok(news_link_selector) = Selector::parse("a.itm_link") {
                if let Ok(news_title_selector) = Selector::parse(".na_t_news_caption") {
                    if let Ok(news_snippet_selector) = Selector::parse(".itm_spt_news_caption") {
                        for news in document.select(&news_selector) {
                            if results.len() >= 10 {
                                break;
                            }

                            let url = news
                                .select(&news_link_selector)
                                .next()
                                .and_then(|el| el.value().attr("href"))
                                .unwrap_or_default()
                                .to_string();

                            let title = news
                                .select(&news_title_selector)
                                .next()
                                .map(|el| el.text().collect::<String>().trim().to_string())
                                .unwrap_or_default();

                            let snippet = news
                                .select(&news_snippet_selector)
                                .next()
                                .map(|el| el.text().collect::<String>().trim().to_string())
                                .unwrap_or_default();

                            if !title.is_empty() && !url.is_empty() && url.starts_with("http") {
                                results.push(SearchResult { title, url, snippet });
                            }
                        }
                    }
                }
            }
        }
    }

    // Fallback selectors if primary doesn't work
    if results.is_empty() {
        let fallback_selectors = [
            ("li.b_algo", "h2 a", ".b_caption p"),
            ("li.b_algo", "h2 a", "p"),
            ("div.b_algo", "h2 a", ".b_caption p"),
            ("#b_results > li", "h2 a", ".b_caption p"),
            ("li[class*='b_algo']", "h2 a", ".b_caption p"),
        ];

        for (container_sel, title_sel, snippet_sel) in fallback_selectors {
            if let Ok(container_selector) = Selector::parse(container_sel) {
                let title_selector = Selector::parse(title_sel).ok();
                let snippet_selector = Selector::parse(snippet_sel).ok();

                for container in document.select(&container_selector) {
                    if results.len() >= 10 {
                        break;
                    }

                    let title_el = title_selector.as_ref().and_then(|s| container.select(s).next());

                    let title = title_el
                        .map(|el| el.text().collect::<String>().trim().to_string())
                        .unwrap_or_default();

                    let url = title_el
                        .and_then(|el| el.value().attr("href"))
                        .unwrap_or_default()
                        .to_string();

                    let snippet = snippet_selector
                        .as_ref()
                        .and_then(|s| container.select(s).next())
                        .map(|el| el.text().collect::<String>().trim().to_string())
                        .unwrap_or_default();

                    if !title.is_empty() && !url.is_empty() && url.starts_with("http") 
                        && !url.contains("microsoft.com") && !url.contains("go.microsoft.com") {
                        results.push(SearchResult { title, url, snippet });
                    }
                }
            }

            if !results.is_empty() {
                break;
            }
        }
    }

    log::info!("Bing found {} results", results.len());
    results
}



async fn try_duckduckgo_lite(client: &reqwest::Client, query: &str) -> Option<Vec<SearchResult>> {
    let url = format!(
        "https://lite.duckduckgo.com/lite/?q={}",
        urlencoding::encode(query)
    );
    
    log::info!("Trying DuckDuckGo Lite: {}", url);

    let response = match tokio::time::timeout(
        std::time::Duration::from_secs(5),
        client
            .get(&url)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
            .header("Accept-Encoding", "identity")
            .header("Connection", "keep-alive")
            .send()
    )
    .await
    {
        Ok(Ok(resp)) => resp,
        Ok(Err(e)) => {
            log::warn!("DuckDuckGo Lite request error: {}", e);
            return None;
        }
        Err(_) => {
            log::warn!("DuckDuckGo Lite timeout after 5 seconds");
            return None;
        }
    };

    log::info!("DuckDuckGo Lite response status: {}", response.status());

    if !response.status().is_success() {
        return None;
    }

    let html = response.text().await.ok()?;
    log::debug!("DuckDuckGo Lite HTML length: {} bytes", html.len());

    if html.len() < 500 {
        log::warn!("DuckDuckGo Lite response too short, might be blocked");
        return None;
    }

    let results = parse_duckduckgo_lite(&html);
    
    if results.is_empty() {
        log::info!("DuckDuckGo Lite returned no results");
        return None;
    }

    log::info!("DuckDuckGo Lite found {} results", results.len());
    Some(results)
}

async fn try_bing(client: &reqwest::Client, query: &str) -> Option<Vec<SearchResult>> {
    let url = format!(
        "https://www.bing.com/search?q={}&setlang=en&cc=US",
        urlencoding::encode(query)
    );
    
    log::info!("Trying Bing (International): {}", url);

    let response = client
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Connection", "keep-alive")
        .header("Upgrade-Insecure-Requests", "1")
        .header("Cache-Control", "max-age=0")
        .header("sec-ch-ua", "\"Chromium\";v=\"122\", \"Not(A:Brand\";v=\"24\", \"Google Chrome\";v=\"122\"")
        .header("sec-ch-ua-mobile", "?0")
        .header("sec-ch-ua-platform", "\"Windows\"")
        .header("sec-fetch-dest", "document")
        .header("sec-fetch-mode", "navigate")
        .header("sec-fetch-site", "none")
        .header("sec-fetch-user", "?1")
        .send()
        .await
        .ok()?;

    log::info!("Bing response status: {}", response.status());

    if !response.status().is_success() {
        return None;
    }

    let html = response.text().await.ok()?;
    log::info!("Bing HTML length: {} bytes", html.len());
    
    if html.len() < 500 {
        log::warn!("Bing response too short, might be blocked");
        return None;
    }

    let results = parse_bing(&html);
    
    if results.is_empty() {
        log::info!("Bing returned no results");
        return None;
    }

    log::info!("Bing found {} results", results.len());
    for (i, r) in results.iter().enumerate() {
        log::debug!("Bing result {}: {} - {}", i + 1, r.title, r.url);
    }
    Some(results)
}



async fn try_baidu(client: &reqwest::Client, query: &str) -> Option<Vec<SearchResult>> {
    let url = format!(
        "https://www.baidu.com/s?wd={}&tn=json&rn=10",
        urlencoding::encode(query)
    );
    
    log::info!("Trying Baidu JSON API: {}", url);

    let response = match tokio::time::timeout(
        std::time::Duration::from_secs(10),
        client
            .get(&url)
            .header("Accept", "application/json, text/plain, */*")
            .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
            .header("Referer", "https://www.baidu.com/")
            .send()
    )
    .await
    {
        Ok(Ok(resp)) => resp,
        Ok(Err(e)) => {
            log::warn!("Baidu request error: {}", e);
            return None;
        }
        Err(_) => {
            log::warn!("Baidu timeout after 10 seconds");
            return None;
        }
    };

    log::info!("Baidu response status: {}", response.status());

    if !response.status().is_success() {
        return None;
    }

    let json: serde_json::Value = response.json().await.ok()?;
    log::debug!("Baidu JSON response: {:?}", json);

    let feed = json.get("feed")?;
    let entries = feed.get("entry")?.as_array()?;

    let results: Vec<SearchResult> = entries
        .iter()
        .filter_map(|entry| {
            let title = entry.get("title")?.as_str()?.to_string();
            let url = entry.get("url")?.as_str()?.to_string();
            let snippet = entry
                .get("abs")
                .and_then(|s| s.as_str())
                .unwrap_or("")
                .to_string();

            if !title.is_empty() && !url.is_empty() {
                Some(SearchResult { title, url, snippet })
            } else {
                None
            }
        })
        .collect();

    if results.is_empty() {
        log::info!("Baidu returned no results");
        return None;
    }

    log::info!("Baidu found {} results", results.len());
    for (i, r) in results.iter().enumerate() {
        log::debug!("Baidu result {}: {} - {}", i + 1, r.title, r.url);
    }
    Some(results)
}

async fn search_async(query: String, engine: SearchEngine) -> Result<SearchResponse, String> {
    log::info!("Starting search for query: {} with engine: {:?}", query, engine);
    
    let client = build_client()?;

    match engine {
        SearchEngine::Auto => {
            // Try Baidu first (best for Chinese users)
            if let Some(results) = try_baidu(&client, &query).await {
                if is_result_relevant(&query, &results) {
                    log::info!("Baidu results are relevant, using them");
                    return Ok(SearchResponse {
                        results,
                        source: "baidu".to_string(),
                    });
                }
                log::warn!("Baidu results not relevant, trying next engine");
            }

            // Try DuckDuckGo Lite (international results)
            if let Some(results) = try_duckduckgo_lite(&client, &query).await {
                if is_result_relevant(&query, &results) {
                    log::info!("DuckDuckGo results are relevant, using them");
                    return Ok(SearchResponse {
                        results,
                        source: "duckduckgo_lite".to_string(),
                    });
                }
                log::warn!("DuckDuckGo results not relevant, trying next engine");
            }

            // Fallback to Bing (good international coverage, accessible in China)
            if let Some(results) = try_bing(&client, &query).await {
                if is_result_relevant(&query, &results) {
                    log::info!("Bing results are relevant, using them");
                    return Ok(SearchResponse {
                        results,
                        source: "bing".to_string(),
                    });
                }
                log::warn!("Bing results not relevant");
            }
            
            // If all engines returned irrelevant results, return Baidu results anyway
            log::warn!("All search engines returned irrelevant results, returning Baidu results anyway");
            if let Some(results) = try_baidu(&client, &query).await {
                return Ok(SearchResponse {
                    results,
                    source: "baidu".to_string(),
                });
            }
        }
        SearchEngine::Baidu => {
            if let Some(results) = try_baidu(&client, &query).await {
                if is_result_relevant(&query, &results) {
                    log::info!("Baidu results are relevant, using them");
                    return Ok(SearchResponse {
                        results,
                        source: "baidu".to_string(),
                    });
                }
                log::warn!("Baidu results not relevant, trying DuckDuckGo as fallback");
            }
            
            // Fallback to DuckDuckGo if Baidu fails
            if let Some(results) = try_duckduckgo_lite(&client, &query).await {
                if is_result_relevant(&query, &results) {
                    log::info!("DuckDuckGo results are relevant, using them");
                    return Ok(SearchResponse {
                        results,
                        source: "duckduckgo_lite".to_string(),
                    });
                }
            }
            
            // Last resort: return Baidu results anyway
            log::warn!("All engines returned irrelevant results for Baidu mode, returning Baidu results anyway");
            if let Some(results) = try_baidu(&client, &query).await {
                return Ok(SearchResponse {
                    results,
                    source: "baidu".to_string(),
                });
            }
        }
        SearchEngine::Bing => {
            // Try Bing first
            if let Some(results) = try_bing(&client, &query).await {
                if is_result_relevant(&query, &results) {
                    log::info!("Bing results are relevant, using them");
                    return Ok(SearchResponse {
                        results,
                        source: "bing".to_string(),
                    });
                }
                log::warn!("Bing results not relevant, trying DuckDuckGo as fallback");
            }
            
            // Fallback to DuckDuckGo if Bing fails
            if let Some(results) = try_duckduckgo_lite(&client, &query).await {
                if is_result_relevant(&query, &results) {
                    log::info!("DuckDuckGo results are relevant, using them");
                    return Ok(SearchResponse {
                        results,
                        source: "duckduckgo_lite".to_string(),
                    });
                }
            }
            
            // Last resort: return Bing results anyway with a warning
            log::warn!("All engines returned irrelevant results for Bing mode, returning Bing results anyway");
            if let Some(results) = try_bing(&client, &query).await {
                return Ok(SearchResponse {
                    results,
                    source: "bing".to_string(),
                });
            }
        }
        SearchEngine::Duckduckgo => {
            if let Some(results) = try_duckduckgo_lite(&client, &query).await {
                return Ok(SearchResponse {
                    results,
                    source: "duckduckgo_lite".to_string(),
                });
            }
        }
    }

    log::error!("Search engine {:?} failed", engine);
    Ok(SearchResponse {
        results: Vec::new(),
        source: "none".to_string(),
    })
}

#[tauri::command]
pub async fn search(query: String, engine: Option<String>) -> Result<SearchResponse, String> {
    let search_engine = engine
        .and_then(|e| e.parse::<SearchEngine>().ok())
        .unwrap_or_default();
    search_async(query, search_engine).await
}
