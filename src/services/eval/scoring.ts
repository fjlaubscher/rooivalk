import { DISCORD_MESSAGE_LIMIT } from '../../constants.ts';
import { EVAL_DIMENSIONS, type EvalDimension } from './types.ts';

/** Default prose target mirrored from `config/instructions.md`. */
export const EVAL_TARGET_LENGTH = 1800;

export type LengthAssessment = {
  chars: number;
  withinTarget: boolean;
  withinLimit: boolean;
  overBy: number;
};

export function assessResponseLength(
  output: string,
  targetLength: number = EVAL_TARGET_LENGTH,
  hardLimit: number = DISCORD_MESSAGE_LIMIT,
): LengthAssessment {
  const chars = [...output].length;
  return {
    chars,
    withinTarget: chars <= targetLength,
    withinLimit: chars <= hardLimit,
    overBy: Math.max(0, chars - targetLength),
  };
}

export type ToolChoiceVerdict = 'match' | 'mismatch' | 'no-expectation';

export function normalizeToolList(tools: readonly string[]): string[] {
  return [...new Set(tools.map((t) => t.trim()).filter(Boolean))].sort();
}

export function compareToolChoice(
  expected: readonly string[],
  actual: readonly string[],
): ToolChoiceVerdict {
  const want = normalizeToolList(expected);
  if (want.length === 0) {
    return 'no-expectation';
  }
  const got = normalizeToolList(actual);
  return want.length === got.length && want.every((t, i) => t === got[i])
    ? 'match'
    : 'mismatch';
}

// Small transparent signal list that powers the language-match *assist* only.
// It never grades a turn by itself; the reviewer scores `language_match`.
const AFRIKAANS_SIGNALS = [
  'lekker',
  'bra',
  'boet',
  'mos',
  'eish',
  'ag nee',
  'ja nee',
  'bakkie',
  'braai',
  'jukskei',
  'dankie',
  'asseblief',
  'hoe gaan',
  'wat maak',
  'gesels',
];

export type LanguageAssist = {
  expected: string | null;
  signalsFound: string[];
  note: string;
};

export function assistLanguageMatch(
  expectedLanguage: string | null,
  output: string,
): LanguageAssist {
  if (!expectedLanguage) {
    return { expected: null, signalsFound: [], note: 'no expectation' };
  }
  const lowered = output.toLowerCase();
  const signalsFound = AFRIKAANS_SIGNALS.filter((s) => lowered.includes(s));
  const expectsAfrikaans = /af|kaaps/i.test(expectedLanguage);
  const note = expectsAfrikaans
    ? signalsFound.length > 0
      ? 'output shows Afrikaans signals matching the expectation'
      : 'no Afrikaans signals detected — reviewer should check language match'
    : 'non-Afrikaans expectation — reviewer checks the mirror-language rule';
  return { expected: expectedLanguage, signalsFound, note };
}

export function isEvalDimension(value: string): value is EvalDimension {
  return (EVAL_DIMENSIONS as readonly string[]).includes(value);
}

export function summarizeLengths(outputs: readonly string[]): {
  count: number;
  avgChars: number | null;
  maxChars: number | null;
  overTarget: number;
  overLimit: number;
} {
  if (outputs.length === 0) {
    return {
      count: 0,
      avgChars: null,
      maxChars: null,
      overTarget: 0,
      overLimit: 0,
    };
  }
  let total = 0;
  let max = 0;
  let overTarget = 0;
  let overLimit = 0;
  for (const output of outputs) {
    const assessment = assessResponseLength(output);
    total += assessment.chars;
    max = Math.max(max, assessment.chars);
    if (!assessment.withinTarget) overTarget += 1;
    if (!assessment.withinLimit) overLimit += 1;
  }
  return {
    count: outputs.length,
    avgChars: total / outputs.length,
    maxChars: max,
    overTarget,
    overLimit,
  };
}
