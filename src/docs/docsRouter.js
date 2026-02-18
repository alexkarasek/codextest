import express from "express";
import path from "path";

const router = express.Router();
const DOCS_DIR = path.join(process.cwd(), "docs");
const README_PATH = path.join(process.cwd(), "README.md");

router.get("/api", (_req, res) => {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    .top-note { padding: 10px 16px; background: #f6f8fa; border-bottom: 1px solid #d0d7de; font-size: 13px; }
    #swagger-ui { max-width: 1200px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="top-note">
    Use <code>x-api-key</code> for API-key auth routes. Swagger \"Try it out\" is enabled.
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/docs/openapi.yaml',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      tryItOutEnabled: true
    });
  </script>
</body>
</html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

router.get("/openapi.yaml", (_req, res) => {
  res.sendFile(path.join(DOCS_DIR, "openapi.yaml"));
});

router.get("/README.md", (_req, res) => {
  res.sendFile(README_PATH);
});

router.use(express.static(DOCS_DIR));

export default router;
