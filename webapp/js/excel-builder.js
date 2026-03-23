/**
 * excel-builder.js — Generador de Excel UAT con ExcelJS
 * Port de generate_uat_report.py (openpyxl -> ExcelJS)
 *
 * @typedef {Object} TestCase
 * @property {string} tc_id — Identificador (TC-01, TC-02...)
 * @property {string} area — Área funcional
 * @property {string} description — Resumen breve de lo que se prueba
 * @property {string[]} [steps] — Pasos numerados para el tester
 * @property {string} expected_result — Resultado esperado observable
 * @property {string} status — "Pendiente de validar" | "Validado" | "No validado"
 * @property {string} [observations] — Notas o "—"
 *
 * @typedef {Object} Bug
 * @property {string} bug_id — ID del work item
 * @property {string} title — Descripción del bug
 * @property {string} status — "Closed" | "Resolved" | "Active" | "New"
 * @property {string} resolution — Descripción del fix
 *
 * @typedef {Object} UATConfig
 * @property {string} project_name
 * @property {string} date
 * @property {string} client
 * @property {string} consultant
 * @property {string} objective
 * @property {string} [header_color] — Hex sin #, defecto: 80C1CD
 * @property {TestCase[]} [test_cases]
 * @property {Bug[]} [bugs]
 */

// ---------------------------------------------------------------------------
// Estilos base (frozen objects — modern-javascript-patterns)
// ---------------------------------------------------------------------------

const THIN_BORDER = Object.freeze({
  left: Object.freeze({ style: 'thin', color: Object.freeze({ argb: 'FFD0D0D0' }) }),
  right: Object.freeze({ style: 'thin', color: Object.freeze({ argb: 'FFD0D0D0' }) }),
  top: Object.freeze({ style: 'thin', color: Object.freeze({ argb: 'FFD0D0D0' }) }),
  bottom: Object.freeze({ style: 'thin', color: Object.freeze({ argb: 'FFD0D0D0' }) }),
});

const WRAP_TOP = Object.freeze({ wrapText: true, vertical: 'top' });
const WRAP_CENTER = Object.freeze({ wrapText: true, vertical: 'top', horizontal: 'center' });

// Títulos y secciones (pestaña Instrucciones)
const TITLE_FONT = { name: 'Poppins', size: 14, bold: true, color: { argb: 'FF333333' } };
const SECTION_FONT = { name: 'Poppins', size: 11, bold: true, color: { argb: 'FF333333' } };
const BODY_FONT = { name: 'Segoe UI', size: 10, color: { argb: 'FF333333' } };
const META_FONT = { name: 'Segoe UI', size: 10, color: { argb: 'FF666666' } };

// Títulos tabla (pestaña Test Cases / Bugs)
const TABLE_TITLE = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF333333' } };
const TABLE_BODY = { name: 'Segoe UI', size: 10 };
const TABLE_BOLD = { name: 'Segoe UI', size: 10, bold: true };

// Leyenda
const LEGEND_LABEL = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF666666' } };
const LEGEND_ITEM = { name: 'Segoe UI', size: 9, bold: true };
const LEGEND_DESC = { name: 'Segoe UI', size: 9, color: { argb: 'FF666666' } };

// Fills para estados de test cases
const FILL_VALIDADO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
const FILL_NO_VALIDADO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
const FILL_PENDIENTE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };

// Status font factory — eliminates repetition
const makeStatusFont = (argb) => ({ name: 'Segoe UI', size: 10, bold: true, color: { argb } });

const FONT_VALIDADO = makeStatusFont('FF2E7D32');
const FONT_NO_VALIDADO = makeStatusFont('FFC00000');
const FONT_PENDIENTE = makeStatusFont('FF9C6500');

const BUG_STATUS_FONTS = {
  'Closed': makeStatusFont('FF2E7D32'),
  'Resolved': makeStatusFont('FFE68A00'),
  'Active': makeStatusFont('FF1565C0'),
  'New': makeStatusFont('FF757575'),
};

// Shared legend items — used in both Instrucciones and Test Cases tabs
const LEGEND_ITEMS = Object.freeze([
  { label: 'Pendiente de validar', desc: 'No ha sido aún testeado', fill: FILL_PENDIENTE },
  { label: 'Validado', desc: 'Testeado y aprobado', fill: FILL_VALIDADO },
  { label: 'No validado', desc: 'Testeado y no aprobado', fill: FILL_NO_VALIDADO },
]);

const TC_STATUS_MAP = Object.freeze({
  'Validado': Object.freeze({ font: FONT_VALIDADO, fill: FILL_VALIDADO }),
  'No validado': Object.freeze({ font: FONT_NO_VALIDADO, fill: FILL_NO_VALIDADO }),
  'Pendiente de validar': Object.freeze({ font: FONT_PENDIENTE, fill: FILL_PENDIENTE }),
});

// ---------------------------------------------------------------------------
// Funciones auxiliares
// ---------------------------------------------------------------------------

