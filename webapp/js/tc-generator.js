/**
 * tc-generator.js — Genera TCs via Workers AI (Llama 3.3 70B) con streaming SSE
 * @typedef {import('./excel-builder').TestCase} TestCase
 */

/**
 * Build system prompt with dynamic minTCs injection.
 * @param {number} minTCs — minimum number of test cases to generate
 * @returns {string}
 */
function buildSystemPrompt(minTCs) {
  return `Eres un generador experto de test cases para validaciones UAT de proyectos de software.

A partir de la documentación proporcionada, genera un mínimo de ${minTCs} test cases siguiendo estas reglas:

REGLAS:
1. Cobertura end-to-end: seguir flujo natural del usuario (crear → usar → gestionar → auditar)
2. 1 TC = 1 funcionalidad: no mezclar flujos distintos en un mismo TC. Si un test case cubre más de una funcionalidad, divídelo en TCs separados.
3. Descripción en imperativo: acciones del tester ("Subir PDF a Inbox...", "Filtrar por estado...")
4. Resultado verificable: comportamiento observable ("Documento aparece con estado Vigente")
5. Roles explícitos: TC específico para restricciones de permisos (qué NO puede hacer cada rol)
6. Edge cases si aplican: docs corruptos, campos vacíos, expiración — solo si la documentación los contempla
7. Sin implementación: no mencionar tecnología interna, describir desde perspectiva del usuario
8. Granularidad adecuada: suficiente para que un usuario no técnico entienda qué hacer

EJEMPLO (nivel de calidad esperado):
TC-01 | Creación espacio | Solicitar creación de un nuevo espacio. Rellenar formulario con nombre, roles y metadatos opcionales. Admin aprueba solicitud | Plantilla provisiona automáticamente los componentes del espacio. El espacio aparece accesible
TC-04 | Documentos corruptos | Subir un PDF corrupto o inválido | Documento se separa a espacio de revisión con motivo del error. Usuario recibe notificación

FORMATO DE SALIDA — responde SOLO con JSON, sin texto adicional:
[
  {
    "tc_id": "TC-01",
    "area": "Nombre del área funcional",
    "description": "Pasos que ejecuta el tester...",
    "expected_result": "Comportamiento esperado observable...",
    "status": "Pendiente de validar",
    "observations": "—"
  }
]`;
}

/** @type {number} Must match worker MAX_TOKENS_CEILING */
const CLIENT_MAX_TOKENS = 8192;

/**
 * Parse error body safely — returns message string.
 * @param {string} body
 * @returns {string}
 */
function parseErrorBody(body) {
  try {
    const { error } = JSON.parse(body);
    return error ?? body;
  } catch {
    return body;
  }
}

/**
 * Parse SSE stream from Workers AI, accumulating text deltas.
 * @param {ReadableStream} stream
 * @param {(partial: string) => void} [onProgress]
 * @returns {Promise<string>} — accumulated text
 */
async function parseSSEStream(stream, onProgress) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);

        // Workers AI format: { response: "text" } — skip null (final event)
        if (event.response != null && typeof event.response === 'string') {
          accumulated += event.response;
          onProgress?.(accumulated);
          continue;
        }
        if ('response' in event) continue; // skip null/usage events

        if (event.type === 'error') {
          throw new Error(event.error?.message ?? 'Error en la respuesta');
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  // Flush any remaining bytes in the decoder (handles split UTF-8 sequences)
  const remaining = decoder.decode();
  if (remaining) {
    buffer += remaining;
  }

  // Process any remaining buffered line
  if (buffer.trim()) {
    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6);
      if (data !== '[DONE]') {
        try {
          const event = JSON.parse(data);
          if (event.response != null && typeof event.response === 'string') {
            accumulated += event.response;
          }
        } catch { /* ignore */ }
      }
    }
  }

  return accumulated;
}

