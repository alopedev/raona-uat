/**
 * text-chunker.js tests — client-side relevance filtering by feature.
 */

import { describe, it, expect } from 'vitest';
import { extractRelevantText, normalizeAccents, splitIntoChunks, scoreChunk } from '../webapp/js/text-chunker.js';

describe('normalizeAccents', () => {

  it('strips accents and lowercases', () => {
    expect(normalizeAccents('Documentación')).toBe('documentacion');
  });

  it('handles mixed accents', () => {
    expect(normalizeAccents('Gestión Electrónica')).toBe('gestion electronica');
  });

  it('preserves non-accented text', () => {
    expect(normalizeAccents('hello world')).toBe('hello world');
  });

});

describe('splitIntoChunks', () => {

  it('splits on double newlines', () => {
    const text = 'Párrafo uno.\n\nPárrafo dos.\n\nPárrafo tres.';
    const chunks = splitIntoChunks(text);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toBe('Párrafo uno.');
  });

  it('splits on heading-style lines', () => {
    const text = '## Gestión Documental\nContenido de la sección.\n\n## Firma Electrónica\nOtra sección.';
    const chunks = splitIntoChunks(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to sliding window for unstructured text', () => {
    const text = 'A'.repeat(3000); // long unstructured text, no paragraph breaks
    const chunks = splitIntoChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('filters out empty chunks', () => {
    const text = 'Párrafo.\n\n\n\n\nOtro párrafo.';
    const chunks = splitIntoChunks(text);
    for (const chunk of chunks) {
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
  });

});

describe('scoreChunk', () => {

  it('scores higher when keywords match', () => {
    const keywords = ['gestion', 'documental'];
    const high = scoreChunk('Gestión Documental: importar PDFs al repositorio', keywords);
    const low = scoreChunk('El usuario puede exportar logs a Excel', keywords);
    expect(high).toBeGreaterThan(low);
  });

  it('gives heading boost', () => {
    const keywords = ['firma'];
    const heading = scoreChunk('## Firma Electrónica', keywords);
    const body = scoreChunk('La firma se aplica al documento', keywords);
    expect(heading).toBeGreaterThan(body);
  });

});

describe('extractRelevantText', () => {

  const sampleDoc = [
    '## Gestión Documental',
    'Esta sección cubre la importación y gestión de documentos en el repositorio.',
    'Los documentos se clasifican automáticamente según metadatos.',
    '',
    '## Firma Electrónica',
    'La firma electrónica permite validar documentos de forma segura.',
    'Se integra con el sistema de certificados digitales.',
    '',
    '## Auditoría',
    'Los logs de auditoría registran todas las acciones realizadas.',
    'Se pueden exportar a Excel para análisis.',
    '',
    '## Permisos y Roles',
    'Cada usuario tiene un rol asignado que determina sus permisos.',
    'Los roles disponibles son: Viewer, Owner, Importer, Functional Admin.',
  ].join('\n');

  it('extracts paragraphs relevant to a feature', () => {
    const result = extractRelevantText(sampleDoc, 'Gestión Documental');
    expect(result).toContain('importación');
    expect(result).toContain('metadatos');
  });

  it('maintains original document order', () => {
    const result = extractRelevantText(sampleDoc, 'Gestión Documental');
    const importIdx = result.indexOf('importación');
    const metadatosIdx = result.indexOf('metadatos');
    expect(importIdx).toBeLessThan(metadatosIdx);
  });

  it('normalizes accents for matching', () => {
    const result = extractRelevantText(sampleDoc, 'Documentacion');
    // Should still match "Gestión Documental" section
    expect(result).toContain('documentos');
  });

  it('returns full text when feature name is empty', () => {
    const result = extractRelevantText(sampleDoc, '');
    expect(result).toBe(sampleDoc);
  });

  it('respects targetChars limit', () => {
    const result = extractRelevantText(sampleDoc, 'Gestión Documental', { targetChars: 50 });
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it('returns non-empty result for valid feature', () => {
    const result = extractRelevantText(sampleDoc, 'Firma Electrónica');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('firma');
  });

});
