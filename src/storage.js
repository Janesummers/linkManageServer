const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const config = require("./config");

// ============================================================
// JSON 文件持久化（原子写入）
// ============================================================

function ensureDataDir() {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
}

function getHistoryPath() {
  ensureDataDir();
  return path.join(config.dataDir, config.historyFile);
}

/** 读取全部记录 */
function loadRecords() {
  const filePath = getHistoryPath();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const records = JSON.parse(raw);
    return Array.isArray(records) ? records : [];
  } catch (e) {
    console.error("[Storage] 读取历史文件失败:", e.message);
    return [];
  }
}

/** 原子写入：先写临时文件，再 rename */
function saveRecords(records) {
  const filePath = getHistoryPath();
  const tmpPath = filePath + ".tmp";
  ensureDataDir();
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(records), "utf-8");
    fs.renameSync(tmpPath, filePath);
  } catch (e) {
    console.error("[Storage] 写入历史文件失败:", e.message);
    // 清理临时文件
    try { fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
    throw e;
  }
}

// ============================================================
// 容量管理（与扩展 trimHistoryBySize 逻辑一致）
// ============================================================

function trimHistoryBySize(records) {
  var jsonSize = Buffer.byteLength(JSON.stringify(records), "utf-8");
  if (jsonSize <= config.maxBytes) {
    return records;
  }

  // 按状态分组
  var successList = [];
  var submittedList = [];
  var keepList = [];
  records.forEach(function (r) {
    if (r.status === 2) {
      successList.push(r);
    } else if (r.status === 0) {
      submittedList.push(r);
    } else {
      keepList.push(r);
    }
  });

  // 按 createdAt 升序（旧的在前）
  successList.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
  submittedList.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });

  // 优先裁剪成功的
  var result = successList.concat(submittedList).concat(keepList);
  if (Buffer.byteLength(JSON.stringify(result), "utf-8") > config.trimBytes && successList.length > 0) {
    var kept = [];
    var remaining = successList.slice();
    while (remaining.length > 0 && Buffer.byteLength(JSON.stringify(kept.concat(remaining.slice(1)).concat(submittedList).concat(keepList)), "utf-8") > config.trimBytes) {
      remaining = remaining.slice(1);
    }
    kept = remaining;
    result = kept.concat(submittedList).concat(keepList);
    if (Buffer.byteLength(JSON.stringify(result), "utf-8") <= config.trimBytes) {
      return result;
    }
  }

  // 还不够就删已提交的（保留最新的）
  if (submittedList.length > 0) {
    result = result.filter(function (r) { return r.status !== 0; });
    var sortedSubmitted = submittedList.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var base = result;
    var added = [];
    for (var i = 0; i < sortedSubmitted.length; i++) {
      var testArr = added.concat([sortedSubmitted[i]]);
      if (Buffer.byteLength(JSON.stringify(base.concat(testArr)), "utf-8") <= config.trimBytes) {
        added.push(sortedSubmitted[i]);
      } else {
        break;
      }
    }
    result = base.concat(added);
    if (Buffer.byteLength(JSON.stringify(result), "utf-8") <= config.trimBytes) {
      return result;
    }
  }

  // 最终兜底：只保留 keepList 最新 500 条
  return keepList.slice(-500);
}

// ============================================================
// CRUD 操作
// ============================================================

/** 新增一条记录（插到最前面），自动裁剪 */
function addRecord(data) {
  var records = loadRecords();
  var record = {
    id: data.id || uuidv4(),
    infoHash: data.infoHash || "",
    magnetUrl: data.magnetUrl || "",
    sourceUrl: data.sourceUrl || "",
    libraryName: data.libraryName || "",
    status: typeof data.status === "number" ? data.status : 0,
    createdAt: data.createdAt || Date.now(),
    updatedAt: data.updatedAt || Date.now(),
    errorMessage: data.errorMessage || ""
  };
  records.unshift(record);
  saveRecords(trimHistoryBySize(records));
  return record;
}

/** 更新记录的部分字段 */
function updateRecord(id, fields) {
  var records = loadRecords();
  var found = null;
  for (var i = 0; i < records.length; i++) {
    if (records[i].id === id) {
      if (fields.hasOwnProperty("status")) {
        records[i].status = fields.status;
      }
      if (fields.hasOwnProperty("errorMessage")) {
        records[i].errorMessage = fields.errorMessage;
      }
      records[i].updatedAt = Date.now();
      found = records[i];
      break;
    }
  }
  if (!found) {
    return null;
  }
  saveRecords(trimHistoryBySize(records));
  return found;
}

/** 删除一条记录 */
function deleteRecord(id) {
  var records = loadRecords();
  var filtered = records.filter(function (r) { return r.id !== id; });
  if (filtered.length === records.length) {
    return false;
  }
  saveRecords(filtered);
  return true;
}

/** 同步合并：id 相同以客户端为准，客户端有而服务端没有的追加 */
function syncRecords(clientRecords) {
  var serverRecords = loadRecords();
  var serverMap = {};
  serverRecords.forEach(function (r) { serverMap[r.id] = r; });

  var added = 0;
  var updated = 0;

  clientRecords.forEach(function (cr) {
    if (!cr || !cr.id) return;
    if (serverMap[cr.id]) {
      // 已存在：合并 status/errorMessage/updatedAt
      var sr = serverMap[cr.id];
      if (cr.status !== undefined) sr.status = cr.status;
      if (cr.errorMessage !== undefined) sr.errorMessage = cr.errorMessage;
      if (cr.updatedAt) sr.updatedAt = cr.updatedAt;
      // 不覆盖 createdAt、infoHash 等核心字段
      updated++;
    } else {
      // 新记录：追加到最前面
      serverRecords.unshift({
        id: cr.id,
        infoHash: cr.infoHash || "",
        magnetUrl: cr.magnetUrl || "",
        sourceUrl: cr.sourceUrl || "",
        libraryName: cr.libraryName || "",
        status: typeof cr.status === "number" ? cr.status : 0,
        createdAt: cr.createdAt || Date.now(),
        updatedAt: cr.updatedAt || Date.now(),
        errorMessage: cr.errorMessage || ""
      });
      added++;
    }
  });

  serverRecords = trimHistoryBySize(serverRecords);
  saveRecords(serverRecords);
  return { records: serverRecords, added: added, updated: updated };
}

// 获取记录总数
function getRecordCount() {
  return loadRecords().length;
}

module.exports = {
  loadRecords: loadRecords,
  saveRecords: saveRecords,
  addRecord: addRecord,
  updateRecord: updateRecord,
  deleteRecord: deleteRecord,
  syncRecords: syncRecords,
  getRecordCount: getRecordCount,
  trimHistoryBySize: trimHistoryBySize
};
