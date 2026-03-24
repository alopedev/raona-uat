# Plan: Mejoras UAT Generator — Feedback Ana

## Contexto

Ana probó la webapp de generación de test cases UAT y reportó 3 problemas principales:

1. **Pocos TCs (~20)** — el modelo genera pocos test cases, no recorre toda la solución
2. **Falta de detalle** — dice "qué probar" pero no "cómo probarlo" (sin pasos concretos)
3. **Falta de contexto** — el modelo no discrimina por features, genera TCs genéricos

Tras sesión de diseño (grilling), se acordaron 4 piezas de mejora + 1 refactor arquitectónico, implementadas secuencialmente con TDD.

---

## Decisiones de diseño

| Decisión | Resolución |
|---|---|
| Multi-pasada: ¿usuario lista features o auto-detect? | Mixto: si el usuario lista features → se usan (A). Si no → single-pass mejorado (B2) |
| Campo features: ¿obligatorio? | No. Opcional. El usuario puede no tener el listado |
| Campo features: ¿formato? | Chips/tags con input + botón "Añadir feature" |
| Campo features: ¿dónde en la UI? | Dentro de Step 03 "Documentación" |
| Enviar doc completo N veces? | No. Client-side chunking filtra ~12K chars relevantes por feature |
| minTCs: ¿por feature o total? | Por feature. Selector sube hasta 30 |
| TC steps: ¿campo separado o dentro de description? | Campo `steps: string[]` separado + nueva columna "Pasos" en Excel |
| Precondiciones en TC? | No. Solo steps |
| Área funcional en multi-pass: ¿forzar al nombre de feature? | No. El modelo decide el area |
| Fallo parcial en multi-pass | Mostrar TCs exitosos + warning para features fallidas |
| Fallback sin features | Single-pass con prompt mejorado (B2) |
| Max features | 5 por generación |
| Progreso multi-pass | Simple: "feature 2 de 4" |

---

## Piezas implementadas

### Pieza A — Prompt mejorado + campo `steps`

**Estado: COMPLETADO**

**Objetivo**: Cada TC incluye pasos numerados que guían al tester paso a paso.

**Cambios**:
- `tc-generator.js`: prompt con regla de pasos numerados + campo `steps` en JSON schema
- `excel-builder.js`: nueva columna "Pasos" (7 columnas total), merge cells B2:H2/B3:H3, dropdown Estado movido a col G
- `mock-data.json`: 13 TCs actualizados con steps
- Fallback: si el modelo no devuelve steps → se muestra "—"

**Tests**: 4 nuevos (steps en prompt, parse con/sin steps, columna Pasos en Excel, fallback dash)

**Commits**:
- `9beae53` test: add failing tests for steps field (TDD red phase)
- `c217eba` feat: add steps field to TCs — improved prompt + Excel Pasos column

---

### Pieza B — text-chunker.js (filtrado client-side)

**Estado: COMPLETADO**

**Objetivo**: Filtrar el documento para extraer solo los párrafos relevantes a cada feature, reduciendo tokens enviados al modelo.

**Nuevo módulo**: `webapp/js/text-chunker.js` (~165 líneas)

**Algoritmo**:
1. Normalizar acentos (NFD + strip diacritics + lowercase)
2. Dividir texto en chunks por doble newline o detección de headings
3. Heading regex para docs funcionales en español/inglés
4. Puntuar chunks por keyword match + heading boost
5. Fallback a sliding window (500 chars, 100 overlap) si <5 chunks
6. Top-K chunks en orden original, hasta targetChars (default 12K)

**Interfaz pública**: `extractRelevantText(text, featureName, { targetChars, topK })`

**Tests**: 15 nuevos (normalización acentos, splitting, scoring, relevancia, targetChars, empty feature)

**Commits**:
- `a749709` test: add failing tests for text-chunker module (TDD red phase)
- `139975c` feat: add text-chunker.js — client-side relevance filtering

