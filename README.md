# LinkManage 推送历史服务

为 LinkManage Chrome 扩展提供跨浏览器推送历史同步的后端服务。

## 快速开始

```bash
# 安装依赖
npm install

# 直接启动（开发/调试）
npm start

# PM2 启动（生产环境推荐）
npm run pm2:start

# PM2 管理
npm run pm2:stop     # 停止
npm run pm2:restart  # 重启
npm run pm2:logs     # 查看日志
```

服务默认监听 `http://localhost:3456`，可通过环境变量 `PORT` 修改端口。

## 配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `PORT` | `3456` | 服务监听端口 |
| `DATA_DIR` | `./data` | 数据文件存储目录 |

PM2 配置见 `ecosystem.config.js`，默认内存限制 128M。

## API 文档

### GET /health

健康检查。

**响应 200：**
```json
{
  "ok": true,
  "version": "1.0.0",
  "uptime": 3600,
  "recordCount": 42
}
```

---

### GET /api/history

获取全部推送历史记录。

响应中的 `deletedIds` 用于阻止其他浏览器的旧本地镜像恢复已删除记录。

**响应 200：**
```json
{
  "ok": true,
  "deletedIds": [],
  "records": [
    {
      "id": "m5k2x1p3a",
      "infoHash": "btih:abc123...",
      "magnetUrl": "magnet:?xt=urn:btih:...",
      "sourceUrl": "https://example.com/page",
      "libraryName": "待审",
      "status": 2,
      "createdAt": 1716562800000,
      "updatedAt": 1716562900000,
      "errorMessage": "",
      "staleNotifiedAt": 0
    }
  ]
}
```

状态值：`-1` 失败，`0` 已提交，`1` 离线中，`2` 成功。

---

### POST /api/history

新增一条推送历史记录。

**请求体：**
```json
{
  "infoHash": "btih:abc123...",
  "magnetUrl": "magnet:?xt=urn:btih:...",
  "sourceUrl": "https://example.com/page",
  "libraryName": "待审",
  "status": 0,
  "errorMessage": ""
}
```

所有字段除 `infoHash`/`magnetUrl` 至少提供一个外，均为可选。可附带 `id`、`createdAt`、`updatedAt` 字段，缺失则由服务端生成。

**响应 201：**
```json
{
  "ok": true,
  "record": { "id": "m5k2x1p3a", ... }
}
```

---

### PUT /api/history/:id

更新记录的 `status` 和/或 `errorMessage`。

**请求体（均为可选）：**
```json
{
  "status": 2,
  "errorMessage": ""
}
```

**响应 200：** `{ "ok": true, "record": {...} }`
**响应 404：** `{ "ok": false, "error": "记录不存在" }`

---

### DELETE /api/history/:id

删除一条记录。

**响应 200：** `{ "ok": true }`
**响应 404：** `{ "ok": false, "error": "记录不存在" }`

---

### POST /api/history/batch-delete

批量删除历史记录，一次请求只写入一次数据文件。

**请求体：**
```json
{
  "ids": ["record-id-1", "record-id-2"]
}
```

**响应 200：** `{ "ok": true, "deleted": 2 }`

---

### POST /api/history/mark-stale-notified

批量标记异常任务已经提醒。已经标记的记录不会重复修改，用于跨浏览器保持“只提醒一次”。

**请求体：**
```json
{
  "ids": ["record-id-1", "record-id-2"],
  "notifiedAt": 1716563000000
}
```

`notifiedAt` 可选，缺失时使用服务端当前时间。

**响应 200：**
```json
{
  "ok": true,
  "updated": 2,
  "notifiedAt": 1716563000000
}
```

---

### POST /api/history/sync

批量同步记录。按 `id` 合并：id 相同以客户端字段为准，客户端新增的记录追加到服务端。

**请求体：**
```json
{
  "records": [ ... ]
}
```

**响应 200：**
```json
{
  "ok": true,
  "records": [ ... ],
  "added": 3,
  "updated": 5
}
```

## 数据存储

记录以 JSON 文件存储在 `data/push-history.json`。容量限制与扩展保持一致：最大 4MB，超过 3MB 时按优先级裁剪（成功 → 已提交 → 保留失败/离线中）。
已删除记录的 ID 存放在同目录的 `push-history-deleted.json`，用于跨浏览器同步删除结果。

## 在扩展中配置

1. 打开扩展设置页面
2. 找到"推送历史记录"设置项
3. 存储模式选择"远程服务器"
4. 填入服务器地址，如 `http://192.168.1.100:3456`
