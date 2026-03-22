# Raona UAT Generator

Webapp interna que genera test cases UAT a partir de documentación (PDF/Excel/texto) usando Cloudflare Workers AI (Llama 3.3 70B, gratis), y los exporta como Excel (.xlsx) con 3 pestañas.

## Arquitectura

```
Browser (HTML/CSS/JS)     →  Cloudflare Worker      →  Workers AI
  - pdf.js (extrae PDF)        - Valida TEAM_TOKEN       - Llama 3.3 70B
  - SheetJS (lee Excel)        - Sanitiza body            - Streaming SSE
  - ExcelJS (genera .xlsx)     - AI binding (gratis)
```

- **Sin build step** — todo CDN + vanilla JS
- **Sin framework** — HTML/CSS/JS puro
- **Sin API key externa** — Workers AI usa binding nativo de Cloudflare
- Worker en `worker/`, webapp en `webapp/`

## Comandos

```bash
# Servidor local
python3 -m http.server 8890
# http://localhost:8890/webapp/index.html

# Test Excel builder (sin Worker)
# http://localhost:8890/test/test-excel.html

# Unit tests (vitest)
npm test

# E2E tests (playwright, contra producción)
npm run test:e2e

# Worker local
cd worker && npx wrangler dev

# Deploy
cd worker && npx wrangler deploy
npx wrangler pages deploy webapp --project-name raona-uat --commit-dirty=true
```

## Estructura de archivos

```
webapp/
├── index.html            # SPA — layout brutalista 2 columnas
├── css/styles.css        # Archivo Black + JetBrains Mono
├── _headers              # CSP, HSTS, X-Frame-Options
└── js/
    ├── app.js            # Orquestador UI + flujo
    ├── file-parser.js    # Extracción texto PDF/Excel (client-side, paralelo)
    ├── tc-generator.js   # Worker → Llama 70B → parse SSE → JSON (con repair)
    └── excel-builder.js  # Genera .xlsx con ExcelJS (port de Python)
worker/
├── index.js              # Cloudflare Worker — AI binding + auth
└── wrangler.toml         # Config Worker + [ai] binding
test/
├── worker.test.js        # 8 tests Worker (vitest)
├── tc-parser.test.js     # 6 tests JSON extraction (vitest)
├── build-config.test.js  # 5 tests buildUATConfig (vitest)
├── mock-data.json        # 13 TCs True Copy para testing
├── test-excel.html       # Test visual del Excel builder
└── e2e/                  # 8 tests Playwright (producción)
```

## Convenciones de código

- **Vanilla JS** — sin TypeScript, sin bundler, sin npm en webapp
- **JSDoc types** — `@typedef` para UATConfig, TestCase, Bug, ParseResult
- **`??`** en vez de `||`, **`?.`** para accesos seguros
- **`data-testid`** en todos los elementos interactivos
- **`Object.freeze()`** en constantes
- **`for...of`** en vez de `.forEach()`
- **Conditional exports** — `if (typeof module !== 'undefined')` para tests Node

## Worker — reglas

- Modelo fijo: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- Sanitiza body (solo max_tokens, messages, system)
- Valida messages: role in [user, assistant, system], content string
- max_tokens ceiling: 16384
- Límite body: 512KB (validado con `request.text()`, no Content-Length)
- Health check: `GET /`
- Secret: `TEAM_TOKEN` (via `wrangler secret put`)
- CORS: restringido a `https://raona-uat.pages.dev`

## Producción

- **Webapp**: https://raona-uat.pages.dev
- **Worker**: https://raona-uat-worker.alexoliveperez.workers.dev
- **Contraseña**: configurada como TEAM_TOKEN en Cloudflare secrets
- **Coste**: gratis (Workers AI free tier, 10K neurons/día)
- **PRD**: https://github.com/alopedev/Raona/issues/2

## Flujo de generación

1. Usuario rellena contraseña + sube archivos/pega texto + metadatos
2. Click botón → Fase 1: extrae texto en paralelo (pdf.js/SheetJS)
3. Fase 2: envía a Worker → Llama 70B genera TCs como JSON streaming
4. JSON repair automático si LLM genera JSON malformado
5. Fase 3: ExcelJS construye .xlsx con 3 pestañas
6. Botón "Descargar .xlsx" con conteo de TCs y áreas

## Limitaciones conocidas

- MAX_CHARS 50K: documentos mayores se truncan (Llama 70B soporta 128K pero cap por velocidad)
- Llama 70B genera JSON malformado ~10% de las veces (repair automático mitiga)
- Sin retry automático: si falla, el usuario debe reintentar manualmente
