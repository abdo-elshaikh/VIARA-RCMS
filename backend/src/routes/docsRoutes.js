const express = require('express');
const path = require('path');
const fs = require('fs');

module.exports = function docsRoutes() {
  const router = express.Router();
  const specPath = path.resolve(__dirname, '../docs/openapi.json');
  let cachedSpec = null;

  const getSpec = () => {
    if (!cachedSpec) {
      try {
        const data = fs.readFileSync(specPath, 'utf8');
        cachedSpec = JSON.parse(data);
      } catch (err) {
        return null;
      }
    }
    return cachedSpec;
  };

  // Serve raw OpenAPI JSON specification
  router.get('/openapi.json', (req, res) => {
    const spec = getSpec();
    if (!spec) {
      return res.status(500).json({ error: 'OpenAPI specification not available' });
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(spec);
  });

  router.get('/spec', (req, res) => {
    res.redirect('/api/docs/openapi.json');
  });

  // Serve Interactive API Documentation (Swagger / Redoc with fallback)
  router.get('/', (req, res) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: https:;"
    );

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VIARA API Documentation | Enterprise RIS & PACS</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏥</text></svg>">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .header-bar {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border-bottom: 1px solid #334155;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header-title {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.5px;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #38bdf8;
    }
    .header-badge {
      background: #0369a1;
      color: #e0f2fe;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 9999px;
    }
    .header-links a {
      color: #94a3b8;
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      margin-left: 16px;
      transition: color 0.2s;
    }
    .header-links a:hover {
      color: #38bdf8;
    }
    #swagger-ui {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
      margin-top: 24px;
      margin-bottom: 40px;
    }
    #fallback-ui {
      display: none;
      max-width: 900px;
      margin: 40px auto;
      padding: 30px;
      background: #1e293b;
      border-radius: 12px;
      border: 1px solid #334155;
    }
    #fallback-ui h2 { color: #38bdf8; margin-top: 0; }
    #fallback-ui a.btn {
      display: inline-block;
      margin-top: 16px;
      padding: 10px 20px;
      background: #0284c7;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="header-title">
      <span>🏥 VIARA Enterprise API</span>
      <span class="header-badge">v1.0.0 (OAS 3.0)</span>
    </div>
    <div class="header-links">
      <a href="/api/docs/openapi.json" target="_blank">Raw JSON Spec</a>
      <a href="/health/ready" target="_blank">Health Check</a>
      <a href="/api/v1/health" target="_blank">V1 Status</a>
    </div>
  </div>

  <div id="swagger-ui"></div>
  <div id="fallback-ui">
    <h2>VIARA Enterprise API Documentation</h2>
    <p>The interactive Swagger UI client could not be loaded from CDN (e.g. offline environment). The complete OpenAPI 3.0.3 specification is available directly below:</p>
    <a class="btn" href="/api/docs/openapi.json" download="viara-openapi.json">Download OpenAPI 3.0.3 Spec</a>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js" onerror="document.getElementById('swagger-ui').style.display='none';document.getElementById('fallback-ui').style.display='block';"></script>
  <script>
    window.onload = function() {
      if (typeof SwaggerUIBundle !== 'undefined') {
        SwaggerUIBundle({
          url: "/api/docs/openapi.json",
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIBundle.SwaggerUIStandalonePreset
          ],
          layout: "BaseLayout"
        });
      }
    };
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  return router;
};
