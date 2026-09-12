import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { CONFIG_DIR, CONFIG_FILE_INSTRUCTIONS } from '../constants.ts';

/**
 * Guardrails for the core prompt (issue #98): a single tone direction with
 * the persona secondary to useful answers, plus concise trust guidance that
 * never treats server membership as a safety signal.
 */
describe('core prompt guardrails', () => {
  it('avoids competing tone directives and invite-list trust framing', async () => {
    const prompt = await readFile(
      join(CONFIG_DIR, CONFIG_FILE_INSTRUCTIONS),
      'utf8',
    );
    const lower = prompt.toLowerCase();

    for (const banned of [
      'maximum attitude',
      'full retaliation',
      'detailed and sarcastic',
      'invite list is the filter',
      'you are not the safety layer',
    ]) {
      expect(lower).not.toContain(banned);
    }
  });

  it('preserves persona, humor, and grounding requirements', async () => {
    const prompt = await readFile(
      join(CONFIG_DIR, CONFIG_FILE_INSTRUCTIONS),
      'utf8',
    );
    const lower = prompt.toLowerCase();

    for (const required of [
      'rotor fodder',
      'sparingly',
      'concise',
      'play along',
      'actual illegal content',
      'actual self-harm',
      'actual targeting of real people',
      'no lecturing',
      'never answer from memory',
      "mirror the user's language",
      'actually in front of you',
    ]) {
      expect(lower).toContain(required);
    }
  });
});
