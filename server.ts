import express from "express";
import { createServer as createViteServer } from "vite";
import * as cheerio from "cheerio";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/search", async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      const searchRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      const html = await searchRes.text();
      const $ = cheerio.load(html);
      const results: any[] = [];
      
      $('.result').each((i, el) => {
        if (results.length >= 5) return;
        
        const titleEl = $(el).find('.result__title a');
        const snippetEl = $(el).find('.result__snippet');
        
        if (titleEl.length && snippetEl.length) {
          let url = titleEl.attr('href') || '';
          // Clean up duckduckgo redirect urls
          if (url.startsWith('//duckduckgo.com/l/?uddg=')) {
            try {
              const urlObj = new URL('https:' + url);
              const uddg = urlObj.searchParams.get('uddg');
              if (uddg) {
                url = decodeURIComponent(uddg);
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
          
          results.push({
            title: titleEl.text().trim(),
            url: url,
            snippet: snippetEl.text().trim()
          });
        }
      });

      res.json({ results });
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ error: "Failed to perform search" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
