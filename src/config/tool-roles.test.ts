import { describe, it, expect, vi, afterEach } from 'vitest';

const mockReadFile = vi.hoisted(() => vi.fn());

vi.mock('fs/promises', () => ({ readFile: mockReadFile }));

import { loadToolRoles, parseToolRoles } from './tool-roles.ts';

describe('parseToolRoles', () => {
  it('accepts a role mapping to known tool names', () => {
    const input = { '123': ['run_bash', 'query_sqlite', 'describe_schema'] };

    expect(parseToolRoles(input)).toEqual(input);
  });

  it('accepts an empty object (no tools restricted)', () => {
    expect(parseToolRoles({})).toEqual({});
  });

  it('accepts a role with an empty tool list', () => {
    expect(parseToolRoles({ '123': [] })).toEqual({ '123': [] });
  });

  it.each([
    ['null', null],
    ['an array', ['run_bash']],
    ['a string', 'run_bash'],
  ])('rejects %s at the top level', (_label, input) => {
    expect(() => parseToolRoles(input)).toThrow(
      /must be an object mapping role id to tool names/,
    );
  });

  it('rejects a role whose value is not an array', () => {
    expect(() => parseToolRoles({ '123': 'run_bash' })).toThrow(
      /role "123" must map to an array of tool names/,
    );
  });

  it('rejects a role whose array holds a non-string', () => {
    expect(() => parseToolRoles({ '123': ['run_bash', 42] })).toThrow(
      /role "123" must map to an array of tool names/,
    );
  });

  it('fails closed on an unknown tool name (a typo would leave it ungated)', () => {
    expect(() => parseToolRoles({ '123': ['run_bsah'] })).toThrow(
      /lists unknown tool name\(s\): run_bsah/,
    );
  });
});

describe('loadToolRoles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('warns that every tool is ungated when the file is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockReadFile.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );

    await expect(loadToolRoles()).resolves.toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('run_bash'));
  });

  it('stays quiet when the file is present', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockReadFile.mockResolvedValue('{"123":["run_bash"]}');

    await expect(loadToolRoles()).resolves.toEqual({ '123': ['run_bash'] });
    expect(warn).not.toHaveBeenCalled();
  });
});
