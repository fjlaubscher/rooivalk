import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// readFile is mocked per-test; loadConfig reads many small files, so the mock
// dispatches by filename and `routesJson` is swapped in by each test.
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock('fs/promises', () => ({ readFile }));

import { loadConfig } from './loader.ts';

const ENOENT = Object.assign(new Error('ENOENT: no such file'), {
  code: 'ENOENT',
});

let routesJson: string | Error = ENOENT;

const mockReadFile = (path: string): string => {
  if (path.endsWith('package.json')) return '{"version":"1.0.0"}';
  if (path.endsWith('routes.json')) {
    if (routesJson instanceof Error) throw routesJson;
    return routesJson;
  }
  // All other config files are markdown; "- foo" satisfies both the message
  // list parser and the instruction loader.
  return '- foo';
};

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  routesJson = ENOENT;
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

describe('loadConfig routes', () => {
  it('defaults to no routes when routes.json is absent', async () => {
    const config = await loadConfig();
    expect(config.routes).toEqual([]);
    expect(config.profiles).toEqual({});
  });

  it('loads a valid route and its instruction profile', async () => {
    routesJson = JSON.stringify([
      {
        name: 'field-hospital',
        channelId: 'chan-1',
        roleId: 'role-1',
        instructions: 'field-hospital',
        model: 'some-model',
        provider: 'openai',
      },
    ]);

    const config = await loadConfig();

    expect(config.routes).toHaveLength(1);
    expect(config.routes[0]!.name).toBe('field-hospital');
    expect(config.profiles['field-hospital']).toBe('- foo');
  });

  it('skips a malformed route missing a required field', async () => {
    routesJson = JSON.stringify([
      { name: 'ok', channelId: 'chan-1', instructions: 'prof' },
      { name: 'no-channel', instructions: 'prof' },
    ]);

    const config = await loadConfig();

    expect(config.routes.map((r) => r.name)).toEqual(['ok']);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('is malformed'),
    );
  });

  it('skips a route with an unknown provider', async () => {
    routesJson = JSON.stringify([
      {
        name: 'bad-provider',
        channelId: 'chan-1',
        instructions: 'prof',
        provider: 'anthropic',
      },
    ]);

    const config = await loadConfig();

    expect(config.routes).toEqual([]);
  });

  it('keeps the first of two routes that reuse a name', async () => {
    routesJson = JSON.stringify([
      { name: 'dup', channelId: 'chan-1', instructions: 'prof' },
      { name: 'dup', channelId: 'chan-2', instructions: 'prof' },
    ]);

    const config = await loadConfig();

    expect(config.routes).toHaveLength(1);
    expect(config.routes[0]!.channelId).toBe('chan-1');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('duplicate route name'),
    );
  });

  it('throws when routes.json is not an array', async () => {
    routesJson = JSON.stringify({ name: 'not-an-array' });

    await expect(loadConfig()).rejects.toThrow('must be an array');
  });
});
