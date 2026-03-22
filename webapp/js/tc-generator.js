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

  return accumulated;
}

/**
 * Extract JSON array from text, even if surrounded by markdown or extra text.
 * @param {string} text
 * @returns {TestCase[]}
 */
function extractTestCasesJSON(text) {
  const jsonMatch = text.trim().match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('La respuesta no tiene el formato esperado — inténtalo de nuevo');
  }

  let jsonStr = jsonMatch[0];

  // Attempt direct parse first
  try {
    return JSON.parse(jsonStr);
  } catch {
    // LLMs sometimes produce slightly malformed JSON — try to repair common issues:
    // 1. Unquoted values after colon (e.g. "observations":— instead of "observations":"—")
    jsonStr = jsonStr.replace(/:(\s*)([^"\s\d\[\]{},][^,}\]]*)/g, ':$1"$2"');
    // 2. Trailing commas before } or ]
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    // 3. Single quotes instead of double
    jsonStr = jsonStr.replace(/'/g, '"');

    try {
      return JSON.parse(jsonStr);
    } catch {
      throw new Error('La respuesta no tiene el formato esperado — inténtalo de nuevo');
    }
  }
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
  return extractTestCasesJSON(accumulated);
}

// Conditional export for Node.js/vitest (browser ignores this)
if (typeof module !== 'undefined') {
  module.exports = { extractTestCasesJSON, parseSSEStream, parseErrorBody, buildSystemPrompt, CLIENT_MAX_TOKENS };
}
