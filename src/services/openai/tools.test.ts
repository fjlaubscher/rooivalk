import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { CONFIG_DIR, CONFIG_FILE_INSTRUCTIONS } from '../../constants.ts';
import { TOOL_NAMES } from '../chat/tool-names.ts';
import { FUNCTION_TOOLS } from './tools.ts';

const descriptionFor = (name: string): string => {
  const tool = FUNCTION_TOOLS.find(
    (t) => t.type === 'function' && 'name' in t && t.name === name,
  );
  expect(tool, `tool ${name} is defined`).toBeDefined();
  return tool!.type === 'function' ? (tool!.description ?? '') : '';
};

/**
 * Tool-specific behavioral requirements live in their function tool
 * descriptions (issue #99) — one authoritative home each, not duplicated in
 * the core prompt.
 */
describe('tool description requirements', () => {
  it('keeps react guidance for acks and DM unicode-only', () => {
    const description = descriptionFor(TOOL_NAMES.REACT);
    expect(description).toContain('simple acknowledgements');
    expect(description).toContain('leave your text reply empty');
    expect(description).toContain('get_emojis');
    expect(description).toContain('In DMs only unicode works');
  });

  it('keeps weather attribution in get_weather', () => {
    const description = descriptionFor(TOOL_NAMES.GET_WEATHER);
    expect(description).toContain('yr.no');
    expect(description).toContain('CC BY 4.0');
    expect(description).toContain('always include the attribution');
  });

  it('keeps UTC-to-SAST formatting in get_guild_events', () => {
    const description = descriptionFor(TOOL_NAMES.GET_GUILD_EVENTS);
    expect(description).toContain('UTC');
    expect(description).toContain('SAST (UTC+2)');
  });

  it('keeps the speaker-memory lookup rule in recall', () => {
    const description = descriptionFor(TOOL_NAMES.RECALL);
    expect(description).toContain('before saying "I don\'t know"');
  });

  it('keeps store URL placement in get_game_listing', () => {
    const description = descriptionFor(TOOL_NAMES.GET_GAME_LISTING);
    expect(description).toContain(
      'store URL bare on the last line of that game',
    );
  });

  it('keeps lookup preference and URL placement in lookup_spotify', () => {
    const description = descriptionFor(TOOL_NAMES.LOOKUP_SPOTIFY);
    expect(description).toContain('prefer this over guessing');
    expect(description).toContain('Spotify URL bare on its own line');
  });

  it('does not duplicate tool-specific rules in the core prompt', async () => {
    const prompt = (
      await readFile(join(CONFIG_DIR, CONFIG_FILE_INSTRUCTIONS), 'utf8')
    ).toLowerCase();

    for (const duplicated of [
      'cc by',
      'sast',
      'bare on the last line',
      'bare on its own line',
      'before saying "i don\'t know"',
    ]) {
      expect(prompt).not.toContain(duplicated);
    }
  });

  it('keeps general tool-selection and grounding rules in the core prompt', async () => {
    const prompt = (
      await readFile(join(CONFIG_DIR, CONFIG_FILE_INSTRUCTIONS), 'utf8')
    ).toLowerCase();

    for (const general of [
      'never answer from memory',
      'never fill gaps',
      'in each tool',
    ]) {
      expect(prompt).toContain(general);
    }
  });
});
