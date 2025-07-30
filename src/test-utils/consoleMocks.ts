import { vi } from 'vitest';

export interface ConsoleMockOptions {
  ignoreErrors?: string[];
  ignoreLogs?: string[];
}

export function silenceConsole(options: ConsoleMockOptions = {}) {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (
      options.ignoreErrors?.some(
        (msg) => typeof args[0] === 'string' && args[0].includes(msg)
      )
    ) {
      return;
    }
    console.error(...args);
  });

  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    if (
      options.ignoreLogs?.some(
        (msg) => typeof args[0] === 'string' && args[0].includes(msg)
      )
    ) {
      return;
    }
  });

  return function restoreConsole() {
    errorSpy.mockRestore();
    logSpy.mockRestore();
  };
}
