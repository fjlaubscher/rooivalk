import { GITHUB_API_BASE, GITHUB_USER_AGENT } from '../../constants.ts';
import type {
  CreateIssueResponse,
  CreatedGithubIssue,
  GithubIssueState,
  GithubIssueSummary,
  SearchIssuesResponse,
} from './types.ts';

const SEARCH_ISSUES_LIMIT = 10;

// Strips qualifiers/operators a caller could use to widen a search beyond the
// repo we already scoped it to via `repo:${slug}` (e.g. `repo:other/repo`,
// `org:x`, or a boolean `OR`). GitHub only treats `OR` as boolean when
// uppercase, so lowercase "or" in free text is left untouched.
const SCOPE_WIDENING_QUALIFIER = /\b(?:repo|org|user|owner):\S+/gi;
const BOOLEAN_OR = /\bOR\b/g;

function sanitizeSearchQuery(query: string): string {
  return query
    .replace(SCOPE_WIDENING_QUALIFIER, '')
    .replace(BOOLEAN_OR, '')
    .replace(/\s+/g, ' ')
    .trim();
}

class GithubService {
  private _token?: string;

  constructor(token?: string) {
    this._token = token;
  }

  private headers(): Record<string, string> {
    if (!this._token) {
      throw new Error('GITHUB_TOKEN not configured');
    }

    return {
      Authorization: `Bearer ${this._token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': GITHUB_USER_AGENT,
    };
  }

  public async createIssue(
    slug: string,
    title: string,
    body?: string,
  ): Promise<CreatedGithubIssue> {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${slug}/issues`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body }),
    });

    if (!response.ok) {
      throw new Error(
        `createIssue failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as CreateIssueResponse;
    return { number: data.number, url: data.html_url };
  }

  public async searchIssues(
    slug: string,
    query: string | null | undefined,
    state: GithubIssueState = 'open',
  ): Promise<GithubIssueSummary[]> {
    const qParts = [`repo:${slug}`, 'type:issue'];
    if (state !== 'all') {
      qParts.push(`state:${state}`);
    }
    const sanitizedQuery = query ? sanitizeSearchQuery(query) : '';
    if (sanitizedQuery) {
      qParts.push(sanitizedQuery);
    }

    const url = new URL(`${GITHUB_API_BASE}/search/issues`);
    url.searchParams.set('q', qParts.join(' '));
    url.searchParams.set('per_page', String(SEARCH_ISSUES_LIMIT));

    const response = await fetch(url.toString(), { headers: this.headers() });

    if (!response.ok) {
      throw new Error(
        `searchIssues failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as SearchIssuesResponse;
    return data.items.map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      url: item.html_url,
      updated_at: item.updated_at,
    }));
  }
}

export default GithubService;