/**
 * Extract JSON array from text, even if surrounded by markdown or extra text.
 * @param {string} text
 * @returns {TestCase[]}
 */
function extractTestCasesJSON(text) {
  const trimmed = text.trim();
  let jsonMatch = trimmed.match(/\[[\s\S]*\]/);

  // If no complete array found, attempt truncation recovery
  if (!jsonMatch) {
    const recovered = recoverTruncatedJSON(trimmed);
    if (recovered) {
      jsonMatch = [recovered];
    } else {
      throw new Error('La respuesta no tiene el formato esperado — inténtalo de nuevo');
    }
  }

  let jsonStr = jsonMatch[0];
  return parseWithRepair(jsonStr);
}

/**
 * Attempt to recover complete TC objects from truncated JSON.
 * Finds the last complete object (ending with }) and closes the array.
 * @param {string} text
 * @returns {string|null} — repaired JSON string or null
 */
function recoverTruncatedJSON(text) {
  const start = text.indexOf('[');
  if (start === -1) return null;

  const content = text.slice(start + 1);
  // Find all complete objects by matching balanced braces
  const objects = [];
  let depth = 0;
  let objStart = -1;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '{' && depth === 0) objStart = i;
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (ch === '}' && depth === 0 && objStart !== -1) {
      objects.push(content.slice(objStart, i + 1));
      objStart = -1;
    }
  }

  if (objects.length === 0) return null;
  return '[' + objects.join(',') + ']';
}

/**
 * Parse JSON with progressive repair strategies.
 * @param {string} jsonStr
 * @returns {TestCase[]}
 */
function parseWithRepair(jsonStr) {
  // 1. Direct parse
  try { return JSON.parse(jsonStr); } catch { /* continue */ }

  // 2. Safe repair: trailing commas only
  let repaired = jsonStr.replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(repaired); } catch { /* continue */ }

  // 3. Aggressive repair: unquoted values (scoped to key-value patterns)
  repaired = repaired.replace(/"(\w+)"\s*:\s*([^"\s\d\[\]{},][^,}\]]*)/g, '"$1": "$2"');
  try { return JSON.parse(repaired); } catch { /* continue */ }

  throw new Error('La respuesta no tiene el formato esperado — inténtalo de nuevo');
}

/**
 * Genera test cases enviando texto al Worker con streaming.
 * @param {string} workerUrl — URL del Cloudflare Worker
 * @param {string} teamToken — contraseña de equipo
 * @param {string} documentText — texto extraído de la documentación
 * @param {(partial: string) => void} [onProgress] — callback con texto parcial acumulado
 * @param {number} [minTCs=10] — mínimo de test cases a generar
 * @returns {Promise<TestCase[]>} — array de test cases
 */
async function generateTestCases(workerUrl, teamToken, documentText, onProgress, minTCs = 10) {
  const MAX_RETRIES = 1;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response;
    try {
      response = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${teamToken}`,
        },
        body: JSON.stringify({
          max_tokens: CLIENT_MAX_TOKENS,
          system: buildSystemPrompt(minTCs),
          messages: [{ role: 'user', content: documentText }],
        }),
      });
    } catch (networkErr) {
      throw new Error('No se ha podido conectar con el servidor — verifica tu conexión o inténtalo más tarde');
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(parseErrorBody(errorBody));
    }

    const accumulated = await parseSSEStream(response.body, onProgress);

    try {
      return extractTestCasesJSON(accumulated);
    } catch (parseErr) {
      if (attempt < MAX_RETRIES) {
        onProgress?.('Reintentando generación...');
        continue;
      }
      throw parseErr;
    }
  }
}

// Conditional export for Node.js/vitest (browser ignores this)
if (typeof module !== 'undefined') {
  module.exports = { extractTestCasesJSON, recoverTruncatedJSON, parseWithRepair, parseSSEStream, parseErrorBody, buildSystemPrompt, CLIENT_MAX_TOKENS };
}
