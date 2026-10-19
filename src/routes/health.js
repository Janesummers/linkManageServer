const express = require("express");
const router = express.Router();
const config = require("../config");
const storage = require("../storage");

const startTime = Date.now();

// GET /health
router.get("/health", function (req, res) {
  res.json({
    ok: true,
    version: config.version,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    recordCount: storage.getRecordCount()
  });
});

module.exports = router;
