module.exports = {
  apps: [{
    name: "linkmanage-history",
    script: "./src/index.js",
    env: {
      PORT: 3456
    },
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    max_memory_restart: "128M"
  }]
};
