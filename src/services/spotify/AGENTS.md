# SpotifyService Agent Guidelines

## Overview

SpotifyService looks up public catalogue metadata (tracks, albums, playlists) via the Spotify Web API using **Client Credentials**. It backs the `lookup_spotify` chat tool. There is no user OAuth, no playback control, no audio-features, and no local catalogue sync.

## Key Responsibilities

- Obtain and cache an app access token (`SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET`)
- Parse `open.spotify.com` URLs (including `/intl-xx/` paths) and `spotify:{type}:{id}` URIs
- Fetch lean track / album / playlist payloads for the chat tool
- Refresh the token once on HTTP 401

## Architecture Notes

- Plain `fetch` — same pattern as `GithubService` / `YrService`
- In-memory token cache with a short expiry skew; no SQLite
- Types live in `src/services/spotify/types.ts`
- Missing credentials throw a clear error; the tool executor surfaces it as JSON `{ error }` and the bot still boots
- Album/playlist track lists are capped at 20 items (`tracks_truncated` when longer); null playlist items are skipped
- Auth stays **Client Credentials** — the Feb 2026 Dev Mode guide does not remove catalogue track/album/playlist GET access for app tokens; do not switch to user OAuth for this tool
- **Extended Quota Mode** keeps pre-migration response shapes (`tracks`/`track`, `popularity` still present). Mappers prefer Dev Mode fields and fall back to legacy ones

## February 2026 Dev Mode field / playlist notes

- Track `popularity` was removed in Dev Mode; `preview_url` is often absent. Both are optional on result/API types and only set in `mapTrack` when present (`popularity != null`; `preview_url` when `!== undefined`)
- Playlist paging field renamed: response `tracks` → `items`, nested media `track` → `item`. `mapPlaylist` reads `playlist.items ?? playlist.tracks` and `entry.item ?? entry.track`
- Playlist **contents** (`items`) are only returned for playlists the authenticated user owns or collaborates on. With Client Credentials there is no user, so shared Discord playlists often return **metadata only** (no track list). Handle gracefully: empty `tracks`, `total` from `page.total` if present else `0` — do not throw

## Common Tasks

| Task                   | File(s)                         | Notes                              |
| ---------------------- | ------------------------------- | ---------------------------------- |
| Adjust returned fields | `index.ts` mappers + `types.ts` | Keep payloads lean                 |
| Change track-list cap  | `TRACK_LIST_MAX` in `index.ts`  | Keep Discord/model comfort in mind |
| Extend URL parsing     | `parseSpotifyRef`               | Cover intl paths + URI form        |
