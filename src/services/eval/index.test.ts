import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import EvalService from './index.ts';
import { SEED_EVAL_CASES } from './seed-cases.ts';
import {
  assistLanguageMatch,
  compareToolChoice,
  assessResponseLength,
  summarizeLengths,
} from './scoring.ts';

describe('EvalService', () => {
  let tmpDir: string;
  let dbPath: string;
  let evalService: EvalService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rooivalk-eval-'));
    dbPath = join(tmpDir, 'test.db');
    evalService = new EvalService(dbPath);
  });

  afterEach(() => {
    evalService.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('prompt versions', () => {
    it('creates versions and tracks the single-component change', () => {
      const v1 = evalService.createPromptVersion({
        name: 'baseline',
        component: 'voice-tone',
        instructions: 'Be concise.',
        model: 'gpt-5',
        isBaseline: true,
      });
      expect(v1.component).toBe('voice-tone');
      expect(evalService.getBaseline()?.id).toBe(v1.id);

      const v2 = evalService.createPromptVersion({
        name: 'candidate',
        component: 'voice-tone',
        instructions: 'Be terse.',
        parentId: v1.id,
      });
      expect(v2.parent_id).toBe(v1.id);
      // Baseline stays until explicitly moved.
      expect(evalService.getBaseline()?.id).toBe(v1.id);
    });

    it('moves the baseline flag atomically', () => {
      const v1 = evalService.createPromptVersion({
        name: 'v1',
        component: 'a',
        instructions: 'one',
        isBaseline: true,
      });
      const v2 = evalService.createPromptVersion({
        name: 'v2',
        component: 'a',
        instructions: 'two',
        isBaseline: true,
      });
      expect(evalService.getBaseline()?.id).toBe(v2.id);
      expect(evalService.getPromptVersion(v1.id)?.is_baseline).toBe(0);
    });

    it('rejects empty versions', () => {
      expect(() =>
        evalService.createPromptVersion({
          name: 'x',
          component: 'a',
          instructions: '   ',
        }),
      ).toThrow(/instructions cannot be empty/);
    });

    it('supports removal of prompt versions', () => {
      const v = evalService.createPromptVersion({
        name: 'tmp',
        component: 'a',
        instructions: 'one',
      });
      expect(evalService.deletePromptVersion(v.id)).toBe(true);
      expect(evalService.getPromptVersion(v.id)).toBeNull();
    });
  });

  describe('eval cases', () => {
    it('creates and lists cases with held-out default', () => {
      const c = evalService.createCase({
        slug: 'case-1',
        input: '@rooivalk hello',
        expectedTools: [],
        expectedLanguage: 'en',
      });
      expect(c.split).toBe('heldout');
      expect(evalService.listHeldoutCases()).toHaveLength(1);
    });

    it('rejects duplicate slugs', () => {
      evalService.createCase({ slug: 'dup', input: 'hi' });
      expect(() =>
        evalService.createCase({ slug: 'dup', input: 'hi again' }),
      ).toThrow(/slug already exists/);
    });

    it('requires recovered content — a bare id is never a case', () => {
      expect(() =>
        evalService.createCase({ slug: 'no-content', input: '   ' }),
      ).toThrow(/recover message content/);
    });

    it('keeps prompt examples separate from held-out cases', () => {
      evalService.createCase({ slug: 'h1', input: 'held out' });
      evalService.createCase({
        slug: 'p1',
        input: 'prompt example',
        split: 'prompt_example',
      });
      expect(evalService.listCases('heldout').map((c) => c.slug)).toEqual([
        'h1',
      ]);
      expect(
        evalService.listCases('prompt_example').map((c) => c.slug),
      ).toEqual(['p1']);
    });

    it('supports removal of stored examples', () => {
      const c = evalService.createCase({ slug: 'gone', input: 'bye' });
      expect(evalService.deleteCase(c.id)).toBe(true);
      expect(evalService.getCase(c.id)).toBeNull();
    });
  });

  describe('nominations', () => {
    it('queues reactions for review without creating cases', () => {
      const n = evalService.nominateCase({
        messageId: 'msg-1',
        channelId: 'ch-1',
        emojiName: 'fire',
        messageSnapshot: 'recovered content',
      });
      expect(n.status).toBe('pending');
      // A nomination is not a label: no case appears until explicit review.
      expect(evalService.listCases()).toHaveLength(0);
      expect(evalService.listNominations('pending')).toHaveLength(1);
    });

    it('approving a nomination still requires an explicit case', () => {
      const n = evalService.nominateCase({
        messageId: 'msg-1',
        channelId: 'ch-1',
        emojiName: 'fire',
      });
      evalService.reviewNomination(n.id, 'approved');
      expect(evalService.getNomination(n.id)?.status).toBe('approved');
      expect(evalService.listCases()).toHaveLength(0);
    });

    it('absent reactions mean nothing — un-nominated content stays out', () => {
      evalService.createCase({ slug: 'curated', input: 'curated input' });
      expect(evalService.listCases()).toHaveLength(1);
      expect(evalService.listNominations()).toHaveLength(0);
    });
  });

  describe('results and scores', () => {
    it('records which prompt version and model produced each answer', () => {
      const v = evalService.createPromptVersion({
        name: 'v1',
        component: 'a',
        instructions: 'one',
      });
      const c = evalService.createCase({ slug: 'c1', input: 'hi' });
      const r = evalService.recordResult({
        caseId: c.id,
        promptVersionId: v.id,
        model: 'gpt-5-mini',
        output: 'hello Rotor Fodder',
        toolsUsed: ['get_weather'],
      });
      expect(r.model).toBe('gpt-5-mini');
      expect(r.prompt_version_id).toBe(v.id);
      expect(evalService.toolsUsedFor(r)).toEqual(['get_weather']);
    });

    it('rejects results for unknown cases or versions', () => {
      const v = evalService.createPromptVersion({
        name: 'v1',
        component: 'a',
        instructions: 'one',
      });
      expect(() =>
        evalService.recordResult({
          caseId: 9999,
          promptVersionId: v.id,
          model: 'm',
          output: 'o',
        }),
      ).toThrow(/Unknown eval case/);
      const c = evalService.createCase({ slug: 'c1', input: 'hi' });
      expect(() =>
        evalService.recordResult({
          caseId: c.id,
          promptVersionId: 9999,
          model: 'm',
          output: 'o',
        }),
      ).toThrow(/Unknown prompt version/);
    });

    it('scores each dimension separately and upserts on re-score', () => {
      const v = evalService.createPromptVersion({
        name: 'v1',
        component: 'a',
        instructions: 'one',
      });
      const c = evalService.createCase({ slug: 'c1', input: 'hi' });
      const r = evalService.recordResult({
        caseId: c.id,
        promptVersionId: v.id,
        model: 'm',
        output: 'hello',
      });
      evalService.scoreResult({
        resultId: r.id,
        dimension: 'correctness',
        score: 1,
      });
      evalService.scoreResult({
        resultId: r.id,
        dimension: 'correctness',
        score: 2,
        notes: 'reviewed again',
      });
      evalService.scoreResult({
        resultId: r.id,
        dimension: 'tool_choice',
        score: 2,
      });
      const scores = evalService.listScoresForResult(r.id);
      expect(scores).toHaveLength(2);
      expect(scores.find((s) => s.dimension === 'correctness')?.score).toBe(2);
    });

    it('rejects out-of-range scores and unknown dimensions', () => {
      const v = evalService.createPromptVersion({
        name: 'v1',
        component: 'a',
        instructions: 'one',
      });
      const c = evalService.createCase({ slug: 'c1', input: 'hi' });
      const r = evalService.recordResult({
        caseId: c.id,
        promptVersionId: v.id,
        model: 'm',
        output: 'hello',
      });
      expect(() =>
        evalService.scoreResult({
          resultId: r.id,
          dimension: 'correctness',
          score: 5,
        }),
      ).toThrow(/between 0 and 2/);
      expect(() =>
        evalService.scoreResult({
          resultId: r.id,
          dimension: 'vibes' as never,
          score: 1,
        }),
      ).toThrow(/Unknown eval dimension/);
    });

    it('compares baseline vs candidate per dimension with length stats', () => {
      const base = evalService.createPromptVersion({
        name: 'base',
        component: 'a',
        instructions: 'one',
        isBaseline: true,
      });
      const cand = evalService.createPromptVersion({
        name: 'cand',
        component: 'a',
        instructions: 'two',
        parentId: base.id,
      });
      const c1 = evalService.createCase({ slug: 'c1', input: 'hi' });
      const c2 = evalService.createCase({ slug: 'c2', input: 'yo' });

      const rb1 = evalService.recordResult({
        caseId: c1.id,
        promptVersionId: base.id,
        model: 'm',
        output: 'short',
      });
      const rb2 = evalService.recordResult({
        caseId: c2.id,
        promptVersionId: base.id,
        model: 'm',
        output: 'short',
      });
      const rc1 = evalService.recordResult({
        caseId: c1.id,
        promptVersionId: cand.id,
        model: 'm',
        output: 'a much better answer',
      });
      const rc2 = evalService.recordResult({
        caseId: c2.id,
        promptVersionId: cand.id,
        model: 'm',
        output: 'a much better answer',
      });

      for (const r of [rb1, rb2]) {
        evalService.scoreResult({
          resultId: r.id,
          dimension: 'correctness',
          score: 1,
        });
      }
      for (const r of [rc1, rc2]) {
        evalService.scoreResult({
          resultId: r.id,
          dimension: 'correctness',
          score: 2,
        });
      }

      const cmp = evalService.compareVersions(base.id, cand.id);
      const correctness = cmp.dimensions.find(
        (d) => d.dimension === 'correctness',
      )!;
      expect(correctness.baselineAvg).toBe(1);
      expect(correctness.candidateAvg).toBe(2);
      expect(correctness.delta).toBe(1);
      // Unscored dimensions stay null rather than zero.
      const tone = cmp.dimensions.find((d) => d.dimension === 'tone_humor')!;
      expect(tone.baselineAvg).toBeNull();
      expect(cmp.baselineLength.count).toBe(2);
      expect(cmp.candidateLength.count).toBe(2);
    });
  });

  describe('export and seed', () => {
    it('exports everything locally without a hosted platform', () => {
      const v = evalService.createPromptVersion({
        name: 'v1',
        component: 'a',
        instructions: 'one',
      });
      const c = evalService.createCase({ slug: 'c1', input: 'hi' });
      const r = evalService.recordResult({
        caseId: c.id,
        promptVersionId: v.id,
        model: 'm',
        output: 'hello',
      });
      evalService.scoreResult({
        resultId: r.id,
        dimension: 'length',
        score: 2,
      });
      const dump = evalService.exportJson();
      expect(dump.promptVersions).toHaveLength(1);
      expect(dump.cases).toHaveLength(1);
      expect(dump.results).toHaveLength(1);
      expect(dump.scores).toHaveLength(1);
      expect(dump.exportedAt).toBeGreaterThan(0);
    });

    it('seeds ~30 curated cases and stays idempotent', () => {
      const inserted = evalService.seedIfEmpty();
      expect(inserted).toBeGreaterThanOrEqual(30);
      expect(SEED_EVAL_CASES.length).toBeGreaterThanOrEqual(30);
      expect(evalService.listCases()).toHaveLength(SEED_EVAL_CASES.length);
      // Held-out stays the default; only explicit examples differ.
      expect(evalService.listHeldoutCases().length).toBeGreaterThan(25);
      expect(evalService.seedIfEmpty()).toBe(0);
    });

    it('seed cases carry full content, not bare reaction ids', () => {
      for (const seed of SEED_EVAL_CASES) {
        expect(seed.input.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('scoring helpers', () => {
    it('assesses length against target and Discord limit', () => {
      expect(assessResponseLength('hi').withinTarget).toBe(true);
      const long = assessResponseLength('x'.repeat(1900));
      expect(long.withinTarget).toBe(false);
      expect(long.withinLimit).toBe(true);
      expect(assessResponseLength('x'.repeat(2100)).withinLimit).toBe(false);
    });

    it('compares tool choice exactly, with a no-expectation state', () => {
      expect(compareToolChoice([], ['get_weather'])).toBe('no-expectation');
      expect(compareToolChoice(['get_weather'], ['get_weather'])).toBe('match');
      expect(compareToolChoice(['get_weather'], [])).toBe('mismatch');
    });

    it('assists (not grades) language matching', () => {
      const assist = assistLanguageMatch('af', 'dankie, dit was lekker!');
      expect(assist.signalsFound.length).toBeGreaterThan(0);
      expect(assistLanguageMatch(null, 'hi').note).toBe('no expectation');
    });

    it('summarizes lengths across a run', () => {
      const summary = summarizeLengths(['hi', 'x'.repeat(1900)]);
      expect(summary.count).toBe(2);
      expect(summary.overTarget).toBe(1);
      expect(summary.overLimit).toBe(0);
      expect(summarizeLengths([]).avgChars).toBeNull();
    });
  });
});
