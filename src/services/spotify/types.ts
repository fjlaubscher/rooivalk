export type SpotifyKind = 'track' | 'album' | 'playlist';

export type SpotifyParsedRef = {
  kind: SpotifyKind;
  id: string;
};

export type SpotifyImage = {
  url: string;
  height: number | null;
  width: number | null;
};

export type SpotifyArtistRef = {
  id: string;
  name: string;
};

export type SpotifyTrackResult = {
  id: string;
  name: string;
  artists: string[];
  album: {
    name: string;
    release_date: string;
  };
  duration_ms: number;
  explicit: boolean;
  /** Removed in Dev Mode (Feb 2026); present under Extended Quota. */
  popularity?: number;
  external_url: string;
  /** Often absent in Dev Mode; may be null when present. */
  preview_url?: string | null;
};

export type SpotifyAlbumTrack = {
  track_number: number;
  name: string;
  artists: string[];
  duration_ms: number;
};

export type SpotifyAlbumResult = {
  id: string;
  name: string;
  artists: string[];
  release_date: string;
  total_tracks: number;
  label?: string;
  images?: SpotifyImage;
  external_url: string;
  tracks: SpotifyAlbumTrack[];
  total: number;
  tracks_truncated?: boolean;
};

export type SpotifyPlaylistTrack = {
  track_number: number;
  name: string;
  artists: string[];
  duration_ms: number;
};

export type SpotifyPlaylistResult = {
  id: string;
  name: string;
  owner: {
    display_name: string | null;
  };
  description: string | null;
  public: boolean | null;
  collaborative: boolean;
  followers?: number;
  images?: SpotifyImage;
  external_url: string;
  tracks: SpotifyPlaylistTrack[];
  total: number;
  tracks_truncated?: boolean;
};

export type SpotifyLookupResult =
  SpotifyTrackResult | SpotifyAlbumResult | SpotifyPlaylistResult;

export type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export type SpotifyApiArtist = {
  id: string;
  name: string;
};

export type SpotifyApiImage = {
  url: string;
  height: number | null;
  width: number | null;
};

export type SpotifyApiTrack = {
  id: string;
  name: string;
  artists: SpotifyApiArtist[];
  album: {
    name: string;
    release_date: string;
  };
  duration_ms: number;
  explicit: boolean;
  popularity?: number;
  external_urls: { spotify: string };
  preview_url?: string | null;
};

export type SpotifyApiSimplifiedTrack = {
  track_number: number;
  name: string;
  artists: SpotifyApiArtist[];
  duration_ms: number;
};

export type SpotifyApiAlbum = {
  id: string;
  name: string;
  artists: SpotifyApiArtist[];
  release_date: string;
  total_tracks: number;
  label?: string;
  images: SpotifyApiImage[];
  external_urls: { spotify: string };
  tracks: {
    items: SpotifyApiSimplifiedTrack[];
    total: number;
  };
};

export type SpotifyApiPlaylistMedia = {
  name: string;
  artists: SpotifyApiArtist[];
  duration_ms: number;
};

/** Dev Mode: `item`; legacy / Extended Quota: `track`. */
export type SpotifyApiPlaylistTrackItem = {
  item?: SpotifyApiPlaylistMedia | null;
  track?: SpotifyApiPlaylistMedia | null;
};

export type SpotifyApiPlaylistPage = {
  items: SpotifyApiPlaylistTrackItem[];
  total: number;
};

export type SpotifyApiPlaylist = {
  id: string;
  name: string;
  owner: { display_name: string | null };
  description: string | null;
  public: boolean | null;
  collaborative: boolean;
  followers?: { total: number };
  images: SpotifyApiImage[];
  external_urls: { spotify: string };
  /** Dev Mode (Feb 2026): renamed from `tracks`. Absent for playlists the user does not own/collaborate on. */
  items?: SpotifyApiPlaylistPage;
  /** Legacy / Extended Quota Mode shape. */
  tracks?: SpotifyApiPlaylistPage;
};

export type SpotifySearchResponse = {
  tracks?: { items: SpotifyApiTrack[] };
  albums?: { items: SpotifyApiAlbum[] };
  playlists?: { items: SpotifyApiPlaylist[] };
};
