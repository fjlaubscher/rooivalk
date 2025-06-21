import nodeCron, { type ScheduledTask } from 'node-cron';
import type Rooivalk from '@/services/rooivalk';

export const DEFAULT_CRON = '0 8 * * *';

class Cron {
  _tasks: ScheduledTask[] = [];
  _rooivalk: Rooivalk;

  constructor(rooivalk: Rooivalk) {
    this._rooivalk = rooivalk;
  }

  public schedule(expression: string, task: () => void): void {
    const job = nodeCron.schedule(expression, task);
    this._tasks.push(job);
  }
  /**
   * Cancels a specific task by its index.
   * @param index - The index of the task to cancel.
   */
  public cancelTask(index: number): void {
    if (this._tasks[index]) {
      this._tasks[index].stop();
      this._tasks.splice(index, 1);
    } else {
      throw new Error('Invalid task index');
    }
  }

  /**
   * Cancels all scheduled tasks and clears the task list.
   */
  public cancelAllTasks(): void {
    for (const task of this._tasks) {
      task.stop();
    }
    this._tasks = [];
  }
}

export default Cron;
