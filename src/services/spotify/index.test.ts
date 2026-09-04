import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import SpotifyService, { parseSpotifyRef } from './index.ts';

const mockFetch = vi.fn();

function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {},
) {
  const status = init.status ?? (init.ok === false ? 500 : 200);
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    statusText: init.statusText ?? (status === 200 ? 'OK' : 'Error'),
    json: async () => body,
  };
}

describe('parseSpotifyRef', () => {
  it('parses open.spotify.com track/album/playlist URLs', () => {
    expect(
      parseSpotifyRef('https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl'),
    ).toEqual({ kind: 'track', id: '11dFghVXANMlKmJXsNCbNl' });
    expect(
      parseSpotifyRef('https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy'),
    ).toEqual({ kind: 'album', id: '4aawyAB9vmqN3uQ7FjRGTy' });
    expect(
      parseSpotifyRef(
        'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
      ),
    ).toEqual({ kind: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' });
  });

  it('parses intl paths and ignores query/hash suffixes', () => {
    expect(
      parseSpotifyRef(
        'https://open.spotify.com/intl-za/track/11dFghVXANMlKmJXsNCbNl?si=abc',
      ),
    ).toEqual({ kind: 'track', id: '11dFghVXANMlKmJXsNCbNl' });
    expect(
      parseSpotifyRef(
        'https://open.spotify.com/intl-en/album/4aawyAB9vmqN3uQ7FjRGTy#top',
      ),
    ).toEqual({ kind: 'album', id: '4aawyAB9vmqN3uQ7FjRGTy' });
  });

  it('parses spotify: URIs', () => {
    expect(parseSpotifyRef('spotify:track:11dFghVXANMlKmJXsNCbNl')).toEqual({
      kind: 'track',
      id: '11dFghVXANMlKmJXsNCbNl',
    });
    expect(parseSpotifyRef('spotify:album:4aawyAB9vmqN3uQ7FjRGTy')).toEqual({
      kind: 'album',
      id: '4aawyAB9vmqN3uQ7FjRGTy',
    });
    expect(parseSpotifyRef('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toEqual({
      kind: 'playlist',
      id: '37i9dQZF1DXcBWIGoYBM5M',
    });
  });

  it('returns null for garbage input', () => {
    expect(parseSpotifyRef('')).toBeNull();
    expect(parseSpotifyRef('not a spotify link')).toBeNull();
    expect(parseSpotifyRef('https://example.com/track/abc')).toBeNull();
    expect(parseSpotifyRef('spotify:artist:abc')).toBeNull();
  });
});

describe('SpotifyService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('without credentials', () => {
    it('reports not configured and throws on lookup', async () => {
      const service = new SpotifyService();
      expect(service.isConfigured()).toBe(false);
      await expect(
        service.lookup({ kind: 'track', query: 'hello' }),
      ).rejects.toThrow(
        'SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET not configured',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('token cache', () => {
    it('reuses a cached token until near expiry', async () => {
      const service = new SpotifyService('id', 'secret');
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            access_token: 'tok-1',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            id: 't1',
            name: 'Song',
            artists: [{ id: 'a1', name: 'Artist' }],
            album: { name: 'Album', release_date: '2020-01-01' },
            duration_ms: 1000,
            explicit: false,
            popularity: 10,
            external_urls: { spotify: 'https://open.spotify.com/track/t1' },
            preview_url: null,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            id: 't2',
            name: 'Song 2',
            artists: [{ id: 'a1', name: 'Artist' }],
            album: { name: 'Album', release_date: '2020-01-01' },
            duration_ms: 1000,
            explicit: false,
            popularity: 10,
            external_urls: { spotify: 'https://open.spotify.com/track/t2' },
            preview_url: null,
          }),
        );

      await service.getTrack('t1');
      await service.getTrack('t2');

      const tokenCalls = mockFetch.mock.calls.filter((c) =>
        String(c[0]).includes('/api/token'),
      );
      expect(tokenCalls).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('refreshes the token once on 401', async () => {
      const service = new SpotifyService('id', 'secret');
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            access_token: 'tok-1',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({}),
        })
        .mockResolvedValueOnce(
          jsonResponse({
            access_token: 'tok-2',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            id: 't1',
            name: 'Song',
            artists: [{ id: 'a1', name: 'Artist' }],
            album: { name: 'Album', release_date: '2020-01-01' },
            duration_ms: 1000,
            explicit: false,
            popularity: 10,
            external_urls: { spotify: 'https://open.spotify.com/track/t1' },
            preview_url: null,
          }),
        );

      const result = await service.getTrack('t1');
      expect(result?.id).toBe('t1');

      const tokenCalls = mockFetch.mock.calls.filter((c) =>
        String(c[0]).includes('/api/token'),
      );
      expect(tokenCalls).toHaveLength(2);
      const trackAuthHeaders = mockFetch.mock.calls
        .filter((c) => String(c[0]).includes('/tracks/'))
        .map((c) => c[1]?.headers?.Authorization);
      expect(trackAuthHeaders).toEqual(['Bearer tok-1', 'Bearer tok-2']);
    });
  });

  describe('lookup', () => {
    it('prefers url over query and returns a lean track payload', async () => {
      const service = new SpotifyService('id', 'secret');
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            access_token: 'tok',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            id: '11dFghVXANMlKmJXsNCbNl',
            name: 'Cut To The Feeling',
            artists: [{ id: 'a', name: 'Carly Rae Jepsen' }],
            album: { name: 'Cut To The Feeling', release_date: '2017-05-26' },
            duration_ms: 207959,
            explicit: false,
            popularity: 0,
            external_urls: {
              spotify: 'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl',
            },
            preview_url: 'https://p.scdn.co/mp3-preview/x',
          }),
        );

      const result = await service.lookup({
        kind: 'track',
        url: 'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl',
        query: 'should be ignored',
      });

      expect(result).toEqual({
        id: '11dFghVXANMlKmJXsNCbNl',
        name: 'Cut To The Feeling',
        artists: ['Carly Rae Jepsen'],
        album: { name: 'Cut To The Feeling', release_date: '2017-05-26' },
        duration_ms: 207959,
        explicit: false,
        popularity: 0,
        external_url: 'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl',
        preview_url: 'https://p.scdn.co/mp3-preview/x',
      });
      expect(
        mockFetch.mock.calls.some((c) => String(c[0]).includes('/search')),
      ).toBe(false);
    });

    it('returns null when the track is not found', async () => {
      const service = new SpotifyService('id', 'secret');
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            access_token: 'tok',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({}),
        });

      await expect(
        service.lookup({
          kind: 'track',
          url: 'spotify:track:missingid0000000000000',
        }),
      ).resolves.toBeNull();
    });

    it('truncates album tracks at 20 and sets tracks_truncated', async () => {
      const service = new SpotifyService('id', 'secret');
      const items = Array.from({ length: 25 }, (_, i) => ({
        track_number: i + 1,
        name: `Track ${i + 1}`,
        artists: [{ id: 'a', name: 'Band' }],
        duration_ms: 1000 + i,
      }));
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            access_token: 'tok',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            id: 'alb1',
            name: 'Long Album',
            artists: [{ id: 'a', name: 'Band' }],
            release_date: '2021-01-01',
            total_tracks: 25,
            label: 'Label Co',
            images: [{ url: 'https://img/1', height: 640, width: 640 }],
            external_urls: { spotify: 'https://open.spotify.com/album/alb1' },
            tracks: { items, total: 25 },
          }),
        );

      const result = await service.lookup({
        kind: 'album',
        url: 'https://open.spotify.com/album/alb1',
      });

      expect(result).toMatchObject({
        id: 'alb1',
        name: 'Long Album',
        artists: ['Band'],
        total_tracks: 25,
        label: 'Label Co',
        total: 25,
        tracks_truncated: true,
        images: { url: 'https://img/1', height: 640, width: 640 },
      });
      expect((result as any).tracks).toHaveLength(20);
      expect((result as any).tracks[0].track_number).toBe(1);
      expect((result as any).tracks[19].name).toBe('Track 20');
    });

    it('skips null playlist items and truncates at 20', async () => {
      const service = new SpotifyService('id', 'secret');
      const items = [
        { track: null },
        ...Array.from({ length: 22 }, (_, i) => ({
          track: {
            name: `P${i + 1}`,
            artists: [{ id: 'a', name: 'DJ' }],
            duration_ms: 2000,
          },
        })),
      ];
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            access_token: 'tok',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            id: 'pl1',
            name: 'Party',
            owner: { display_name: 'Host' },
            description: 'Bangers',
            public: true,
            collaborative: false,
            followers: { total: 9 },
            images: [{ url: 'https://img/p', height: null, width: null }],
            external_urls: { spotify: 'https://open.spotify.com/playlist/pl1' },
            tracks: { items, total: 30 },
          }),
        );

      const result = await service.lookup({
        kind: 'playlist',
        url: 'spotify:playlist:pl1',
      });

      expect(result).toMatchObject({
        id: 'pl1',
        name: 'Party',
        owner: { display_name: 'Host' },
        description: 'Bangers',
        public: true,
        collaborative: false,
        followers: 9,
        total: 30,
        tracks_truncated: true,
      });
      expect((result as any).tracks).toHaveLength(20);
      expect((result as any).tracks[0].name).toBe('P1');
      expect((result as any).tracks[0].track_number).toBe(1);
    });

    it('searches by query when no url is given', async () => {
      const service = new SpotifyService('id', 'secret');
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            access_token: 'tok',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            tracks: {
              items: [
                {
                  id: 'hit',
                  name: 'Hit',
                  artists: [{ id: 'a', name: 'Star' }],
                  album: { name: 'Hits', release_date: '2019' },
                  duration_ms: 111,
                  explicit: true,
                  popularity: 99,
                  external_urls: {
                    spotify: 'https://open.spotify.com/track/hit',
                  },
                  preview_url: null,
                },
              ],
            },
          }),
        );

      const result = await service.lookup({ kind: 'track', query: 'Hit Star' });
      expect(result).toMatchObject({
        id: 'hit',
        name: 'Hit',
        artists: ['Star'],
      });
      expect(String(mockFetch.mock.calls[1]![0])).toContain('type=track');
    });
  });
});
