import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

import cron from 'node-cron';
import initCronTasks from '.';

describe('initCronTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schedules motd task with env expression', () => {
    process.env.ROOIVALK_MOTD_CRON = '*/5 * * * *';
    const rooivalk = { sendMotdToStartupChannel: vi.fn() } as any;

    initCronTasks(rooivalk);

    expect(cron.schedule).toHaveBeenCalledWith(
      '*/5 * * * *',
      expect.any(Function)
    );
  });

  it('defaults to 8am daily when env not set', () => {
    delete process.env.ROOIVALK_MOTD_CRON;
    const rooivalk = { sendMotdToStartupChannel: vi.fn() } as any;

    initCronTasks(rooivalk);

    expect(cron.schedule).toHaveBeenCalledWith(
      '0 8 * * *',
      expect.any(Function)
    );
  });
});
