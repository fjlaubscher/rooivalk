import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import GithubService from './index.ts';

const mockFetch = vi.fn();

describe('GithubService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('without a token', () => {
    it('throws on createIssue', async () => {
      const service = new GithubService();
      await expect(
        service.createIssue('fjlaubscher/warren', 'title'),
      ).rejects.toThrow('GITHUB_TOKEN not configured');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws on searchIssues', async () => {
      const service = new GithubService();
      await expect(
        service.searchIssues('fjlaubscher/warren', null),
      ).rejects.toThrow('GITHUB_TOKEN not configured');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('createIssue', () => {
    it('posts to the right URL with title/body and parses number/url', async () => {
      const service = new GithubService('test-token');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ number: 42, html_url: 'https://example.com/42' }),
      });

      const result = await service.createIssue(
        'fjlaubscher/warren',
        'Bug title',
        'Bug body',
      );

      expect(result).toEqual({ number: 42, url: 'https://example.com/42' });
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(
        'https://api.github.com/repos/fjlaubscher/warren/issues',
      );
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        title: 'Bug title',
        body: 'Bug body',
      });
      expect(options.headers.Authorization).toBe('Bearer test-token');
    });

    it('throws when the API returns a non-ok HTTP status', async () => {
      const service = new GithubService('test-token');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(
        service.createIssue('fjlaubscher/warren', 'title'),
      ).rejects.toThrow('createIssue failed: 403');
    });
  });

  describe('searchIssues', () => {
    it('builds the correct q= and maps items', async () => {
      const service = new GithubService('test-token');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              number: 1,
              title: 'Login bug',
              state: 'open',
              html_url: 'https://example.com/1',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
        }),
      });

      const result = await service.searchIssues(
        'fjlaubscher/warren',
        'login',
        'open',
      );

      expect(result).toEqual([
        {
          number: 1,
          title: 'Login bug',
          state: 'open',
          url: 'https://example.com/1',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]);

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain(
        'q=repo%3Afjlaubscher%2Fwarren+type%3Aissue+state%3Aopen+login',
      );
    });

    it('defaults state to open and omits query when not provided', async () => {
      const service = new GithubService('test-token');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      });

      await service.searchIssues('fjlaubscher/warren', null);

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain(
        'q=repo%3Afjlaubscher%2Fwarren+type%3Aissue+state%3Aopen',
      );
    });

    it('throws when the API returns a non-ok HTTP status', async () => {
      const service = new GithubService('test-token');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
      });

      await expect(
        service.searchIssues('fjlaubscher/warren', null),
      ).rejects.toThrow('searchIssues failed: 422');
    });
  });
});
