const express = require("express");
const router = express.Router();
const storage = require("../storage");

// GET /api/history
router.get("/history", function (req, res) {
  try {
    var records = storage.loadRecords();
    res.json({ ok: true, records: records });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/history
router.post("/history", function (req, res) {
  try {
    var body = req.body || {};
    if (!body.infoHash && !body.magnetUrl) {
      return res.status(400).json({ ok: false, error: "infoHash 或 magnetUrl 至少需要一个" });
    }
    var record = storage.addRecord(body);
    res.status(201).json({ ok: true, record: record });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PUT /api/history/:id
router.put("/history/:id", function (req, res) {
  try {
    var id = req.params.id;
    var body = req.body || {};
    var record = storage.updateRecord(id, {
      status: body.status,
      errorMessage: body.errorMessage
    });
    if (!record) {
      return res.status(404).json({ ok: false, error: "记录不存在" });
    }
    res.json({ ok: true, record: record });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE /api/history/:id
router.delete("/history/:id", function (req, res) {
  try {
    var id = req.params.id;
    var deleted = storage.deleteRecord(id);
    if (!deleted) {
      return res.status(404).json({ ok: false, error: "记录不存在" });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/history/sync
router.post("/history/sync", function (req, res) {
  try {
    var body = req.body || {};
    var clientRecords = Array.isArray(body.records) ? body.records : [];
    var result = storage.syncRecords(clientRecords);
    res.json({
      ok: true,
      records: result.records,
      added: result.added,
      updated: result.updated
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
