/**
 * feature-parser.js — Parse and clean feature names from pasted/typed text.
 * Supports comma-separated, newline-separated, and mixed inputs.
 * Strips formal prefixes (FT.01, RQ.08), bullets, and numbering.
 */

/** @type {RegExp} Formal ID prefixes: FT.01 -, RQ.08 -, RL.03 — etc. */
const ID_PREFIX_RE = /^[A-Z]{1,4}[.\-]?\d+[A-Za-z]?\s*[-–—:]\s*/;

/** @type {RegExp} Bullet or numbered list prefixes: "- ", "• ", "1. ", "12. " */
const BULLET_RE = /^(?:[-•]\s+|\d+\.\s+)/;

/**
 * Parse a raw string into an array of clean feature names.
 * @param {string} input — raw text (comma/newline separated)
 * @param {number} [maxFeatures=10] — maximum features to return
 * @returns {string[]}
 */
function parseFeatureInput(input, maxFeatures = 10) {
  if (!input || !input.trim()) return [];

  const tokens = input.split(/[,\n]+/);
  const seen = new Set();
  const result = [];

  for (const raw of tokens) {
    let name = raw.trim();
    if (!name) continue;

    // Strip formal ID prefix (FT.01 - , RQ.08 — , etc.)
    name = name.replace(ID_PREFIX_RE, '');

    // Strip bullet/numbered list prefix
    name = name.replace(BULLET_RE, '');

    name = name.trim();
    if (!name) continue;

    // Case-insensitive dedup
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    result.push(name);
    if (result.length >= maxFeatures) break;
  }

  return result;
}

// Conditional export for Node.js/vitest
if (typeof module !== 'undefined') {
  module.exports = { parseFeatureInput };
}
