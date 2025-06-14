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
  /**
   * Cancels a specific task by its index.
   * @param index - The index of the task to cancel.
   */
  public cancelTask(index: number): void {
    if (index >= 0 && index < this.#tasks.length) {
      this.#tasks[index].stop();
      this.#tasks.splice(index, 1);
    } else {
      throw new Error('Invalid task index');
    }
  }

  /**
   * Cancels all scheduled tasks and clears the task list.
   */
  public cancelAllTasks(): void {
    for (const task of this.#tasks) {
      task.stop();
    }
    this.#tasks = [];
  }
}

export default Cron;
