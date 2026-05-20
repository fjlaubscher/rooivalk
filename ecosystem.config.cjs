module.exports = {
  apps: [
    {
      name: 'rooivalk',
      script: 'pnpm',
      args: 'start',
      autorestart: true,
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      merge_logs: true,
      time: true,
    },
  ],
};
