/**
 * Cloudflare Worker — Genera TCs usando Workers AI (Llama 3)
 * Sin API key externa. Usa binding AI de Cloudflare (gratis 10K neurons/día).
 *
 * @typedef {Object} WorkerEnv
 * @property {string} TEAM_TOKEN
 * @property {string} [ALLOWED_ORIGIN]
 * @property {Object} AI — Cloudflare Workers AI binding
 */

const MAX_BODY_SIZE = 512_000;
const MAX_TOKENS_CEILING = 16384;
const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/**
 * Build CORS headers from env.
 * @param {WorkerEnv} env
 * @returns {Record<string, string>}
 */
function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/**
 * JSON error response helper.
 * @param {string} message
 * @param {number} status
 * @param {Record<string, string>} headers
 */
function jsonError(message, status, headers) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...headers, 'content-type': 'application/json' },
  });
}

/**
 * Validate a single message object.
 * @param {unknown} msg
 * @returns {boolean}
 */
function isValidMessage(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (!['user', 'assistant', 'system'].includes(msg.role)) return false;
  if (typeof msg.content !== 'string') return false;
  return true;
}

/**
 * Validate the request body structure.
 * @param {unknown} body
 * @returns {string|null} error message, or null if valid
 */
function validateRequestBody(body) {
  if (!body || typeof body !== 'object') return 'Body debe ser un objeto JSON';
  if (!Array.isArray(body.messages) || body.messages.length === 0) return 'Campo "messages" obligatorio (array no vacío)';
  for (const msg of body.messages) {
    if (!isValidMessage(msg)) return 'Cada mensaje debe tener role y content (string)';
  }
  if (body.max_tokens != null && (typeof body.max_tokens !== 'number' || body.max_tokens < 1)) return '"max_tokens" debe ser un número positivo';
  if (body.max_tokens != null && body.max_tokens > MAX_TOKENS_CEILING) return `"max_tokens" no puede exceder ${MAX_TOKENS_CEILING}`;
  return null;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);
    const startTime = Date.now();

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // Health check
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', model: AI_MODEL, timestamp: new Date().toISOString() }), {
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    if (request.method !== 'POST') {
      return jsonError('Método no permitido', 405, cors);
    }

    // Validate team token
    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${env.TEAM_TOKEN}`) {
      return jsonError('Contraseña incorrecta', 401, cors);
    }

    // Check actual body size
    let rawBody;
    try {
      rawBody = await request.text();
    } catch {
      return jsonError('Error leyendo el body', 400, cors);
    }
    if (rawBody.length > MAX_BODY_SIZE) {
      return jsonError('Petición demasiado grande (máx. 512 KB)', 413, cors);
    }

    // Parse and validate body
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonError('JSON inválido', 400, cors);
    }

    const validationError = validateRequestBody(body);
    if (validationError) {
      return jsonError(validationError, 400, cors);
    }

    // Build messages for Workers AI
    // Workers AI uses { role, content } format — system goes as first message
    const aiMessages = [];
    if (typeof body.system === 'string') {
      aiMessages.push({ role: 'system', content: body.system });
    }
    for (const msg of body.messages) {
      aiMessages.push({ role: msg.role, content: msg.content });
    }

    try {
      // Workers AI streaming response
      const stream = await env.AI.run(AI_MODEL, {
        messages: aiMessages,
        max_tokens: Math.min(body.max_tokens ?? 2048, MAX_TOKENS_CEILING),
        stream: true,
      });

      return new Response(stream, {
        headers: {
          ...cors,
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'x-response-time': `${Date.now() - startTime}ms`,
        },
      });
    } catch (err) {
      console.error('Workers AI error:', err.message);
      return jsonError('Error generando test cases — inténtalo de nuevo', 500, cors);
    }
  },
};
