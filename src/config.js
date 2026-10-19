const path = require("path");

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3456,
  dataDir: process.env.DATA_DIR || path.join(__dirname, "..", "data"),
  historyFile: "push-history.json",
  version: "1.0.0",
  // 容量限制（与扩展保持一致）
  maxBytes: 4 * 1024 * 1024,
  trimBytes: 3 * 1024 * 1024
};
