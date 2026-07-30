module.exports = {
  apps: [
    {
      name: 'blessing-power-guide',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --hostname 0.0.0.0 --port 3000',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '1200M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        LAUNCH_SCALE: 'peak',
        APP_REPLICA_COUNT: 2,
        DB_POOL_MAX: 5,
      },
    },
  ],
};
