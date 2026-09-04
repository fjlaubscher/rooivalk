import {
  SPOTIFY_ACCOUNTS_BASE,
  SPOTIFY_API_BASE,
  SPOTIFY_USER_AGENT,
} from '../../constants.ts';
import type {
  SpotifyAlbumResult,
  SpotifyAlbumTrack,
  SpotifyApiAlbum,
  SpotifyApiPlaylist,
  SpotifyApiTrack,
  SpotifyKind,
  SpotifyLookupResult,
  SpotifyParsedRef,
  SpotifyPlaylistResult,
  SpotifyPlaylistTrack,
  SpotifySearchResponse,
  SpotifyTokenResponse,
  SpotifyTrackResult,
} from './types.ts';

const TRACK_LIST_MAX = 20;
/** Refresh a little early so borderline tokens don't race the request. */
const TOKEN_EXPIRY_SKEW_MS = 60_000;

const SPOTIFY_URL_RE =
  /^https?:\/\/open\.spotify\.com(?:\/intl-[a-z]{2})?\/(track|album|playlist)\/([A-Za-z0-9]+)(?:[/?#]|$)/i;
const SPOTIFY_URI_RE = /^spotify:(track|album|playlist):([A-Za-z0-9]+)$/i;

export function parseSpotifyRef(input: string): SpotifyParsedRef | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const urlMatch = trimmed.match(SPOTIFY_URL_RE);
  if (urlMatch?.[1] && urlMatch[2]) {
    return {
      kind: urlMatch[1].toLowerCase() as SpotifyKind,
      id: urlMatch[2],
    };
  }

  const uriMatch = trimmed.match(SPOTIFY_URI_RE);
  if (uriMatch?.[1] && uriMatch[2]) {
    return {
      kind: uriMatch[1].toLowerCase() as SpotifyKind,
      id: uriMatch[2],
    };
  }

  return null;
}

function artistNames(artists: { name: string }[] | undefined): string[] {
  return (artists ?? []).map((a) => a.name);
}

function firstImage(
  images:
    { url: string; height: number | null; width: number | null }[] | undefined,
): { url: string; height: number | null; width: number | null } | undefined {
  const image = images?.[0];
  return image
    ? { url: image.url, height: image.height, width: image.width }
    : undefined;
}

function mapTrack(track: SpotifyApiTrack): SpotifyTrackResult {
  return {
    id: track.id,
    name: track.name,
    artists: artistNames(track.artists),
    album: {
      name: track.album.name,
      release_date: track.album.release_date,
    },
    duration_ms: track.duration_ms,
    explicit: track.explicit,
    popularity: track.popularity,
    external_url: track.external_urls.spotify,
    preview_url: track.preview_url,
  };
}

function mapAlbum(album: SpotifyApiAlbum): SpotifyAlbumResult {
  const items = album.tracks?.items ?? [];
  const total = album.tracks?.total ?? album.total_tracks ?? items.length;
  const truncated = items.slice(0, TRACK_LIST_MAX);
  const tracks: SpotifyAlbumTrack[] = truncated.map((t) => ({
    track_number: t.track_number,
    name: t.name,
    artists: artistNames(t.artists),
    duration_ms: t.duration_ms,
  }));

  const result: SpotifyAlbumResult = {
    id: album.id,
    name: album.name,
    artists: artistNames(album.artists),
    release_date: album.release_date,
    total_tracks: album.total_tracks,
    external_url: album.external_urls.spotify,
    tracks,
    total,
  };

  if (album.label) {
    result.label = album.label;
  }
  const image = firstImage(album.images);
  if (image) {
    result.images = image;
  }
  if (total > TRACK_LIST_MAX) {
    result.tracks_truncated = true;
  }

  return result;
}

function mapPlaylist(playlist: SpotifyApiPlaylist): SpotifyPlaylistResult {
  const items = playlist.tracks?.items ?? [];
  const total = playlist.tracks?.total ?? items.length;
  const tracks: SpotifyPlaylistTrack[] = [];

  for (const item of items) {
    if (tracks.length >= TRACK_LIST_MAX) {
      break;
    }
    const track = item.track;
    if (!track) {
      continue;
    }
    tracks.push({
      track_number: tracks.length + 1,
      name: track.name,
      artists: artistNames(track.artists),
      duration_ms: track.duration_ms,
    });
  }

  const result: SpotifyPlaylistResult = {
    id: playlist.id,
    name: playlist.name,
    owner: { display_name: playlist.owner?.display_name ?? null },
    description: playlist.description,
    public: playlist.public,
    collaborative: playlist.collaborative,
    external_url: playlist.external_urls.spotify,
    tracks,
    total,
  };

  if (playlist.followers?.total != null) {
    result.followers = playlist.followers.total;
  }
  const image = firstImage(playlist.images);
  if (image) {
    result.images = image;
  }
  if (total > TRACK_LIST_MAX) {
    result.tracks_truncated = true;
  }

  return result;
}

class SpotifyService {
  private _clientId?: string;
  private _clientSecret?: string;
  private _accessToken?: string;
  private _tokenExpiresAt = 0;

  constructor(clientId?: string, clientSecret?: string) {
    this._clientId = clientId;
    this._clientSecret = clientSecret;
  }

  public isConfigured(): boolean {
    return Boolean(this._clientId && this._clientSecret);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET not configured');
    }
  }

  private async fetchToken(): Promise<string> {
    this.assertConfigured();

    const credentials = Buffer.from(
      `${this._clientId}:${this._clientSecret}`,
    ).toString('base64');

    const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': SPOTIFY_USER_AGENT,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new Error(
        `Spotify token request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as SpotifyTokenResponse;
    this._accessToken = data.access_token;
    this._tokenExpiresAt =
      Date.now() + data.expires_in * 1000 - TOKEN_EXPIRY_SKEW_MS;
    return this._accessToken;
  }

  private async getAccessToken(): Promise<string> {
    if (this._accessToken && Date.now() < this._tokenExpiresAt) {
      return this._accessToken;
    }
    return this.fetchToken();
  }

  /** Exposed for tests — clears the in-memory token cache. */
  public clearTokenCache(): void {
    this._accessToken = undefined;
    this._tokenExpiresAt = 0;
  }

  private async apiFetch(path: string, retried = false): Promise<Response> {
    const token = await this.getAccessToken();
    const response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': SPOTIFY_USER_AGENT,
      },
    });

    if (response.status === 401 && !retried) {
      this.clearTokenCache();
      return this.apiFetch(path, true);
    }

    return response;
  }

  public async getTrack(id: string): Promise<SpotifyTrackResult | null> {
    const response = await this.apiFetch(`/tracks/${encodeURIComponent(id)}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(
        `getTrack failed: ${response.status} ${response.statusText}`,
      );
    }
    return mapTrack((await response.json()) as SpotifyApiTrack);
  }

  public async getAlbum(id: string): Promise<SpotifyAlbumResult | null> {
    const response = await this.apiFetch(`/albums/${encodeURIComponent(id)}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(
        `getAlbum failed: ${response.status} ${response.statusText}`,
      );
    }
    return mapAlbum((await response.json()) as SpotifyApiAlbum);
  }

  public async getPlaylist(id: string): Promise<SpotifyPlaylistResult | null> {
    const response = await this.apiFetch(
      `/playlists/${encodeURIComponent(id)}`,
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(
        `getPlaylist failed: ${response.status} ${response.statusText}`,
      );
    }
    return mapPlaylist((await response.json()) as SpotifyApiPlaylist);
  }

  public async search(
    kind: SpotifyKind,
    query: string,
  ): Promise<SpotifyLookupResult | null> {
    const url = new URL(`${SPOTIFY_API_BASE}/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('type', kind);
    url.searchParams.set('limit', '1');

    const token = await this.getAccessToken();
    let response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': SPOTIFY_USER_AGENT,
      },
    });

    if (response.status === 401) {
      this.clearTokenCache();
      const fresh = await this.getAccessToken();
      response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${fresh}`,
          'User-Agent': SPOTIFY_USER_AGENT,
        },
      });
    }

    if (!response.ok) {
      throw new Error(
        `search failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as SpotifySearchResponse;
    if (kind === 'track') {
      const item = data.tracks?.items?.[0];
      return item ? mapTrack(item) : null;
    }
    if (kind === 'album') {
      const item = data.albums?.items?.[0];
      // Search album items are simplified — fetch full album for track list.
      return item ? this.getAlbum(item.id) : null;
    }
    const item = data.playlists?.items?.[0];
    return item ? this.getPlaylist(item.id) : null;
  }

  public async lookup(args: {
    kind: SpotifyKind;
    url?: string | null;
    query?: string | null;
  }): Promise<SpotifyLookupResult | null> {
    this.assertConfigured();

    const url = typeof args.url === 'string' ? args.url.trim() : '';
    const query = typeof args.query === 'string' ? args.query.trim() : '';

    if (url) {
      const parsed = parseSpotifyRef(url);
      if (!parsed) {
        throw new Error('Could not parse Spotify URL/URI');
      }
      if (parsed.kind !== args.kind) {
        throw new Error(`URL is a ${parsed.kind} but kind is ${args.kind}`);
      }
      if (parsed.kind === 'track') {
        return this.getTrack(parsed.id);
      }
      if (parsed.kind === 'album') {
        return this.getAlbum(parsed.id);
      }
      return this.getPlaylist(parsed.id);
    }

    if (query) {
      return this.search(args.kind, query);
    }

    throw new Error('Provide a Spotify url or query');
  }
}

export default SpotifyService;
