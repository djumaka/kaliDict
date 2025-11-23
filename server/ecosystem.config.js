module.exports = {
  apps: [
    {
      name: 'kalidict-server',
      script: './index.js',
      instances: 1,
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
