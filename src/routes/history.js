const express = require("express");
const router = express.Router();
const storage = require("../storage");

// GET /api/history
router.get("/history", function (req, res) {
  try {
    var records = storage.loadRecords();
    res.json({ ok: true, records: records, deletedIds: storage.loadDeletedIds() });
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
    // 只透传请求中明确提供的字段，避免把未传字段更新成 undefined。
    var fields = {};
    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      fields.status = body.status;
    }
    if (Object.prototype.hasOwnProperty.call(body, "errorMessage")) {
      fields.errorMessage = body.errorMessage;
    }
    if (Object.prototype.hasOwnProperty.call(body, "staleNotifiedAt")) {
      fields.staleNotifiedAt = body.staleNotifiedAt;
    }
    var record = storage.updateRecord(id, fields);
    if (!record) {
      return res.status(404).json({ ok: false, error: "记录不存在" });
    }
    res.json({ ok: true, record: record });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/history/batch-delete
router.post("/history/batch-delete", function (req, res) {
  try {
    var body = req.body || {};
    var ids = Array.isArray(body.ids) ? body.ids.filter(Boolean).map(String) : [];
    if (ids.length === 0) {
      return res.status(400).json({ ok: false, error: "ids 至少需要一个记录 ID" });
    }
    var deleted = storage.deleteRecords(ids);
    res.json({ ok: true, deleted: deleted });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/history/mark-stale-notified
router.post("/history/mark-stale-notified", function (req, res) {
  try {
    var body = req.body || {};
    var ids = Array.isArray(body.ids) ? body.ids.filter(Boolean).map(String) : [];
    if (ids.length === 0) {
      return res.status(400).json({ ok: false, error: "ids 至少需要一个记录 ID" });
    }
    var result = storage.markStaleNotified(ids, body.notifiedAt);
    res.json({
      ok: true,
      updated: result.updated,
      notifiedAt: result.notifiedAt
    });
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
