const express = require("express");
const config = require("./config");
const healthRouter = require("./routes/health");
const historyRouter = require("./routes/history");
const errorHandler = require("./middleware/error-handler");

const app = express();

// 解析 JSON 请求体，限制 5MB
app.use(express.json({ limit: "5mb" }));

// CORS —— 允许扩展从任意来源访问
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// 路由挂载
app.use("/", healthRouter);
app.use("/api", historyRouter);

// 全局错误处理
app.use(errorHandler);

app.listen(config.port, function () {
  console.log("[HistoryServer] LinkManage 推送历史服务已启动，端口 " + config.port);
});
