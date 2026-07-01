import { vi, describe, it, expect, beforeEach } from 'vitest';

import { buildToolExecutor } from './tool-executor.ts';
import type { ToolExecutorContext } from './tool-executor.ts';
import { TOOL_NAMES } from '../chat/tool-names.ts';
import { createMockMessage } from '../../test-utils/createMockMessage.ts';

const runBashMock = vi.fn();
vi.mock('../bash/index.ts', () => ({
  runBash: (...args: unknown[]) => runBashMock(...args),
}));

const GRANTING_ROLE = 'role-ops';
const DENIED_MESSAGE = 'Denied, boet.';

function buildContext(
  overrides: Partial<ToolExecutorContext> = {},
): ToolExecutorContext {
  return {
    message: createMockMessage(),
    yr: {} as any,
    discord: { getRooivalkResponse: () => DENIED_MESSAGE } as any,
    memory: {} as any,
    steam: {} as any,
    github: {} as any,
    image: {} as any,
    createThread: vi.fn(),
    ...overrides,
  };
}

function messageWithRoles(roleIds: string[]) {
  return createMockMessage({
    member: {
      roles: { cache: { has: (id: string) => roleIds.includes(id) } },
    },
  });
}

describe('buildToolExecutor role-based tool permissions', () => {
  beforeEach(() => {
    runBashMock.mockReset();
    runBashMock.mockResolvedValue({ ok: true, output: 'done' });
  });

  it('runs an unrestricted tool regardless of the caller roles', async () => {
    const execute = buildToolExecutor(
      buildContext({ message: messageWithRoles([]), toolRoles: {} }),
    );

    const result = await execute(TOOL_NAMES.RUN_BASH, { command: 'ls' });

    expect(runBashMock).toHaveBeenCalledWith('ls');
    expect(result.deniedMessage).toBeUndefined();
  });

  it('denies a restricted tool when the member lacks a granting role', async () => {
    const execute = buildToolExecutor(
      buildContext({
        message: messageWithRoles(['some-other-role']),
        toolRoles: { [GRANTING_ROLE]: [TOOL_NAMES.RUN_BASH] },
      }),
    );

    const result = await execute(TOOL_NAMES.RUN_BASH, { command: 'ls' });

    expect(result.deniedMessage).toBe(DENIED_MESSAGE);
    expect(runBashMock).not.toHaveBeenCalled();
  });

  it('allows a restricted tool when the member holds a granting role', async () => {
    const execute = buildToolExecutor(
      buildContext({
        message: messageWithRoles([GRANTING_ROLE]),
        toolRoles: { [GRANTING_ROLE]: [TOOL_NAMES.RUN_BASH] },
      }),
    );

    const result = await execute(TOOL_NAMES.RUN_BASH, { command: 'ls' });

    expect(runBashMock).toHaveBeenCalledWith('ls');
    expect(result.deniedMessage).toBeUndefined();
  });

  it('denies when the author has no guild member (e.g. a DM)', async () => {
    const execute = buildToolExecutor(
      buildContext({
        message: createMockMessage({ member: null }),
        toolRoles: { [GRANTING_ROLE]: [TOOL_NAMES.RUN_BASH] },
      }),
    );

    const result = await execute(TOOL_NAMES.RUN_BASH, { command: 'ls' });

    expect(result.deniedMessage).toBe(DENIED_MESSAGE);
    expect(runBashMock).not.toHaveBeenCalled();
  });

  it('leaves an unlisted tool open even while other tools are gated', async () => {
    const execute = buildToolExecutor(
      buildContext({
        message: messageWithRoles([]),
        toolRoles: { [GRANTING_ROLE]: [TOOL_NAMES.QUERY_SQLITE] },
      }),
    );

    const result = await execute(TOOL_NAMES.RUN_BASH, { command: 'ls' });

    expect(runBashMock).toHaveBeenCalledWith('ls');
    expect(result.deniedMessage).toBeUndefined();
  });

  it('exposes deniedMessage for batch preflight (gated, no role -> message)', () => {
    const executor = buildToolExecutor(
      buildContext({
        message: messageWithRoles(['some-other-role']),
        toolRoles: { [GRANTING_ROLE]: [TOOL_NAMES.RUN_BASH] },
      }),
    );

    expect(executor.deniedMessage(TOOL_NAMES.RUN_BASH)).toBe(DENIED_MESSAGE);
    expect(executor.deniedMessage(TOOL_NAMES.GET_WEATHER)).toBeNull();
  });

  it('deniedMessage returns null when the caller holds a granting role', () => {
    const executor = buildToolExecutor(
      buildContext({
        message: messageWithRoles([GRANTING_ROLE]),
        toolRoles: { [GRANTING_ROLE]: [TOOL_NAMES.RUN_BASH] },
      }),
    );

    expect(executor.deniedMessage(TOOL_NAMES.RUN_BASH)).toBeNull();
  });

  it('grants a tool when any one of several roles permits it', async () => {
    const execute = buildToolExecutor(
      buildContext({
        message: messageWithRoles(['role-b']),
        toolRoles: {
          'role-a': [TOOL_NAMES.RUN_BASH],
          'role-b': [TOOL_NAMES.RUN_BASH],
        },
      }),
    );

    const result = await execute(TOOL_NAMES.RUN_BASH, { command: 'ls' });

    expect(runBashMock).toHaveBeenCalledWith('ls');
    expect(result.deniedMessage).toBeUndefined();
  });
});

