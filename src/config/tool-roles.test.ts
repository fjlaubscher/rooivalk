import { describe, it, expect } from 'vitest';

import { parseToolRoles } from './tool-roles.ts';

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
