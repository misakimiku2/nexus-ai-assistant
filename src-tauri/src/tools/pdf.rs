use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfExtractionResult {
    pub title: Option<String>,
    pub author: Option<String>,
    pub page_count: usize,
    pub content: String,
}

pub fn extract_pdf_content(pdf_bytes: &[u8]) -> Result<PdfExtractionResult, String> {
    println!("[pdf] Extracting PDF content, size: {} bytes", pdf_bytes.len());

    let content = pdf_extract::extract_text_from_mem(pdf_bytes)
        .map_err(|e| format!("Failed to extract text: {}", e))?;

    let cleaned_content = clean_pdf_text(&content);

    let page_count = estimate_page_count(&cleaned_content);

    println!("[pdf] Extracted {} chars, estimated {} pages", cleaned_content.len(), page_count);

    Ok(PdfExtractionResult {
        title: None,
        author: None,
        page_count,
        content: cleaned_content,
    })
}

fn clean_pdf_text(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let mut result = Vec::new();
    let mut prev_line_empty = false;

    for line in lines {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            if !prev_line_empty {
                result.push(String::new());
                prev_line_empty = true;
            }
            continue;
        }

        if is_likely_header_or_footer(trimmed) {
            continue;
        }

        prev_line_empty = false;
        result.push(trimmed.to_string());
    }

    while result.last().map_or(false, |s| s.is_empty()) {
        result.pop();
    }
    while result.first().map_or(false, |s| s.is_empty()) {
        result.remove(0);
    }

    result.join("\n")
}

fn is_likely_header_or_footer(line: &str) -> bool {
    if line.len() < 3 {
        return true;
    }

    if line.chars().all(|c| c.is_numeric() || c.is_whitespace()) {
        return true;
    }

    let lower = line.to_lowercase();
    let footer_patterns = [
        "page ",
        "第",
        "页",
        "of ",
        "/ ",
        "copyright",
        "all rights reserved",
    ];

    for pattern in &footer_patterns {
        if lower.contains(pattern) && line.len() < 30 {
            return true;
        }
    }

    false
}

fn estimate_page_count(content: &str) -> usize {
    let char_count = content.chars().count();

    let page_breaks = content.matches('\u{000C}').count();

    if page_breaks > 0 {
        return page_breaks + 1;
    }

    let estimated_pages = (char_count as f64 / 2000.0).ceil() as usize;
    estimated_pages.max(1)
}
