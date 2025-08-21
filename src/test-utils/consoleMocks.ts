import { vi } from 'vitest';

export interface ConsoleMockOptions {
  ignoreErrors?: string[];
  ignoreLogs?: string[];
}

export function silenceConsole(options: ConsoleMockOptions = {}) {
  const originalError = console.error;
  const originalLog = console.log;

  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (
      options.ignoreErrors?.some((msg) =>
        args.some(
          (arg) =>
            (typeof arg === 'string' && arg.includes(msg)) ||
            (arg instanceof Error && arg.message.includes(msg)),
        ),
      )
    ) {
      return;
    }

    originalError(...args);
  });

  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    if (
      options.ignoreLogs?.some((msg) =>
        args.some((arg) => typeof arg === 'string' && arg.includes(msg)),
      )
    ) {
      return;
    }

    originalLog(...args);
  });

  return function restoreConsole() {
    errorSpy.mockRestore();
    logSpy.mockRestore();
  };
}
