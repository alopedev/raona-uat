/**
 * TC Generator parser tests — imports from actual source (no duplication).
 */

import { describe, it, expect } from 'vitest';
import { extractTestCasesJSON } from '../webapp/js/tc-generator.js';

describe('extractTestCasesJSON', () => {

  it('parses clean JSON array', () => {
    const input = '[{"tc_id":"TC-01","area":"Login","description":"Test login","expected_result":"OK","status":"Pendiente de validar","observations":"—"}]';
    const result = extractTestCasesJSON(input);
    expect(result).toHaveLength(1);
    expect(result[0].tc_id).toBe('TC-01');
  });

  it('extracts JSON from surrounding markdown text', () => {
    const input = 'Here are the test cases:\n\n```json\n[{"tc_id":"TC-01","area":"A","description":"D","expected_result":"R","status":"Pendiente de validar","observations":"—"}]\n```\n\nLet me know.';
    const result = extractTestCasesJSON(input);
    expect(result).toHaveLength(1);
    expect(result[0].tc_id).toBe('TC-01');
  });

  it('handles multiple test cases', () => {
    const tcs = Array.from({ length: 5 }, (_, i) => ({
      tc_id: `TC-0${i + 1}`, area: 'Area', description: 'Desc',
      expected_result: 'Result', status: 'Pendiente de validar', observations: '—',
    }));
    expect(extractTestCasesJSON(JSON.stringify(tcs))).toHaveLength(5);
  });

  it('throws on text without JSON array', () => {
    expect(() => extractTestCasesJSON('No test cases here')).toThrow('formato esperado');
  });

  it('throws on malformed JSON', () => {
    expect(() => extractTestCasesJSON('[{"broken": true')).toThrow('formato esperado');
  });

  it('handles unicode and accents', () => {
    const input = '[{"tc_id":"TC-01","area":"Creación espacio","description":"Solicitar creación","expected_result":"OK","status":"Pendiente de validar","observations":"—"}]';
    expect(extractTestCasesJSON(input)[0].area).toBe('Creación espacio');
  });

});