describe('buildToolExecutor github tools', () => {
  it('creates an issue on a known repo and appends the attribution footer', async () => {
    const createIssue = vi
      .fn()
      .mockResolvedValue({ number: 1, url: 'https://example.com/1' });
    const execute = buildToolExecutor(
      buildContext({ github: { createIssue } as any }),
    );

    const result = await execute(TOOL_NAMES.CREATE_GITHUB_ISSUE, {
      repo: 'rooivalk',
      title: 'Bug title',
      body: 'Bug body',
    });

    expect(createIssue).toHaveBeenCalledWith(
      'fjlaubscher/rooivalk',
      'Bug title',
      expect.stringContaining('Bug body\n\n_Filed via rooivalk by'),
    );
    expect(JSON.parse(result.output)).toEqual({
      number: 1,
      url: 'https://example.com/1',
    });
  });

  it('returns an error for create_github_issue on an unknown repo', async () => {
    const createIssue = vi.fn();
    const execute = buildToolExecutor(
      buildContext({ github: { createIssue } as any }),
    );

    const result = await execute(TOOL_NAMES.CREATE_GITHUB_ISSUE, {
      repo: 'not-a-repo',
      title: 'Bug title',
      body: null,
    });

    expect(createIssue).not.toHaveBeenCalled();
    expect(JSON.parse(result.output)).toEqual({
      error: 'Unknown repo: not-a-repo',
    });
  });

  it('searches issues on a known repo, defaulting state to open', async () => {
    const searchIssues = vi.fn().mockResolvedValue([
      {
        number: 2,
        title: 'Login bug',
        state: 'open',
        url: 'https://example.com/2',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    const execute = buildToolExecutor(
      buildContext({ github: { searchIssues } as any }),
    );

    const result = await execute(TOOL_NAMES.SEARCH_GITHUB_ISSUES, {
      repo: 'warren',
      query: 'login',
      state: null,
    });

    expect(searchIssues).toHaveBeenCalledWith(
      'fjlaubscher/warren',
      'login',
      'open',
    );
    expect(JSON.parse(result.output)).toHaveLength(1);
  });

  it('returns an error for search_github_issues on an unknown repo', async () => {
    const searchIssues = vi.fn();
    const execute = buildToolExecutor(
      buildContext({ github: { searchIssues } as any }),
    );

    const result = await execute(TOOL_NAMES.SEARCH_GITHUB_ISSUES, {
      repo: 'not-a-repo',
      query: null,
      state: null,
    });

    expect(searchIssues).not.toHaveBeenCalled();
    expect(JSON.parse(result.output)).toEqual({
      error: 'Unknown repo: not-a-repo',
    });
  });

  it('wraps a thrown error from createIssue in the error output', async () => {
    const createIssue = vi.fn().mockRejectedValue(new Error('boom'));
    const execute = buildToolExecutor(
      buildContext({ github: { createIssue } as any }),
    );

    const result = await execute(TOOL_NAMES.CREATE_GITHUB_ISSUE, {
      repo: 'rooivalk',
      title: 'Bug title',
      body: null,
    });

    expect(JSON.parse(result.output)).toEqual({ error: 'boom' });
  });
});
