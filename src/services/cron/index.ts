import cron from 'node-cron';
import type Rooivalk from '@/services/rooivalk';

const DEFAULT_CRON = '0 8 * * *';

const initCronTasks = (rooivalk: Rooivalk) => {
  const cronExpr = process.env.ROOIVALK_MOTD_CRON || DEFAULT_CRON;
  // greeting with MOTD
  cron.schedule(cronExpr, () => rooivalk.sendMotdToStartupChannel());
};

export default initCronTasks;
