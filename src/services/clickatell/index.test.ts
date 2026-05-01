import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import ClickatellService from './index.ts';

describe('ClickatellService', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global as any, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an SMS via the Clickatell HTTP endpoint', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'accepted',
    } as Response);

    const service = new ClickatellService('test-key');
    const result = await service.sendSms('27821234567', 'hello world');

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toBe('accepted');

    const calledUrl = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe(
      'https://platform.clickatell.com/messages/http/send',
    );
    expect(calledUrl.searchParams.get('apiKey')).toBe('test-key');
    expect(calledUrl.searchParams.get('to')).toBe('27821234567');
    expect(calledUrl.searchParams.get('content')).toBe('hello world');
  });

  it('strips a leading + and whitespace from the recipient', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'accepted',
    } as Response);

    const service = new ClickatellService('test-key');
    await service.sendSms(' +27 82 123 4567 ', 'hi');

    const calledUrl = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(calledUrl.searchParams.get('to')).toBe('27821234567');
  });

  it('throws when API key is missing', async () => {
    const service = new ClickatellService(undefined);
    await expect(service.sendSms('27821234567', 'hi')).rejects.toThrow(
      /CLICKATELL_API_KEY/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws on invalid recipient', async () => {
    const service = new ClickatellService('test-key');
    await expect(service.sendSms('not-a-number', 'hi')).rejects.toThrow(
      /Invalid recipient/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws on empty content', async () => {
    const service = new ClickatellService('test-key');
    await expect(service.sendSms('27821234567', '   ')).rejects.toThrow(
      /content cannot be empty/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws when Clickatell returns a non-OK response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'bad key',
    } as Response);

    const service = new ClickatellService('test-key');
    await expect(service.sendSms('27821234567', 'hi')).rejects.toThrow(
      /Clickatell send failed: 401/,
    );
  });

  it('isConfigured reflects whether an API key is set', () => {
    expect(new ClickatellService('test-key').isConfigured).toBe(true);
    expect(new ClickatellService(undefined).isConfigured).toBe(false);
    expect(new ClickatellService('').isConfigured).toBe(false);
  });
});
