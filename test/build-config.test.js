/**
 * buildUATConfig tests — pure function extracted from app.js (candidate B).
 */

import { describe, it, expect } from 'vitest';
import { buildUATConfig } from '../webapp/js/app.js';

describe('buildUATConfig', () => {

  const base = {
    projectName: 'True Copy Beta 3',
    client: 'Esteve',
    consultant: 'Alex Olivé',
    dateValue: '2026-03-20',
    locale: 'es-ES',
    dateOptions: { day: 'numeric', month: 'long', year: 'numeric' },
    headerColor: '80C1CD',
    testCases: [{ tc_id: 'TC-01', area: 'A', description: 'D', expected_result: 'R', status: 'Pendiente de validar', observations: '—' }],
  };

  it('builds config with all fields', () => {
    const cfg = buildUATConfig(base);
    expect(cfg.project_name).toBe('True Copy Beta 3');
    expect(cfg.client).toBe('Esteve');
    expect(cfg.test_cases).toHaveLength(1);
    expect(cfg.bugs).toEqual([]);
  });

  it('generates objective from project name only', () => {
    const cfg = buildUATConfig(base);
    expect(cfg.objective).toContain('True Copy Beta 3');
  });

  it('does not include environment in config', () => {
    const cfg = buildUATConfig(base);
    expect(cfg).not.toHaveProperty('environment');
    expect(cfg.objective).not.toMatch(/entorno/i);
  });

  it('formats date in Spanish locale', () => {
    const cfg = buildUATConfig(base);
    expect(cfg.date).toContain('2026');
    expect(cfg.date).toContain('marzo');
  });

  it('uses current date when dateValue is empty', () => {
    const cfg = buildUATConfig({ ...base, dateValue: '' });
    expect(cfg.date).toBeTruthy();
    expect(cfg.date.length).toBeGreaterThan(5);
  });

  it('passes header_color through', () => {
    const cfg = buildUATConfig({ ...base, headerColor: 'FF0000' });
    expect(cfg.header_color).toBe('FF0000');
  });

});
