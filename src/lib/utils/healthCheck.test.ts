import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkEndpointHealth } from './healthCheck';

describe('checkEndpointHealth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return status available when response is ok with title or status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok', version: '1.2.3', model: 'bge-m3' }),
    } as Response);

    const result = await checkEndpointHealth('http://localhost:8081', '/health');
    expect(result.status).toBe('ok');
    expect(result.version).toBe('1.2.3');
    expect(result.model).toBe('bge-m3');
  });

  it('should extract model from data array when models endpoint returns list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'gpt-4o' }] }),
    } as Response);

    const result = await checkEndpointHealth('http://localhost:4096', '/v1/models');
    expect(result.status).toBe('ok');
    expect(result.model).toBe('gpt-4o');
  });

  it('should fall back to text response if json is unavailable or invalid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error('Not JSON'); },
      text: async () => 'OK Healthy',
    } as unknown as Response);

    const result = await checkEndpointHealth('http://localhost:8080', '/healthz');
    expect(result.status).toBe('OK Healthy');
  });

  it('should return unavailable status when HTTP status is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as Response);

    const result = await checkEndpointHealth('http://localhost:8080', '/health');
    expect(result.status).toBe('unavailable');
    expect(result.error).toContain('HTTP 503');
  });

  it('should return unavailable status when fetch rejects or times out', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));

    const result = await checkEndpointHealth('http://localhost:9999', '/health');
    expect(result.status).toBe('unavailable');
    expect(result.error).toBe('Connection refused');
  });

  it('should return unavailable status if base URL is blocked by SSRF validator', async () => {
    const result = await checkEndpointHealth('http://169.254.169.254', '/health');
    expect(result.status).toBe('unavailable');
    expect(result.error).toMatch(/metadata/i);
  });
});
