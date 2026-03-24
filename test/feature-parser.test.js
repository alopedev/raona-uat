/**
 * feature-parser.js tests — parse/clean feature names from pasted text.
 */

import { describe, it, expect } from 'vitest';
import { parseFeatureInput } from '../webapp/js/feature-parser.js';

describe('parseFeatureInput — delimiters', () => {

  it('parses comma-separated features', () => {
    const result = parseFeatureInput('Gestión Documental, Firma Electrónica');
    expect(result).toEqual(['Gestión Documental', 'Firma Electrónica']);
  });

  it('parses newline-separated features', () => {
    const result = parseFeatureInput('Gestión Documental\nFirma Electrónica');
    expect(result).toEqual(['Gestión Documental', 'Firma Electrónica']);
  });

  it('parses mixed commas and newlines', () => {
    const result = parseFeatureInput('Gestión Documental, Firma Electrónica\nAuditoría');
    expect(result).toEqual(['Gestión Documental', 'Firma Electrónica', 'Auditoría']);
  });

});

describe('parseFeatureInput — prefix cleaning', () => {

  it('strips FT.01 - prefix', () => {
    const result = parseFeatureInput('FT.01 - Gestión Documental');
    expect(result).toEqual(['Gestión Documental']);
  });

  it('strips FT.02B - prefix (with letter suffix)', () => {
    const result = parseFeatureInput('FT.02B - Manejo de Apartados');
    expect(result).toEqual(['Manejo de Apartados']);
  });

  it('strips RQ.08 - prefix', () => {
    const result = parseFeatureInput('RQ.08 - Acceso sin credenciales');
    expect(result).toEqual(['Acceso sin credenciales']);
  });

  it('strips bullet prefix "- "', () => {
    const result = parseFeatureInput('- Gestión Documental\n- Firma Electrónica');
    expect(result).toEqual(['Gestión Documental', 'Firma Electrónica']);
  });

  it('strips numbered prefix "1. "', () => {
    const result = parseFeatureInput('1. Gestión Documental\n2. Firma Electrónica');
    expect(result).toEqual(['Gestión Documental', 'Firma Electrónica']);
  });

  it('strips bullet prefix "• "', () => {
    const result = parseFeatureInput('• Gestión Documental\n• Firma Electrónica');
    expect(result).toEqual(['Gestión Documental', 'Firma Electrónica']);
  });

});

describe('parseFeatureInput — edge cases', () => {

  it('trims whitespace from each feature', () => {
    const result = parseFeatureInput('  Gestión Documental  ,  Firma  ');
    expect(result).toEqual(['Gestión Documental', 'Firma']);
  });

  it('filters empty tokens', () => {
    const result = parseFeatureInput('Gestión Documental,,, Firma\n\n');
    expect(result).toEqual(['Gestión Documental', 'Firma']);
  });

  it('removes duplicates (case-insensitive)', () => {
    const result = parseFeatureInput('Gestión Documental, gestión documental, GESTIÓN DOCUMENTAL');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Gestión Documental');
  });

  it('respects max features cap (10)', () => {
    const input = Array.from({ length: 15 }, (_, i) => `Feature ${i + 1}`).join(', ');
    const result = parseFeatureInput(input);
    expect(result).toHaveLength(10);
    expect(result[9]).toBe('Feature 10');
  });

  it('returns empty array for empty input', () => {
    expect(parseFeatureInput('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(parseFeatureInput('   \n  \n  ')).toEqual([]);
  });

  it('accepts custom maxFeatures', () => {
    const input = 'A, B, C, D, E';
    const result = parseFeatureInput(input, 3);
    expect(result).toHaveLength(3);
  });

});
