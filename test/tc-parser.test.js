/**
 * TC Generator parser tests — imports from actual source (no duplication).
 */

import { describe, it, expect } from 'vitest';
import { extractTestCasesJSON, buildSystemPrompt } from '../webapp/js/tc-generator.js';

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

describe('extractTestCasesJSON — truncation recovery', () => {

  it('rescues complete TCs from truncated JSON', () => {
    const input = '[{"tc_id":"TC-01","area":"Login","description":"Test","expected_result":"OK","status":"Pendiente de validar","observations":"—"}, {"tc_id":"TC-02","area":"Lo';
    const result = extractTestCasesJSON(input);
    expect(result).toHaveLength(1);
    expect(result[0].tc_id).toBe('TC-01');
  });

  it('rescues multiple complete TCs from truncated JSON', () => {
    const tc1 = '{"tc_id":"TC-01","area":"A","description":"D","expected_result":"R","status":"Pendiente de validar","observations":"—"}';
    const tc2 = '{"tc_id":"TC-02","area":"B","description":"D2","expected_result":"R2","status":"Pendiente de validar","observations":"—"}';
    const input = `[${tc1}, ${tc2}, {"tc_id":"TC-03","area":"trun`;
    const result = extractTestCasesJSON(input);
    expect(result).toHaveLength(2);
    expect(result[1].tc_id).toBe('TC-02');
  });

  it('throws on truncated JSON with zero complete TCs', () => {
    const input = '[{"tc_id":"TC-01","area":"trun';
    expect(() => extractTestCasesJSON(input)).toThrow();
  });

});

describe('extractTestCasesJSON — repair edge cases', () => {

  it('handles colons inside description strings', () => {
    const input = '[{"tc_id":"TC-01","area":"Login","description":"Paso 1: hacer click en el botón","expected_result":"OK","status":"Pendiente de validar","observations":"—"}]';
    const result = extractTestCasesJSON(input);
    expect(result[0].description).toContain('Paso 1:');
  });

  it('repairs unquoted em dash in observations', () => {
    const input = '[{"tc_id":"TC-01","area":"A","description":"D","expected_result":"R","status":"Pendiente de validar","observations":—}]';
    const result = extractTestCasesJSON(input);
    expect(result[0].observations).toBe('—');
  });

  it('handles trailing comma before closing bracket', () => {
    const input = '[{"tc_id":"TC-01","area":"A","description":"D","expected_result":"R","status":"Pendiente de validar","observations":"—"},]';
    const result = extractTestCasesJSON(input);
    expect(result).toHaveLength(1);
  });

});

describe('buildSystemPrompt', () => {

  it('injects minTCs number into the prompt', () => {
    const prompt = buildSystemPrompt(15);
    expect(prompt).toContain('15');
    expect(prompt).toMatch(/mínimo.*15/i);
  });

  it('includes rule to split multi-functionality TCs', () => {
    const prompt = buildSystemPrompt(10);
    expect(prompt).toMatch(/div[ií]d/i);
  });

  it('uses different values for different minTCs', () => {
    const prompt8 = buildSystemPrompt(8);
    const prompt20 = buildSystemPrompt(20);
    expect(prompt8).toContain('8');
    expect(prompt20).toContain('20');
    expect(prompt8).not.toContain('20');
  });

  it('includes steps field in JSON schema', () => {
    const prompt = buildSystemPrompt(10);
    expect(prompt).toContain('"steps"');
  });

  it('includes rule about numbered steps for tester guidance', () => {
    const prompt = buildSystemPrompt(10);
    expect(prompt).toMatch(/pasos/i);
  });

  it('includes focal feature when provided', () => {
    const prompt = buildSystemPrompt(10, 'Gestión Documental');
    expect(prompt).toContain('Gestión Documental');
  });

  it('does not include focal instruction when feature is omitted', () => {
    const prompt = buildSystemPrompt(10);
    expect(prompt).not.toContain('FOCO');
  });

});

describe('extractTestCasesJSON — steps field', () => {

  it('parses TC with steps array', () => {
    const input = JSON.stringify([{
      tc_id: 'TC-01', area: 'Login', description: 'Test login',
      steps: ['1. Abrir navegador', '2. Ir a la URL', '3. Introducir credenciales'],
      expected_result: 'OK', status: 'Pendiente de validar', observations: '—',
    }]);
    const result = extractTestCasesJSON(input);
    expect(result).toHaveLength(1);
    expect(result[0].steps).toEqual(['1. Abrir navegador', '2. Ir a la URL', '3. Introducir credenciales']);
  });

  it('parses TC without steps (backward compat)', () => {
    const input = JSON.stringify([{
      tc_id: 'TC-01', area: 'Login', description: 'Test login',
      expected_result: 'OK', status: 'Pendiente de validar', observations: '—',
    }]);
    const result = extractTestCasesJSON(input);
    expect(result).toHaveLength(1);
    expect(result[0].steps).toBeUndefined();
  });

});
