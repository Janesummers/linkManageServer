// 全局错误处理中间件，放在所有路由之后挂载
module.exports = function (err, req, res, next) {
  console.error("[HistoryServer]", err);
  if (err.type === "entity.too.large") {
    return res.status(413).json({ ok: false, error: "请求体过大" });
  }
  res.status(500).json({ ok: false, error: err.message || "内部服务错误" });
};
