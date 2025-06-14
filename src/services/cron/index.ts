import nodeCron, { type ScheduledTask } from 'node-cron';
import type Rooivalk from '@/services/rooivalk';

export const DEFAULT_CRON = '0 8 * * *';

class Cron {
  #tasks: ScheduledTask[] = [];
  #rooivalk: Rooivalk;

  constructor(rooivalk: Rooivalk) {
    this.#rooivalk = rooivalk;
  }

  public schedule(expression: string, task: () => void): void {
    const job = nodeCron.schedule(expression, task);
    this.#tasks.push(job);
  }
}

export default Cron;
