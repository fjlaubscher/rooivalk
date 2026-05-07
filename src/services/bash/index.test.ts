import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExec = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ exec: mockExec }));

import { runBash } from './index.ts';

function stubExec(stdout: string, stderr = '') {
  mockExec.mockImplementation(
    (
      _cmd: string,
      _opts: unknown,
      cb: (err: null, result: { stdout: string; stderr: string }) => void,
    ) => cb(null, { stdout, stderr }),
  );
}

describe('runBash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('allowlist validation', () => {
    it('rejects an unlisted command', async () => {
      const result = await runBash('rm -rf .');
      expect(result.ok).toBe(false);
      expect(mockExec).not.toHaveBeenCalled();
    });

    it('rejects a partial prefix match', async () => {
      const result = await runBash('catfish src/');
      expect(result.ok).toBe(false);
    });

    it('rejects pm2 subcommands outside the allowlist', async () => {
      const result = await runBash('pm2 restart rooivalk');
      expect(result.ok).toBe(false);
    });

    it('rejects pm2 logs for a different process', async () => {
      const result = await runBash('pm2 logs other-process');
      expect(result.ok).toBe(false);
    });

    it('allows all listed file commands', async () => {
      stubExec('output');
      for (const cmd of ['ls', 'cat', 'grep', 'find', 'head', 'tail', 'wc']) {
        vi.clearAllMocks();
        stubExec('output');
        const result = await runBash(`${cmd} src/`);
        expect(result.ok, `expected ${cmd} to be allowed`).toBe(true);
      }
    });

    it('allows pm2 status', async () => {
      stubExec('status output');
      const result = await runBash('pm2 status');
      expect(result.ok).toBe(true);
    });

    it('allows pm2 show rooivalk', async () => {
      stubExec('show output');
      const result = await runBash('pm2 show rooivalk');
      expect(result.ok).toBe(true);
    });

    it('allows pm2 logs rooivalk with extra flags', async () => {
      stubExec('log lines');
      const result = await runBash('pm2 logs rooivalk --lines 50');
      expect(result.ok).toBe(true);
    });
  });

  describe('path sandboxing', () => {
    it('rejects absolute paths in file commands', async () => {
      const result = await runBash('cat /etc/passwd');
      expect(result.ok).toBe(false);
      expect(mockExec).not.toHaveBeenCalled();
    });

    it('rejects directory traversal in file commands', async () => {
      const result = await runBash('cat ../../secrets');
      expect(result.ok).toBe(false);
    });

    it('allows flags alongside relative paths', async () => {
      stubExec('match');
      const result = await runBash('grep -r TOOL_NAMES src/');
      expect(result.ok).toBe(true);
    });
  });

  describe('pm2 logs --nostream handling', () => {
    it('appends --nostream when absent', async () => {
      stubExec('log lines');
      await runBash('pm2 logs rooivalk --lines 50');
      const [calledCmd] = mockExec.mock.calls[0] as [string];
      expect(calledCmd).toContain('--nostream');
    });

    it('does not duplicate --nostream when already present', async () => {
      stubExec('log lines');
      await runBash('pm2 logs rooivalk --nostream --lines 50');
      const [calledCmd] = mockExec.mock.calls[0] as [string];
      expect(calledCmd.split('--nostream').length - 1).toBe(1);
    });
  });

  describe('output handling', () => {
    it('returns stdout on success', async () => {
      stubExec('hello world');
      const result = await runBash('ls src/');
      expect(result).toEqual({ ok: true, output: 'hello world' });
    });

    it('falls back to stderr when stdout is empty', async () => {
      stubExec('', 'some warning');
      const result = await runBash('ls src/');
      expect(result).toEqual({ ok: true, output: 'some warning' });
    });

    it('returns (no output) when both stdout and stderr are empty', async () => {
      stubExec('', '');
      const result = await runBash('ls src/');
      expect(result).toEqual({ ok: true, output: '(no output)' });
    });

    it('returns ok: false when exec errors', async () => {
      mockExec.mockImplementation(
        (_cmd: string, _opts: unknown, cb: (err: Error) => void) =>
          cb(new Error('command failed')),
      );
      const result = await runBash('ls src/');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('command failed');
      }
    });
  });
});
