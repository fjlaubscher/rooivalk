import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// fs.watch is captured so tests can drive its change callback directly, and
// existsSync is forced true so the watcher arms instead of bailing early.
const { existsSync, watch } = vi.hoisted(() => ({
  existsSync: vi.fn(() => true),
  watch: vi.fn(),
}));
vi.mock('fs', () => ({ existsSync, watch }));

import { watchConfigs } from './watcher.ts';

type WatchListener = (event: string, filename: string | null) => void;

let watchListener: WatchListener;

beforeEach(() => {
  vi.useFakeTimers();
  existsSync.mockReturnValue(true);
  watch.mockImplementation((_dir: string, listener: WatchListener) => {
    watchListener = listener;
    return { close: vi.fn() };
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Emit a change and let the 200ms debounce elapse.
const change = (filename: string | null): void => {
  watchListener('change', filename);
  vi.advanceTimersByTime(200);
};

describe('watchConfigs', () => {
  it('does not arm the watcher when the config directory is missing', () => {
    existsSync.mockReturnValue(false);
    const onReload = vi.fn();

    watchConfigs(onReload);

    expect(watch).not.toHaveBeenCalled();
  });

  it('reloads on a top-level .md change', () => {
    const onReload = vi.fn();
    watchConfigs(onReload);

    change('permission_denied.md');

    expect(onReload).toHaveBeenCalledWith('permission_denied.md');
  });

  it('reloads on a tool-roles.json change', () => {
    const onReload = vi.fn();
    watchConfigs(onReload);

    change('tool-roles.json');

    expect(onReload).toHaveBeenCalledWith('tool-roles.json');
  });

  it('ignores profiles.json (services are built once at construction)', () => {
    const onReload = vi.fn();
    watchConfigs(onReload);

    change('profiles.json');

    expect(onReload).not.toHaveBeenCalled();
  });

  it('ignores unrelated files', () => {
    const onReload = vi.fn();
    watchConfigs(onReload);

    change('notes.txt');
    change(null);

    expect(onReload).not.toHaveBeenCalled();
  });

  it('debounces rapid changes into a single reload for the last file', () => {
    const onReload = vi.fn();
    watchConfigs(onReload);

    watchListener('change', 'errors.md');
    watchListener('change', 'tool-roles.json');
    vi.advanceTimersByTime(200);

    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onReload).toHaveBeenCalledWith('tool-roles.json');
  });
});
