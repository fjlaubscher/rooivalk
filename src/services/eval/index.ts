import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { EVAL_SCHEMA_SQL } from './schema.ts';
import { SEED_EVAL_CASES } from './seed-cases.ts';
import { isEvalDimension, summarizeLengths } from './scoring.ts';
import type {
  CreateEvalCaseParams,
  CreatePromptVersionParams,
  DimensionSummary,
  EvalCaseRow,
  EvalCaseSplit,
  EvalDimension,
  EvalExport,
  EvalNominationRow,
  EvalNominationStatus,
  EvalResultRow,
  EvalScoreRow,
  NominateCaseParams,
  PromptVersionRow,
  RecordResultParams,
  ScoreResultParams,
  SeedEvalCase,
  VersionComparison,
} from './types.ts';
import { EVAL_DIMENSIONS } from './types.ts';

function parseToolList(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    return [];
  }
}

/**
 * SQLite-backed prompt versioning and local evaluation workflow.
 *
 * Holds prompt versions, curated eval cases, reaction nominations, evaluated
 * answers (with the prompt version + model that produced each), and
 * per-dimension scores. Everything stays in the shared SQLite file using the
 * same `DatabaseSync` read/write split as `MemoryService` — no hosted eval
 * platform involved.
 */
class EvalService {
  private _writeDb: DatabaseSync;
  private _readDb: DatabaseSync;
  private _closed = false;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    this._writeDb = new DatabaseSync(dbPath);
    this._writeDb.exec(EVAL_SCHEMA_SQL);
    // Keep foreign-key cascades (case/result/score removal) enforced.
    this._writeDb.exec('PRAGMA foreign_keys = ON');
    this._readDb = new DatabaseSync(dbPath, { readOnly: true });
  }

  // -- prompt versions -----------------------------------------------------

  public createPromptVersion(
    params: CreatePromptVersionParams,
  ): PromptVersionRow {
    const name = params.name?.trim();
    const component = params.component?.trim();
    if (!name) {
      throw new Error('Prompt version name cannot be empty');
    }
    if (!component) {
      throw new Error('Prompt version component cannot be empty');
    }
    if (!params.instructions?.trim()) {
      throw new Error('Prompt version instructions cannot be empty');
    }

    const createdAt = Date.now();
    const makeBaseline = params.isBaseline ?? false;

    this._writeDb.exec('BEGIN IMMEDIATE');
    let committed = false;
    try {
      if (makeBaseline) {
        this._writeDb
          .prepare('UPDATE prompt_versions SET is_baseline = 0')
          .run();
      }
      const result = this._writeDb
        .prepare(
          `INSERT INTO prompt_versions
             (name, component, instructions, model, parent_id, created_at, is_baseline)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          name,
          component,
          params.instructions,
          params.model ?? null,
          params.parentId ?? null,
          createdAt,
          makeBaseline ? 1 : 0,
        );
      this._writeDb.exec('COMMIT');
      committed = true;
      return this.getPromptVersion(Number(result.lastInsertRowid))!;
    } finally {
      if (!committed) {
        this._writeDb.exec('ROLLBACK');
      }
    }
  }

  public getPromptVersion(id: number): PromptVersionRow | null {
    const row = this._readDb
      .prepare('SELECT * FROM prompt_versions WHERE id = ?')
      .get(id) as PromptVersionRow | undefined;
    return row ?? null;
  }

  public listPromptVersions(): PromptVersionRow[] {
    return this._readDb
      .prepare('SELECT * FROM prompt_versions ORDER BY created_at ASC, id ASC')
      .all() as PromptVersionRow[];
  }

  public getBaseline(): PromptVersionRow | null {
    const row = this._readDb
      .prepare(
        'SELECT * FROM prompt_versions WHERE is_baseline = 1 ORDER BY created_at DESC, id DESC LIMIT 1',
      )
      .get() as PromptVersionRow | undefined;
    return row ?? null;
  }

  public deletePromptVersion(id: number): boolean {
    const result = this._writeDb
      .prepare('DELETE FROM prompt_versions WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  // -- eval cases ----------------------------------------------------------

  public createCase(params: CreateEvalCaseParams): EvalCaseRow {
    const slug = params.slug?.trim();
    const input = params.input?.trim();
    if (!slug) {
      throw new Error('Eval case slug cannot be empty');
    }
    if (!input) {
      // A reaction id or nomination alone is never a case: the recovered
      // message content/context must be supplied at review time.
      throw new Error(
        'Eval case input cannot be empty (recover message content first)',
      );
    }
    const split: EvalCaseSplit = params.split ?? 'heldout';
    if (split !== 'heldout' && split !== 'prompt_example') {
      throw new Error(`Unknown eval case split: ${split}`);
    }

    const createdAt = Date.now();
    try {
      const result = this._writeDb
        .prepare(
          `INSERT INTO eval_cases
             (slug, input, context, expected_tools, expected_language, expected_notes, split, nominated_by_reaction, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          slug,
          input,
          params.context ?? null,
          JSON.stringify(params.expectedTools ?? []),
          params.expectedLanguage ?? null,
          params.expectedNotes ?? null,
          split,
          params.nominatedByReaction ? 1 : 0,
          params.source ?? null,
          createdAt,
        );
      return this.getCase(Number(result.lastInsertRowid))!;
    } catch (error) {
      if (
        error instanceof Error &&
        /UNIQUE constraint failed.*eval_cases\.slug/.test(error.message)
      ) {
        throw new Error(`Eval case slug already exists: ${slug}`);
      }
      throw error;
    }
  }

  public getCase(id: number): EvalCaseRow | null {
    const row = this._readDb
      .prepare('SELECT * FROM eval_cases WHERE id = ?')
      .get(id) as EvalCaseRow | undefined;
    return row ?? null;
  }

  public getCaseBySlug(slug: string): EvalCaseRow | null {
    const row = this._readDb
      .prepare('SELECT * FROM eval_cases WHERE slug = ?')
      .get(slug) as EvalCaseRow | undefined;
    return row ?? null;
  }

  public listCases(split?: EvalCaseSplit): EvalCaseRow[] {
    if (split) {
      return this._readDb
        .prepare('SELECT * FROM eval_cases WHERE split = ? ORDER BY id ASC')
        .all(split) as EvalCaseRow[];
    }
    return this._readDb
      .prepare('SELECT * FROM eval_cases ORDER BY id ASC')
      .all() as EvalCaseRow[];
  }

  /** Held-out cases must never be pasted into a prompt under test. */
  public listHeldoutCases(): EvalCaseRow[] {
    return this.listCases('heldout');
  }

  public setCaseSplit(id: number, split: EvalCaseSplit): EvalCaseRow | null {
    if (split !== 'heldout' && split !== 'prompt_example') {
      throw new Error(`Unknown eval case split: ${split}`);
    }
    this._writeDb
      .prepare('UPDATE eval_cases SET split = ? WHERE id = ?')
      .run(split, id);
    return this.getCase(id);
  }

  /** Supports removal requests for stored conversation examples. */
  public deleteCase(id: number): boolean {
    const result = this._writeDb
      .prepare('DELETE FROM eval_cases WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  // -- reaction nominations --------------------------------------------------
  //
  // Reactions nominate a message for human review only. They are never
  // correctness labels, and an absent reaction means nothing about quality:
  // nominations sit in a pending queue until a reviewer recovers the message
  // content/context and explicitly creates a case from it.

  public nominateCase(params: NominateCaseParams): EvalNominationRow {
    if (!params.messageId?.trim() || !params.channelId?.trim()) {
      throw new Error('Nomination requires a message id and channel id');
    }
    if (!params.emojiName?.trim()) {
      throw new Error('Nomination requires the reacting emoji name');
    }
    const createdAt = Date.now();
    const result = this._writeDb
      .prepare(
        `INSERT INTO eval_nominations
           (message_id, channel_id, emoji_name, message_snapshot, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?)`,
      )
      .run(
        params.messageId,
        params.channelId,
        params.emojiName,
        params.messageSnapshot ?? null,
        createdAt,
      );
    return this.getNomination(Number(result.lastInsertRowid))!;
  }

  public getNomination(id: number): EvalNominationRow | null {
    const row = this._readDb
      .prepare('SELECT * FROM eval_nominations WHERE id = ?')
      .get(id) as EvalNominationRow | undefined;
    return row ?? null;
  }

  public listNominations(status?: EvalNominationStatus): EvalNominationRow[] {
    if (status) {
      return this._readDb
        .prepare(
          'SELECT * FROM eval_nominations WHERE status = ? ORDER BY id ASC',
        )
        .all(status) as EvalNominationRow[];
    }
    return this._readDb
      .prepare('SELECT * FROM eval_nominations ORDER BY id ASC')
      .all() as EvalNominationRow[];
  }

  /**
   * Review a nomination. Approving only marks it reviewed — the reviewer
   * still creates the case explicitly via `createCase` with recovered
   * content, so no reaction ever auto-labels an example.
   */
  public reviewNomination(
    id: number,
    decision: 'approved' | 'rejected',
  ): EvalNominationRow | null {
    this._writeDb
      .prepare('UPDATE eval_nominations SET status = ? WHERE id = ?')
      .run(decision, id);
    return this.getNomination(id);
  }

  public deleteNomination(id: number): boolean {
    const result = this._writeDb
      .prepare('DELETE FROM eval_nominations WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  // -- results + scores ------------------------------------------------------

  public recordResult(params: RecordResultParams): EvalResultRow {
    if (!this.getCase(params.caseId)) {
      throw new Error(`Unknown eval case: ${params.caseId}`);
    }
    if (!this.getPromptVersion(params.promptVersionId)) {
      throw new Error(`Unknown prompt version: ${params.promptVersionId}`);
    }
    if (!params.model?.trim()) {
      throw new Error('Result model cannot be empty');
    }
    if (!params.output?.trim()) {
      throw new Error('Result output cannot be empty');
    }

    const createdAt = Date.now();
    const result = this._writeDb
      .prepare(
        `INSERT INTO eval_results
           (case_id, prompt_version_id, model, output, tools_used, latency_ms, context_lost, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.caseId,
        params.promptVersionId,
        params.model,
        params.output,
        JSON.stringify(params.toolsUsed ?? []),
        params.latencyMs ?? null,
        params.contextLost ? 1 : 0,
        createdAt,
      );
    return this.getResult(Number(result.lastInsertRowid))!;
  }

  public getResult(id: number): EvalResultRow | null {
    const row = this._readDb
      .prepare('SELECT * FROM eval_results WHERE id = ?')
      .get(id) as EvalResultRow | undefined;
    return row ?? null;
  }

  public listResultsForVersion(promptVersionId: number): EvalResultRow[] {
    return this._readDb
      .prepare(
        'SELECT * FROM eval_results WHERE prompt_version_id = ? ORDER BY case_id ASC, id ASC',
      )
      .all(promptVersionId) as EvalResultRow[];
  }

  public scoreResult(params: ScoreResultParams): EvalScoreRow {
    if (!isEvalDimension(params.dimension)) {
      throw new Error(`Unknown eval dimension: ${params.dimension}`);
    }
    if (!this.getResult(params.resultId)) {
      throw new Error(`Unknown eval result: ${params.resultId}`);
    }
    if (
      !Number.isFinite(params.score) ||
      params.score < 0 ||
      params.score > 2
    ) {
      throw new Error('Eval score must be between 0 and 2');
    }

    const createdAt = Date.now();
    this._writeDb
      .prepare(
        `INSERT INTO eval_scores (result_id, dimension, score, notes, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(result_id, dimension) DO UPDATE SET
           score = excluded.score,
           notes = excluded.notes,
           created_at = excluded.created_at`,
      )
      .run(
        params.resultId,
        params.dimension,
        params.score,
        params.notes ?? null,
        createdAt,
      );
    const row = this._readDb
      .prepare(
        'SELECT * FROM eval_scores WHERE result_id = ? AND dimension = ?',
      )
      .get(params.resultId, params.dimension) as EvalScoreRow;
    return row;
  }

  public listScoresForResult(resultId: number): EvalScoreRow[] {
    return this._readDb
      .prepare(
        'SELECT * FROM eval_scores WHERE result_id = ? ORDER BY dimension ASC',
      )
      .all(resultId) as EvalScoreRow[];
  }

  /**
   * Compare a candidate prompt version against the baseline, one dimension
   * at a time. Length is summarized from raw outputs alongside the scored
   * `length` dimension so bloat shows up even before scoring.
   */
  public compareVersions(
    baselineId: number,
    candidateId: number,
  ): VersionComparison {
    const baselineResults = this.listResultsForVersion(baselineId);
    const candidateResults = this.listResultsForVersion(candidateId);

    const avgByDimension = (
      results: EvalResultRow[],
    ): Map<EvalDimension, { total: number; count: number }> => {
      const acc = new Map<EvalDimension, { total: number; count: number }>();
      for (const result of results) {
        for (const score of this.listScoresForResult(result.id)) {
          const entry = acc.get(score.dimension) ?? { total: 0, count: 0 };
          entry.total += score.score;
          entry.count += 1;
          acc.set(score.dimension, entry);
        }
      }
      return acc;
    };

    const baselineAvgs = avgByDimension(baselineResults);
    const candidateAvgs = avgByDimension(candidateResults);

    const dimensions: DimensionSummary[] = EVAL_DIMENSIONS.map((dimension) => {
      const b = baselineAvgs.get(dimension);
      const c = candidateAvgs.get(dimension);
      const baselineAvg = b && b.count > 0 ? b.total / b.count : null;
      const candidateAvg = c && c.count > 0 ? c.total / c.count : null;
      return {
        dimension,
        baselineAvg,
        candidateAvg,
        delta:
          baselineAvg !== null && candidateAvg !== null
            ? candidateAvg - baselineAvg
            : null,
        baselineCount: b?.count ?? 0,
        candidateCount: c?.count ?? 0,
      };
    });

    const baselineLength = summarizeLengths(
      baselineResults.map((r) => r.output),
    );
    const candidateLength = summarizeLengths(
      candidateResults.map((r) => r.output),
    );

    return {
      baselineId,
      candidateId,
      dimensions,
      baselineLength,
      candidateLength,
    };
  }

  // -- local review / export ---------------------------------------------------

  /** Full local export for review — no hosted eval platform required. */
  public exportJson(): EvalExport {
    return {
      exportedAt: Date.now(),
      promptVersions: this.listPromptVersions(),
      cases: this.listCases(),
      results: this._readDb
        .prepare('SELECT * FROM eval_results ORDER BY id ASC')
        .all() as EvalResultRow[],
      scores: this._readDb
        .prepare(
          'SELECT * FROM eval_scores ORDER BY result_id ASC, dimension ASC',
        )
        .all() as EvalScoreRow[],
      nominations: this.listNominations(),
    };
  }

  /**
   * Insert the curated starter cases, skipping slugs that already exist.
   * Returns the number of cases inserted.
   */
  public seedIfEmpty(cases: SeedEvalCase[] = SEED_EVAL_CASES): number {
    let inserted = 0;
    for (const seed of cases) {
      if (this.getCaseBySlug(seed.slug)) {
        continue;
      }
      this.createCase({
        slug: seed.slug,
        input: seed.input,
        context: seed.context ?? null,
        expectedTools: seed.expectedTools ?? [],
        expectedLanguage: seed.expectedLanguage ?? null,
        expectedNotes: seed.expectedNotes ?? null,
        split: seed.split ?? 'heldout',
        source: seed.source ?? 'seed',
      });
      inserted += 1;
    }
    return inserted;
  }

  /** Parsed view of a case's expected tool list (stored as JSON). */
  public expectedToolsFor(row: EvalCaseRow): string[] {
    return parseToolList(row.expected_tools);
  }

  /** Parsed view of a result's tool list (stored as JSON). */
  public toolsUsedFor(row: EvalResultRow): string[] {
    return parseToolList(row.tools_used);
  }

  public close(): void {
    if (this._closed) {
      return;
    }
    this._closed = true;
    this._readDb.close();
    this._writeDb.close();
  }
}

export default EvalService;
