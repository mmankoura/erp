// PM2 Ecosystem Configuration for ERP Production
// Place at: C:\apps\erp\ecosystem.config.js
//
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 restart all
//   pm2 status
//
// See DEPLOYMENT_PLAN.md Section 12

module.exports = {
  apps: [
    {
      name: 'erp-backend',
      cwd: 'C:\\apps\\erp\\current\\backend',
      script: 'dist/main.js',
      node_args: '--max-old-space-size=512',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        HOST: '127.0.0.1',
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'C:\\apps\\erp\\logs\\backend-error.log',
      out_file: 'C:\\apps\\erp\\logs\\backend-out.log',
      merge_logs: true,
      max_memory_restart: '1G',
    },
    {
      name: 'erp-frontend',
      cwd: 'C:\\apps\\erp\\current\\frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000 -H 127.0.0.1',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'C:\\apps\\erp\\logs\\frontend-error.log',
      out_file: 'C:\\apps\\erp\\logs\\frontend-out.log',
      merge_logs: true,
      max_memory_restart: '1G',
    },
  ],
};
