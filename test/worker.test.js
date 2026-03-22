/**
 * Worker tests — verify behavior through public interface (fetch handler)
 */

import { describe, it, expect } from 'vitest';
import worker from '../worker/index.js';

const ENV = {
  TEAM_TOKEN: 'test-token',
  ALLOWED_ORIGIN: '*',
  AI: {
    run: async () => new ReadableStream(), // mock AI binding
  },
};

function makeRequest(body, token = 'test-token', method = 'POST') {
  return new Request('https://worker.test/', {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: method !== 'GET' ? JSON.stringify(body) : undefined,
  });
}

describe('Worker', () => {

  it('handles CORS preflight', async () => {
    const req = new Request('https://worker.test/', { method: 'OPTIONS' });
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('returns health check on GET', async () => {
    const req = new Request('https://worker.test/', { method: 'GET' });
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.model).toContain('llama');
  });

  it('rejects non-POST/GET/OPTIONS with 405', async () => {
    const req = new Request('https://worker.test/', { method: 'DELETE' });
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(405);
  });

  it('rejects wrong token with 401', async () => {
    const req = makeRequest({ messages: [{ role: 'user', content: 'x' }] }, 'wrong-token');
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('incorrecta');
  });

  it('rejects empty messages array', async () => {
    const req = makeRequest({ messages: [] });
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('messages');
  });

  it('rejects max_tokens above ceiling', async () => {
    const req = makeRequest({
      max_tokens: 100000,
      messages: [{ role: 'user', content: 'test' }],
    });
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('exceder');
  });

  it('rejects message with non-string content', async () => {
    const req = makeRequest({
      messages: [{ role: 'user', content: 12345 }],
    });
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(400);
  });

  it('accepts valid request and returns stream', async () => {
    const req = makeRequest({
      messages: [{ role: 'user', content: 'test' }],
      system: 'You are helpful',
    });
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
  });

});
