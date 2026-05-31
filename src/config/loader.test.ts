import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// readFile is mocked per-test; loadConfig reads many small files, so the mock
// dispatches by filename and `profilesJson` is swapped in by each test.
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock('fs/promises', () => ({ readFile }));

import { loadConfig } from './loader.ts';

const ENOENT = Object.assign(new Error('ENOENT: no such file'), {
  code: 'ENOENT',
});

let profilesJson: string | Error = ENOENT;
let toolRolesJson: string | Error = ENOENT;

const mockReadFile = (path: string): string => {
  if (path.endsWith('package.json')) return '{"version":"1.0.0"}';
  if (path.endsWith('tool-roles.json')) {
    if (toolRolesJson instanceof Error) throw toolRolesJson;
    return toolRolesJson;
  }
  if (path.endsWith('profiles.json')) {
    if (profilesJson instanceof Error) throw profilesJson;
    return profilesJson;
  }
  // All other config files are markdown; "- foo" satisfies both the message
  // list parser and the instruction loader.
  return '- foo';
};

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  profilesJson = ENOENT;
  toolRolesJson = ENOENT;
  readFile.mockImplementation((path: string) =>
    Promise.resolve(mockReadFile(path)),
  );
  // Malformed/duplicate routes warn by design; keep test output quiet.
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  vi.clearAllMocks();
});

describe('loadConfig profiles', () => {
  it('defaults to no profiles when profiles.json is absent', async () => {
    const config = await loadConfig();
    expect(config.profiles).toEqual([]);
    expect(config.profileInstructions).toEqual({});
  });

  it('loads a valid profile and its instructions', async () => {
    profilesJson = JSON.stringify([
      {
        name: 'field-hospital',
        channelId: 'chan-1',
        roleId: 'role-1',
        model: 'some-model',
        provider: 'openai',
      },
    ]);

    const config = await loadConfig();

    expect(config.profiles).toHaveLength(1);
    expect(config.profiles[0]!.name).toBe('field-hospital');
    expect(config.profileInstructions['field-hospital']).toBe('- foo');
  });

  it('skips a malformed profile missing a required field', async () => {
    profilesJson = JSON.stringify([
      { name: 'ok', channelId: 'chan-1' },
      { name: 'no-channel' },
    ]);

    const config = await loadConfig();

    expect(config.profiles.map((p) => p.name)).toEqual(['ok']);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('is malformed'),
    );
  });

  it('skips a profile with an unknown provider', async () => {
    profilesJson = JSON.stringify([
      {
        name: 'bad-provider',
        channelId: 'chan-1',
        provider: 'anthropic',
      },
    ]);

    const config = await loadConfig();

    expect(config.profiles).toEqual([]);
  });

  it('keeps the first of two profiles that reuse a name', async () => {
    profilesJson = JSON.stringify([
      { name: 'dup', channelId: 'chan-1' },
      { name: 'dup', channelId: 'chan-2' },
    ]);

    const config = await loadConfig();

    expect(config.profiles).toHaveLength(1);
    expect(config.profiles[0]!.channelId).toBe('chan-1');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('duplicate profile name'),
    );
  });

  it('throws when profiles.json is not an array', async () => {
    profilesJson = JSON.stringify({ name: 'not-an-array' });

    await expect(loadConfig()).rejects.toThrow('must be an array');
  });
});

describe('loadConfig tool roles', () => {
  it('defaults to no restrictions when tool-roles.json is absent', async () => {
    const config = await loadConfig();
    expect(config.toolRoles).toEqual({});
  });

  it('loads a valid role -> tools map', async () => {
    toolRolesJson = JSON.stringify({ 'role-1': ['run_bash', 'query_sqlite'] });

    const config = await loadConfig();

    expect(config.toolRoles).toEqual({
      'role-1': ['run_bash', 'query_sqlite'],
    });
  });

  it('skips a role whose value is not an array of tool names', async () => {
    toolRolesJson = JSON.stringify({ 'role-1': 'run_bash' });

    const config = await loadConfig();

    expect(config.toolRoles).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('must map to an array'),
    );
  });

  it('keeps known tools but warns about unknown tool names', async () => {
    toolRolesJson = JSON.stringify({ 'role-1': ['run_bash', 'not_a_tool'] });

    const config = await loadConfig();

    expect(config.toolRoles).toEqual({ 'role-1': ['run_bash', 'not_a_tool'] });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown tool name'),
    );
  });

  it('throws when tool-roles.json is not an object', async () => {
    toolRolesJson = JSON.stringify(['run_bash']);

    await expect(loadConfig()).rejects.toThrow(
      'must be an object mapping role id to tool names',
    );
  });
});