function makeHeaderFont() {
  return { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
}

function makeHeaderFill(colorHex) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${colorHex}` } };
}

function applyHeaderRow(ws, rowNum, columns, widths, colorHex) {
  const hFont = makeHeaderFont();
  const hFill = makeHeaderFill(colorHex);
  columns.forEach((header, i) => {
    const colIdx = i + 2; // empieza en B
    const cell = ws.getCell(rowNum, colIdx);
    cell.value = header;
    cell.font = hFont;
    cell.fill = hFill;
    cell.alignment = WRAP_CENTER;
    cell.border = THIN_BORDER;
    ws.getColumn(colIdx).width = widths[i];
  });
}

/**
 * Write a data cell with styles.
 * @param {ExcelJS.Worksheet} ws
 * @param {number} rowNum
 * @param {number} colIdx
 * @param {string} value
 * @param {Object} [font]
 * @param {Object} [alignment]
 * @returns {ExcelJS.Cell}
 */
function applyDataCell(ws, rowNum, colIdx, value, font, alignment) {
  const cell = ws.getCell(rowNum, colIdx);
  cell.value = value;
  cell.font = font ?? TABLE_BODY;
  cell.alignment = alignment ?? WRAP_TOP;
  cell.border = THIN_BORDER;
  return cell;
}

// ---------------------------------------------------------------------------
// Generadores de pestañas
// ---------------------------------------------------------------------------

function buildInstrucciones(wb, cfg) {
  const ws = wb.getWorksheet('Instrucciones');

  ws.getColumn('A').width = 100;
  ws.getColumn('B').width = 40;

  // Título
  const titleCell = ws.getCell('A1');
  titleCell.value = `UAT Report — ${cfg.project_name}`;
  titleCell.font = TITLE_FONT;
  ws.getRow(1).height = 24;

  // Objetivo
  ws.getCell('A3').value = 'Objetivo';
  ws.getCell('A3').font = SECTION_FONT;
  ws.getCell('A4').value = cfg.objective;
  ws.getCell('A4').font = BODY_FONT;
  ws.getCell('A4').alignment = WRAP_TOP;
  ws.getRow(4).height = 45;

  // Criterios de aceptación
  ws.getCell('A6').value = 'Criterios de aceptación';
  ws.getCell('A6').font = SECTION_FONT;
  ws.getCell('A7').value =
    '— Cada test case se marca como "Validado" si el comportamiento observado ' +
    'coincide con el resultado esperado.\n' +
    '— Se marca como "No validado" si el comportamiento difiere del esperado. ' +
    'En ese caso, se documenta en Observaciones y se registra como defecto.\n' +
    '— Los defectos identificados durante el testing se reportan en Azure DevOps ' +
    'y se resumen en la pestaña "Bugs identificados".';
  ws.getCell('A7').font = BODY_FONT;
  ws.getCell('A7').alignment = WRAP_TOP;
  ws.getRow(7).height = 65;

  // Leyenda de estados
  ws.getCell('A9').value = 'Estados de validación';
  ws.getCell('A9').font = SECTION_FONT;

  LEGEND_ITEMS.forEach((item, i) => {
    const rowIdx = 10 + i;
    const cellA = ws.getCell(rowIdx, 1);
    cellA.value = `    ${item.label}`;
    cellA.font = TABLE_BOLD;
    cellA.fill = item.fill;
    const cellB = ws.getCell(rowIdx, 2);
    cellB.value = item.desc;
    cellB.font = BODY_FONT;
  });
}

function buildTestCases(wb, cfg) {
  const ws = wb.addWorksheet('Test Cases');
  const color = cfg.header_color ?? '80C1CD';

  // Margen columna A
  ws.getColumn('A').width = 8.83;

  // Título (fila 2, merge B2:H2)
  ws.mergeCells('B2:H2');
  ws.getCell('B2').value = `UAT Report — ${cfg.project_name}`;
  ws.getCell('B2').font = TABLE_TITLE;
  ws.getRow(2).height = 28;

  // Subtítulo (fila 3, merge B3:H3)
  ws.mergeCells('B3:H3');
  ws.getCell('B3').value =
    `Fecha: ${cfg.date}  |  Proyecto: ${cfg.project_name}  |  ` +
    `Cliente: ${cfg.client}  |  Consultor: ${cfg.consultant}`;
  ws.getCell('B3').font = META_FONT;
  ws.getRow(3).height = 18;

  // Leyenda (filas 5-7)
  ws.getCell(5, 2).value = 'Leyenda:';
  ws.getCell(5, 2).font = LEGEND_LABEL;

  LEGEND_ITEMS.forEach((item, i) => {
    const rowIdx = 5 + i;
    const cellC = ws.getCell(rowIdx, 3);
    cellC.value = item.label;
    cellC.font = LEGEND_ITEM;
    cellC.fill = item.fill;
    const cellD = ws.getCell(rowIdx, 4);
    cellD.value = item.desc;
    cellD.font = LEGEND_DESC;
  });

  // Headers (fila 9)
  const HEADER_ROW = 9;
  const headers = ['TC ID', 'Área funcional', 'Descripción', 'Pasos', 'Resultado esperado', 'Estado', 'Observaciones'];
  const widths = [8, 22, 45, 45, 45, 20, 35];
  applyHeaderRow(ws, HEADER_ROW, headers, widths, color);

  // Datos
  const DATA_START = HEADER_ROW + 1;
  const testCases = cfg.test_cases ?? [];

  testCases.forEach((tc, i) => {
    const row = DATA_START + i;
    const stepsText = Array.isArray(tc.steps) && tc.steps.length > 0
      ? tc.steps.join('\n')
      : '—';
    const values = [
      tc.tc_id, tc.area, tc.description, stepsText,
      tc.expected_result, tc.status, tc.observations ?? '—',
    ];
    values.forEach((val, j) => {
      applyDataCell(ws, row, j + 2, val);
    });

    // Estilo columna Estado (col G = 7)
    const status = tc.status;
    if (TC_STATUS_MAP[status]) {
      const { font, fill } = TC_STATUS_MAP[status];
      const estadoCell = ws.getCell(row, 7); // col G = Estado
      estadoCell.font = font;
      estadoCell.fill = fill;
      estadoCell.alignment = WRAP_CENTER;
    }

    ws.getRow(row).height = 42;
  });

  // Dropdown de validación en columna Estado
  if (testCases.length > 0) {
    const dataEnd = DATA_START + testCases.length - 1;
    for (let r = DATA_START; r <= dataEnd; r++) {
      ws.getCell(r, 7).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"Pendiente de validar,Validado,No validado"'],
        error: 'Seleccionar un estado válido',
        errorTitle: 'Estado no válido',
        prompt: 'Seleccionar estado del test case',
        promptTitle: 'Estado',
      };
    }
  }

}

function buildBugs(wb, cfg) {
  const ws = wb.addWorksheet('Bugs identificados');
  const color = cfg.header_color ?? '80C1CD';
  const bugs = cfg.bugs ?? [];

  // Margen columna A
  ws.getColumn('A').width = 8.83;

  // Título (fila 2)
  ws.mergeCells('B2:E2');
  ws.getCell('B2').value = `Bugs identificados — ${cfg.project_name}`;
  ws.getCell('B2').font = TABLE_TITLE;
  ws.getRow(2).height = 28;

  // Subtítulo (fila 3)
  ws.mergeCells('B3:E3');
  ws.getCell('B3').value = 'Fuente: Azure DevOps';
  ws.getCell('B3').font = META_FONT;
  ws.getRow(3).height = 18;

  // Headers (fila 5)
  const headers = ['Bug ID', 'Título', 'Estado', 'Resolución'];
  const widths = [12, 60, 14, 55];
  applyHeaderRow(ws, 5, headers, widths, color);

  // Datos
  bugs.forEach((bug, i) => {
    const row = 6 + i;
    applyDataCell(ws, row, 2, bug.bug_id);
    applyDataCell(ws, row, 3, bug.title);

    const statusFont = BUG_STATUS_FONTS[bug.status] ?? TABLE_BODY;
    applyDataCell(ws, row, 4, bug.status, statusFont, WRAP_CENTER);
    applyDataCell(ws, row, 5, bug.resolution);

    ws.getRow(row).height = 30;
  });

  // Si no hay bugs, dejar 3 filas placeholder
  if (bugs.length === 0) {
    for (let row = 6; row <= 8; row++) {
      for (let col = 2; col <= 5; col++) {
        applyDataCell(ws, row, col, '');
      }
      ws.getRow(row).height = 30;
    }
  }

  // Resumen
  if (bugs.length > 0) {
    const counts = {};
    bugs.forEach(b => {
      counts[b.status] = (counts[b.status] ?? 0) + 1;
    });
    const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`);
    const summary = 'Resumen: ' + parts.join(' · ');
    const summaryRow = 6 + bugs.length + 1;
    ws.mergeCells(`B${summaryRow}:E${summaryRow}`);
    ws.getCell(`B${summaryRow}`).value = summary;
    ws.getCell(`B${summaryRow}`).font = META_FONT;
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Genera un workbook ExcelJS a partir de la configuración.
 * @param {UATConfig} cfg
 * @returns {Promise<ExcelJS.Workbook>}
 */
async function generateUATWorkbook(cfg) {
  const _ExcelJS = typeof ExcelJS !== 'undefined' ? ExcelJS : require('exceljs');
  const wb = new _ExcelJS.Workbook();
  wb.creator = 'Raona UAT Generator';
  wb.created = new Date();

  // Crear hoja por defecto (Instrucciones)
  wb.addWorksheet('Instrucciones');

  buildInstrucciones(wb, cfg);
  buildTestCases(wb, cfg);
  buildBugs(wb, cfg);

  return wb;
}

// Conditional export for Node.js/vitest
if (typeof module !== 'undefined') {
  module.exports = { generateUATWorkbook };
}

