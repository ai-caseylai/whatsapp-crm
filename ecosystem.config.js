module.exports = {
  apps: [
    {
      name: 'whatsapp-bot',
      script: './server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Auto-restart configuration
      min_uptime: '10s',          // Consider app online if it stays up for 10s
      max_restarts: 10,           // Max restarts within 1 minute before stopping
      restart_delay: 4000,        // 4 second delay between restarts
      
      // Cron restart (optional - restart every day at 3 AM)
      cron_restart: '0 3 * * *',
      
      // Advanced features
      exp_backoff_restart_delay: 100,  // Exponential backoff for restarts
      
      // Kill timeout
      kill_timeout: 5000,
      
      // Listen for ready signal
      wait_ready: true,
      listen_timeout: 10000
    },
    {
      name: 'whatsapp-webhook',
      script: './webhook-server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'whatsapp-admin',
      script: './admin-server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
