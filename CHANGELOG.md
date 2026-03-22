# Changelog — Raona UAT Generator

Historial de desarrollo recuperado del repo original [alopedev/Raona](https://github.com/alopedev/Raona).

## 2026-03-22

- **remove** `fdf380e` — uat-generator migrado a repo propio alopedev/raona-uat
- **config** `6a9604d` — .env.example sin CLAUDE_API_KEY, compat_date 2025, gitignore test-results
- **cleanup** `c66cfbf` — tech debt quick wins: globals → closure, dead typedef, docs "Claude Haiku" → "Workers AI Llama 3.3 70B", CLAUDE.md reescrito
- **fix** `305b56b` — JSON repair para LLM output malformado (unquoted values, trailing commas, single quotes) + CSP corregido (unsafe-inline, connect-src)
- **upgrade** `da4906e` — Llama 3.1 8B → Llama 3.3 70B. 8B fallaba con docs largos. 70B: mejor JSON, contexto 128K. MAX_CHARS restaurado a 50K
- **fix** `b5eb91e` — MAX_CHARS 50K→20K (Llama 8B context limit ~8K tokens)
- **fix** `0c1b03d` — SSE parser skip null response events (Workers AI final event)

## 2026-03-21

- **cleanup** `2d4744b` — dead code, dedup, parallel parsing, SUPPORTED_EXTENSIONS single source of truth, makeStatusFont factory, CLIENT_MAX_TOKENS constante
- **feat** `94e877e` — Migración Claude API → Cloudflare Workers AI (Llama 3.1 8B). Sin API key externa, gratis (10K neurons/día). max_tokens ceiling 4096
- **security** `2c5986a` — Audit completo: contraseña eliminada de CLAUDE.md, CORS restringido, max_tokens ceiling 16384, body size check real, _headers CSP/HSTS, validación messages
- **deploy** `13b019b` — Worker + Pages en Cloudflare. URLs producción establecidas
- **refactor** `607959a` — Module deepening: exports condicionales, buildUATConfig puro, eliminado duplicados
- **test** `968a491` — TDD vertical slices: 13 tests Worker + TC parser (vitest, zero mocks)
- **docs** `4d3735a` — CLAUDE.md con orientación completa del proyecto

## 2026-03-20

- **fix** `0557bc0` — Error de red amigable, eliminado Playwright (testing via Claude for Chrome)
- **improve** `edce6d4` — 5 skills aplicadas: UI (grain, animations), JS modern (??/?./, Object.freeze), Worker validation, JSDoc, E2E tests (data-testid, Playwright)
- **feat** `5e63dc7` — raona-uat webapp completa (fases 1-6): Excel builder, frontend UI, file parser, Worker proxy streaming, tc-generator
