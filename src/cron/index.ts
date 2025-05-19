import cron from 'node-cron';
import type Rooivalk from '@/services/rooivalk';

import { GREET_PROMPT } from './constants';

const initCronTasks = (rooivalk: Rooivalk) => {
  // greeting with weather for the day
  cron.schedule('0 0 6 * *', () =>
    rooivalk.sendMessageToStartupChannel(GREET_PROMPT)
  );
};

export default initCronTasks;