---

### Pieza C — UI chips features + selector hasta 30

**Estado: COMPLETADO**

**Objetivo**: Permitir al usuario especificar features de testeo opcionales + ampliar rango de TCs.

**Cambios**:
- `index.html`: bloque "Features específicas de testeo (opcional)" con input, botón, chips container. Selector minTCs 8-30
- `styles.css`: estilos feature-chip, feature-input-row, btn-add-feature, form-hint, optional, feature-limit-msg
- `app.js`: estado `features[]`, funciones addFeatureFromInput/removeFeature/renderFeatureChips/getFeatures, max 5 features

**UX**:
- Label: "Features específicas de testeo (opcional)"
- Hint: "Aquí puedes especificar manualmente las features sobre las que realizar el testeo"
- Input placeholder: "Nombre de la feature..."
- Botón: "Añadir feature"
- Chips con × para eliminar
- Límite: máximo 5 features, input se deshabilita al llegar al tope

**Commit**:
- `e170461` feat: add feature chips UI + extend minTCs to 30

---

### Pieza D — Multi-pasada en app.js

**Estado: COMPLETADO**

**Objetivo**: Si hay features → N llamadas al Worker (1 por feature con texto filtrado via chunker). Si no → 1 llamada como ahora.

**Cambios**:
- `tc-generator.js`: `buildSystemPrompt(minTCs, featureName?)` con instrucción FOCO opcional
- `app.js`: `runGeneration()` usa `orchestrateGeneration()` (ver refactor abajo)

**Flujo con features**:
```
para cada feature:
  1. filteredText = extractRelevantText(doc, feature, { targetChars: 12000 })
  2. tcs = generateTestCases(worker, token, filteredText, minTCs, feature)
  3. acumular TCs o registrar warning si falla
renumerar TC-01..TC-N secuencialmente
```

**Flujo sin features**: single-pass con prompt mejorado (Pieza A ya aplicada)

**Commits**:
- `7b5ef8a` test: add failing tests for focal feature in prompt (TDD red)
- `fa2569d` feat: multi-pass generation per feature with partial failure

---

### Refactor — orchestrateGeneration como función pura

**Estado: COMPLETADO**

**Objetivo**: Extraer la lógica de negocio multi-pasada del IIFE del browser en una función pura testable.

**Problema detectado**: `runGeneration()` (130 líneas) mezclaba lógica de negocio (multi-pass, fusión, renumeración, fallo parcial) con orquestación UI (DOM updates, progress). 0 tests sobre el código más crítico.

**Solución**: Función pura `orchestrateGeneration({ extractedText, features, minTCs, generateFn, chunkFn, onProgress })` con dependency injection.

**Tests**: 5 nuevos (single-pass, multi-pass, renumeración, fallo parcial, fallo total)

**Commit**:
- `c43d6e0` refactor: extract orchestrateGeneration as testable pure function

---

## Resumen técnico

| Métrica | Valor |
|---|---|
| Tests totales | 61 |
| Tests nuevos | 22 |
| Archivos nuevos | 3 (text-chunker.js, text-chunker.test.js, orchestrate.test.js) |
| Archivos modificados | 8 |
| Líneas añadidas | ~904 |
| Commits | 9 (incluyendo merge) |
| Rama | `feature/ana-feedback-improvements` → merged to `main` |

## Producción

- **Webapp**: https://raona-uat.pages.dev
- **Worker**: https://raona-uat-worker.alexoliveperez.workers.dev
- **Deploy**: completado 2026-03-23

## Limitaciones que persisten

- El modelo (Llama 3.3 70B gratis) tiene capacidad limitada de razonamiento fino — los pasos de UI serán genéricos
- JSON malformado ~10% de las veces (repair automático mitiga)
- Un modelo de pago (GPT-4, Claude) mejoraría calidad de steps y consistencia JSON significativamente
- El text-chunker usa keyword matching simple, no embeddings semánticos
