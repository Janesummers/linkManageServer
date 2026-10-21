const express = require("express");
const router = express.Router();
const storage = require("../storage");

/** 从来源地址提取与扩展页面一致的站点名称。 */
function getSourceHost(record) {
  var sourceUrl = String((record && record.sourceUrl) || "").trim();
  if (!sourceUrl) return "未知来源";
  try {
    return new URL(sourceUrl).hostname || "未知来源";
  } catch (e) {
    return sourceUrl;
  }
}

/** 按页面传入的组合条件筛选历史记录。 */
function filterRecords(records, query, includeStatus) {
  var keyword = String(query.keyword || "").trim().toLowerCase();
  var library = String(query.library || "all");
  var source = String(query.source || "all");
  var createdAfter = Math.max(0, Number(query.createdAfter) || 0);
  var staleBefore = Math.max(0, Number(query.staleBefore) || 0);
  var status = String(query.status || "all");

  return records.filter(function (record) {
    if (!record) return false;
    if (includeStatus && status !== "all" && record.status !== Number(status)) return false;
    if (library !== "all" && String(record.libraryName || "") !== library) return false;
    if (source !== "all" && getSourceHost(record) !== source) return false;
    if (createdAfter > 0 && Number(record.createdAt || 0) < createdAfter) return false;
    if (query.staleOnly === "true") {
      var updatedAt = Number(record.updatedAt || record.createdAt || 0);
      if ((record.status !== 0 && record.status !== 1) || !updatedAt || updatedAt >= staleBefore) {
        return false;
      }
    }
    if (!keyword) return true;
    var searchableText = [
      record.magnetUrl,
      record.infoHash,
      record.sourceUrl,
      getSourceHost(record),
      record.libraryName,
      record.errorMessage
    ].map(function (value) {
      return String(value || "").toLowerCase();
    }).join(" ");
    return searchableText.indexOf(keyword) !== -1;
  });
}

// GET /api/history
router.get("/history", function (req, res) {
  try {
    var records = storage.loadRecords().sort(function (a, b) {
      var aTime = Number((a && (a.updatedAt || a.createdAt)) || 0);
      var bTime = Number((b && (b.updatedAt || b.createdAt)) || 0);
      return bTime - aTime;
    });
    var deletedIds = storage.loadDeletedIds();

    // 不带分页参数时保留原接口行为，供同步和导入逻辑继续获取完整数据。
    if (!req.query.page && !req.query.pageSize) {
      return res.json({ ok: true, records: records, deletedIds: deletedIds });
    }

    var pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    var baseRecords = filterRecords(records, req.query, false);
    var filteredRecords = filterRecords(baseRecords, req.query, true);
    var totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
    var page = Math.min(totalPages, Math.max(1, parseInt(req.query.page, 10) || 1));
    var start = (page - 1) * pageSize;
    var statusCounts = { all: baseRecords.length, "-1": 0, "0": 0, "1": 0, "2": 0 };
    baseRecords.forEach(function (record) {
      var key = String(record.status);
      if (Object.prototype.hasOwnProperty.call(statusCounts, key)) {
        statusCounts[key]++;
      }
    });

    res.json({
      ok: true,
      records: filteredRecords.slice(start, start + pageSize),
      deletedIds: deletedIds,
      pagination: {
        page: page,
        pageSize: pageSize,
        total: filteredRecords.length,
        totalPages: totalPages
      },
      totalRecords: records.length,
      statusCounts: statusCounts,
      filters: {
        libraries: Array.from(new Set(records.map(function (record) {
          return String(record.libraryName || "").trim();
        }).filter(Boolean))).sort(),
        sources: Array.from(new Set(records.map(getSourceHost))).sort()
      }
    });
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
