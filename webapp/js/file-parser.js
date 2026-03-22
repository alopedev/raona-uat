/**
 * file-parser.js — Extracción de texto de PDFs y Excel client-side
 * Usa pdf.js (Mozilla) y SheetJS
 *
 * @typedef {Object} ParseResult
 * @property {string} text — Texto extraído concatenado
 * @property {boolean} truncated — true si se truncó por exceder MAX_CHARS
 */

/** @type {number} */
/** Max chars — Llama 3.3 70B context is ~128K tokens, but we cap for cost/speed */
const MAX_CHARS = 50_000;

/** @type {ReadonlySet<string>} Supported file extensions — single source of truth */
const SUPPORTED_EXTENSIONS = Object.freeze(new Set(['pdf', 'xlsx', 'xls', 'csv']));

/**
 * Extract file extension from filename.
 * @param {File} file
 * @returns {string}
 */
const fileExt = (file) => file.name.split('.').pop()?.toLowerCase() ?? '';

/**
 * Extrae texto de un archivo PDF usando pdf.js.
 * @param {File} file
 * @returns {Promise<string>}
 */
async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ');
    pages.push(text);
  }

  return pages.join('\n\n');
}

/**
 * Extrae texto de un archivo Excel usando SheetJS.
 * @param {File} file
 * @returns {Promise<string>}
 */
async function extractTextFromExcel(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  return workbook.SheetNames
    .map(name => {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false });
      return csv.trim() ? `--- ${name} ---\n${csv}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Parse a single file — returns extracted text or error placeholder.
 * @param {File} file
 * @returns {Promise<string>}
 */
async function parseSingleFile(file) {
  const ext = fileExt(file);
  try {
    if (ext === 'pdf') return await extractTextFromPDF(file);
    if (SUPPORTED_EXTENSIONS.has(ext) && ext !== 'pdf') return await extractTextFromExcel(file);
    return '';
  } catch (err) {
    console.warn(`Error procesando ${file.name}:`, err);
    return `[Error extrayendo texto de ${file.name}]`;
  }
}

/**
 * Procesa múltiples archivos en paralelo y devuelve el texto concatenado.
 * @param {File[]} files — lista de archivos
 * @returns {Promise<ParseResult>}
 */
async function parseUploadedFiles(files) {
  const results = await Promise.allSettled(files.map(parseSingleFile));
  const texts = results.map(r => r.status === 'fulfilled' ? r.value : '').filter(Boolean);

  let text = texts.join('\n\n');
  const truncated = text.length > MAX_CHARS;

  if (truncated) {
    text = text.substring(0, MAX_CHARS);
  }

  return { text, truncated };
}
