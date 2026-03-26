export type * from "@autoclawdev/types";

export interface GithubData {
  issues: GithubIssue[];
  prs: GithubPR[];
  upstreamIssues: GithubIssue[];
}

export interface GithubIssue {
  number: number;
  title: string;
  labels: Array<{ name: string }>;
  createdAt: string;
}

export interface GithubPR {
  number: number;
  title: string;
  state: string;
  createdAt: string;
}
