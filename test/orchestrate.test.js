/**
 * orchestrateGeneration tests — pure business logic, no DOM.
 */

import { describe, it, expect, vi } from 'vitest';
import { orchestrateGeneration } from '../webapp/js/app.js';

describe('orchestrateGeneration', () => {

  const fakeTCs = [
    { tc_id: 'TC-01', area: 'Login', description: 'Test', steps: ['1. Step'], expected_result: 'OK', status: 'Pendiente de validar', observations: '—' },
  ];

  it('single-pass: calls generateFn once with full text when no features', async () => {
    const generateFn = vi.fn().mockResolvedValue(fakeTCs);
    const chunkFn = vi.fn();

    const result = await orchestrateGeneration({
      extractedText: 'Full document text',
      features: [],
      minTCs: 10,
      generateFn,
      chunkFn,
    });

    expect(generateFn).toHaveBeenCalledTimes(1);
    expect(generateFn).toHaveBeenCalledWith('Full document text', 10, undefined);
    expect(chunkFn).not.toHaveBeenCalled();
    expect(result.testCases).toEqual(fakeTCs);
    expect(result.warnings).toEqual([]);
  });

  it('multi-pass: calls generateFn once per feature with filtered text', async () => {
    const tcsA = [{ tc_id: 'TC-01', area: 'Docs', description: 'A', steps: [], expected_result: 'OK', status: 'Pendiente de validar', observations: '—' }];
    const tcsB = [{ tc_id: 'TC-01', area: 'Auth', description: 'B', steps: [], expected_result: 'OK', status: 'Pendiente de validar', observations: '—' }];

    const generateFn = vi.fn()
      .mockResolvedValueOnce(tcsA)
      .mockResolvedValueOnce(tcsB);
    const chunkFn = vi.fn()
      .mockReturnValueOnce('filtered for Docs')
      .mockReturnValueOnce('filtered for Auth');

    const result = await orchestrateGeneration({
      extractedText: 'Full doc',
      features: ['Gestión Documental', 'Autenticación'],
      minTCs: 5,
      generateFn,
      chunkFn,
    });

    expect(chunkFn).toHaveBeenCalledTimes(2);
    expect(chunkFn).toHaveBeenCalledWith('Full doc', 'Gestión Documental', { targetChars: 12_000 });
    expect(generateFn).toHaveBeenCalledTimes(2);
    expect(generateFn).toHaveBeenCalledWith('filtered for Docs', 5, 'Gestión Documental');
    expect(generateFn).toHaveBeenCalledWith('filtered for Auth', 5, 'Autenticación');
    expect(result.testCases).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('renumbers TC-IDs sequentially after merging features', async () => {
    const tcsA = [
      { tc_id: 'TC-01', area: 'A', description: 'a1', steps: [], expected_result: 'R', status: 'Pendiente de validar', observations: '—' },
      { tc_id: 'TC-02', area: 'A', description: 'a2', steps: [], expected_result: 'R', status: 'Pendiente de validar', observations: '—' },
    ];
    const tcsB = [
      { tc_id: 'TC-01', area: 'B', description: 'b1', steps: [], expected_result: 'R', status: 'Pendiente de validar', observations: '—' },
    ];

    const generateFn = vi.fn()
      .mockResolvedValueOnce(tcsA)
      .mockResolvedValueOnce(tcsB);
    const chunkFn = vi.fn().mockReturnValue('chunk');

    const result = await orchestrateGeneration({
      extractedText: 'doc',
      features: ['F1', 'F2'],
      minTCs: 5,
      generateFn,
      chunkFn,
    });

    expect(result.testCases.map(tc => tc.tc_id)).toEqual(['TC-01', 'TC-02', 'TC-03']);
  });

  it('partial failure: returns successful TCs + warning for failed feature', async () => {
    const tcsOK = [{ tc_id: 'TC-01', area: 'OK', description: 'd', steps: [], expected_result: 'R', status: 'Pendiente de validar', observations: '—' }];

    const generateFn = vi.fn()
      .mockResolvedValueOnce(tcsOK)
      .mockRejectedValueOnce(new Error('LLM failed'));
    const chunkFn = vi.fn().mockReturnValue('chunk');

    const result = await orchestrateGeneration({
      extractedText: 'doc',
      features: ['Works', 'Breaks'],
      minTCs: 5,
      generateFn,
      chunkFn,
    });

    expect(result.testCases).toHaveLength(1);
    expect(result.testCases[0].tc_id).toBe('TC-01');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Breaks');
  });

  it('total failure: throws when all features fail', async () => {
    const generateFn = vi.fn().mockRejectedValue(new Error('fail'));
    const chunkFn = vi.fn().mockReturnValue('chunk');

    await expect(orchestrateGeneration({
      extractedText: 'doc',
      features: ['A', 'B'],
      minTCs: 5,
      generateFn,
      chunkFn,
    })).rejects.toThrow('No se pudieron generar test cases para ninguna feature');
  });

});
