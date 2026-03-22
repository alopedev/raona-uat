/**
 * Excel builder tests — verifies workbook structure without environment references.
 */

import { describe, it, expect } from 'vitest';
import { generateUATWorkbook } from '../webapp/js/excel-builder.js';

const baseCfg = {
  project_name: 'True Copy Beta 3',
  date: '20 de marzo de 2026',
  client: 'Esteve',
  consultant: 'Alex Olivé',
  objective: 'Verificar el correcto funcionamiento de True Copy Beta 3.',
  header_color: '80C1CD',
  test_cases: [
    { tc_id: 'TC-01', area: 'Login', description: 'Test login', expected_result: 'OK', status: 'Pendiente de validar', observations: '—' },
  ],
  bugs: [],
};

/**
 * Collect all cell values from a worksheet as strings.
 * @param {import('exceljs').Worksheet} ws
 * @returns {string[]}
 */
function allCellValues(ws) {
  const values = [];
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.value != null) values.push(String(cell.value));
    });
  });
  return values;
}

describe('generateUATWorkbook — no environment references', () => {

  it('Instrucciones tab does not contain "Entorno" section', async () => {
    const wb = await generateUATWorkbook(baseCfg);
    const ws = wb.getWorksheet('Instrucciones');
    const values = allCellValues(ws);
    const hasEntorno = values.some(v => /entorno de pruebas/i.test(v));
    expect(hasEntorno).toBe(false);
  });

  it('objective does not reference entorno', async () => {
    const wb = await generateUATWorkbook(baseCfg);
    const ws = wb.getWorksheet('Instrucciones');
    const values = allCellValues(ws);
    const objectiveCell = values.find(v => v.includes('Verificar'));
    expect(objectiveCell).toBeDefined();
    expect(objectiveCell).not.toMatch(/entorno/i);
  });

  it('Test Cases footer does not reference entorno', async () => {
    const wb = await generateUATWorkbook(baseCfg);
    const ws = wb.getWorksheet('Test Cases');
    const values = allCellValues(ws);
    const hasEntornoFooter = values.some(v => /entorno:/i.test(v));
    expect(hasEntornoFooter).toBe(false);
  });

});
