import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import { parseProfile, parseProfiles } from './profiles.ts';

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Malformed/duplicate entries warn by design; keep test output quiet.
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

const validProfile = {
  name: 'field-hospital',
  channelId: '42',
  roleId: '7',
  model: 'gpt-5',
};

describe('parseProfile', () => {
  it('accepts a fully specified profile', () => {
    expect(parseProfile(validProfile, 0)).toEqual(validProfile);
  });

  it('accepts a profile with only the required fields', () => {
    const minimal = { name: 'a', channelId: '1' };
    expect(parseProfile(minimal, 0)).toEqual(minimal);
  });

  it.each([
    ['a non-object', 5],
    ['null', null],
    ['a missing name', { channelId: '1' }],
    ['a missing channelId', { name: 'a' }],
    ['a non-string roleId', { name: 'a', channelId: '1', roleId: 7 }],
    ['a non-string model', { name: 'a', channelId: '1', model: 5 }],
  ])('drops %s (returns null)', (_label, entry) => {
    expect(parseProfile(entry, 0)).toBeNull();
  });
});

describe('parseProfiles', () => {
  it('throws when the top level is not an array', () => {
    expect(() => parseProfiles({})).toThrow(/must be an array/);
  });

  it('keeps valid entries and drops malformed ones', () => {
    const result = parseProfiles([
      validProfile,
      { channelId: 'no-name' },
      { name: 'b', channelId: '2' },
    ]);

    expect(result).toEqual([validProfile, { name: 'b', channelId: '2' }]);
  });

  it('keeps the first of a duplicated name and drops later ones', () => {
    const result = parseProfiles([
      { name: 'dup', channelId: '1' },
      { name: 'dup', channelId: '2' },
    ]);

    expect(result).toEqual([{ name: 'dup', channelId: '1' }]);
  });
});
