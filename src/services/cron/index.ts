import cron from 'node-cron';
import type Rooivalk from '@/services/rooivalk';

const MOTD_CRON = process.env.ROOIVALK_MOTD_CRON || '0 0 8 * *';

const initCronTasks = (rooivalk: Rooivalk) => {
  // greeting with MOTD
  cron.schedule(MOTD_CRON, () => rooivalk.sendMotdToStartupChannel());
};

export default initCronTasks;
