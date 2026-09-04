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

## Common Tasks

| Task                   | File(s)                         | Notes                              |
| ---------------------- | ------------------------------- | ---------------------------------- |
| Adjust returned fields | `index.ts` mappers + `types.ts` | Keep payloads lean                 |
| Change track-list cap  | `TRACK_LIST_MAX` in `index.ts`  | Keep Discord/model comfort in mind |
| Extend URL parsing     | `parseSpotifyRef`               | Cover intl paths + URI form        |
