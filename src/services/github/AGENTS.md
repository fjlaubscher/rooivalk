# GithubService Agent Guidelines

## Overview

GithubService creates and searches issues on an allowlisted set of Francois's own GitHub repos, backing the `create_github_issue` and `search_github_issues` chat tools. Plain `fetch` against the GitHub REST API — no SDK, same pattern as `SteamService`/`YrService`.

## Key Responsibilities

- Creating issues via `POST /repos/{owner}/{repo}/issues`
- Searching issues via `GET /search/issues`
- Repo allowlist (short slug → `owner/repo`) lives in `GITHUB_REPOS` (`src/constants.ts`) — the executor resolves the enum key to a slug before calling this service

## Architecture Notes

- `GITHUB_TOKEN` is optional; if unset, both methods throw `GITHUB_TOKEN not configured` so the executor can surface a graceful error instead of crashing
- Results are capped to 10 items in `searchIssues`
- All types live in `src/services/github/types.ts`

## Common Tasks

| Task                        | File(s)                                     | Notes                                                  |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Add a repo to the allowlist | `src/constants.ts` (`GITHUB_REPOS`)         | No code change beyond the map entry                    |
| Adjust returned fields      | `src/services/github/index.ts` + `types.ts` | Keep `GithubIssueSummary`/`CreatedGithubIssue` minimal |
| Gate a tool by role         | `config/tool-roles.json`                    | No code change — add the tool name under a role id     |
