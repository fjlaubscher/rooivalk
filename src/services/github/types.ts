export type CreateIssueResponse = {
  number: number;
  html_url: string;
};

export type SearchIssuesItem = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  updated_at: string;
};

export type SearchIssuesResponse = {
  items: SearchIssuesItem[];
};

export type GithubIssueSummary = {
  number: number;
  title: string;
  state: string;
  url: string;
  updated_at: string;
};

export type CreatedGithubIssue = {
  number: number;
  url: string;
};

export type GithubIssueState = 'open' | 'closed' | 'all';
