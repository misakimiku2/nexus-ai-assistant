const DEFAULT_JS_RENDER_TIMEOUT: u64 = 30000;

pub struct JsRenderResult {
    pub html: String,
    pub status_code: u16,
    pub final_url: String,
}

pub async fn render_js_page(url: &str, timeout_ms: Option<u64>) -> Result<JsRenderResult, String> {
    let timeout = timeout_ms.unwrap_or(DEFAULT_JS_RENDER_TIMEOUT);

    println!("[renderer] Starting JS render for: {}", url);
    println!("[renderer] Timeout: {}ms", timeout);

    #[cfg(feature = "js-render")]
    {
        use headless_chrome::{Browser, LaunchOptions};

        let browser = Browser::new(LaunchOptions {
            headless: true,
            ..Default::default()
        })
        .map_err(|e| format!("Failed to launch browser: {}", e))?;

        let tab = browser
            .new_tab()
            .map_err(|e| format!("Failed to create tab: {}", e))?;

        tab.navigate_to(url)
            .map_err(|e| format!("Failed to navigate: {}", e))?;

        tab.wait_until_navigated()
            .map_err(|e| format!("Navigation failed: {}", e))?;

        std::thread::sleep(std::time::Duration::from_millis(1000));

        let html = tab
            .get_content()
            .map_err(|e| format!("Failed to get content: {}", e))?;

        let final_url = tab.get_url();

        println!("[renderer] Rendered {} bytes", html.len());

        Ok(JsRenderResult {
            html,
            status_code: 200,
            final_url,
        })
    }

    #[cfg(not(feature = "js-render"))]
    {
        let _ = timeout;
        Err("JS rendering is not enabled. Enable 'js-render' feature to use this functionality.".to_string())
    }
}

pub fn is_js_render_available() -> bool {
    cfg!(feature = "js-render")
}
