import { GITHUB_API_BASE, GITHUB_USER_AGENT } from '../../constants.ts';
import type {
  CreateIssueResponse,
  CreatedGithubIssue,
  GithubIssueState,
  GithubIssueSummary,
  SearchIssuesResponse,
} from './types.ts';

const SEARCH_ISSUES_LIMIT = 10;

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
    const qParts = [`repo:${slug}`, 'type:issue', `state:${state}`];
    if (query) {
      qParts.push(query);
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
    return data.items.slice(0, SEARCH_ISSUES_LIMIT).map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      url: item.html_url,
      updated_at: item.updated_at,
    }));
  }
}

export default GithubService;
