export const EVAL_DIMENSIONS = [
  'correctness',
  'tool_choice',
  'language_match',
  'tone_humor',
  'length',
] as const;

export type EvalDimension = (typeof EVAL_DIMENSIONS)[number];

export const EVAL_CASE_SPLITS = ['heldout', 'prompt_example'] as const;

export type EvalCaseSplit = (typeof EVAL_CASE_SPLITS)[number];

export const EVAL_NOMINATION_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const;

export type EvalNominationStatus = (typeof EVAL_NOMINATION_STATUSES)[number];

export type PromptVersionRow = {
  id: number;
  name: string;
  component: string;
  instructions: string;
  model: string | null;
  parent_id: number | null;
  created_at: number;
  is_baseline: number;
};

export type EvalCaseRow = {
  id: number;
  slug: string;
  input: string;
  context: string | null;
  expected_tools: string;
  expected_language: string | null;
  expected_notes: string | null;
  split: EvalCaseSplit;
  nominated_by_reaction: number;
  source: string | null;
  created_at: number;
};

export type EvalNominationRow = {
  id: number;
  message_id: string;
  channel_id: string;
  emoji_name: string;
  message_snapshot: string | null;
  status: EvalNominationStatus;
  created_at: number;
};

export type EvalResultRow = {
  id: number;
  case_id: number;
  prompt_version_id: number;
  model: string;
  output: string;
  tools_used: string;
  latency_ms: number | null;
  context_lost: number;
  created_at: number;
};

export type EvalScoreRow = {
  id: number;
  result_id: number;
  dimension: EvalDimension;
  score: number;
  notes: string | null;
  created_at: number;
};

export type CreatePromptVersionParams = {
  name: string;
  /** The single prompt component this version changes (one at a time). */
  component: string;
  instructions: string;
  model?: string | null;
  parentId?: number | null;
  isBaseline?: boolean;
};

export type CreateEvalCaseParams = {
  slug: string;
  input: string;
  context?: string | null;
  expectedTools?: string[];
  expectedLanguage?: string | null;
  expectedNotes?: string | null;
  split?: EvalCaseSplit;
  nominatedByReaction?: boolean;
  source?: string | null;
};

export type NominateCaseParams = {
  messageId: string;
  channelId: string;
  emojiName: string;
  /** Recovered message content/context. Required to build a case later. */
  messageSnapshot?: string | null;
};

export type RecordResultParams = {
  caseId: number;
  promptVersionId: number;
  model: string;
  output: string;
  toolsUsed?: string[];
  latencyMs?: number | null;
  contextLost?: boolean;
};

export type ScoreResultParams = {
  resultId: number;
  dimension: EvalDimension;
  /** 0 = miss, 1 = partial, 2 = good. Kept coarse on purpose. */
  score: number;
  notes?: string | null;
};

export type SeedEvalCase = {
  slug: string;
  input: string;
  context?: string | null;
  expectedTools?: string[];
  expectedLanguage?: string | null;
  expectedNotes?: string | null;
  split?: EvalCaseSplit;
  source?: string | null;
};

export type DimensionSummary = {
  dimension: EvalDimension;
  baselineAvg: number | null;
  candidateAvg: number | null;
  delta: number | null;
  baselineCount: number;
  candidateCount: number;
};

export type LengthSummary = {
  count: number;
  avgChars: number | null;
  maxChars: number | null;
  overTarget: number;
  overLimit: number;
};

export type VersionComparison = {
  baselineId: number;
  candidateId: number;
  dimensions: DimensionSummary[];
  baselineLength: LengthSummary;
  candidateLength: LengthSummary;
};

export type EvalExport = {
  exportedAt: number;
  promptVersions: PromptVersionRow[];
  cases: EvalCaseRow[];
  results: EvalResultRow[];
  scores: EvalScoreRow[];
  nominations: EvalNominationRow[];
};
