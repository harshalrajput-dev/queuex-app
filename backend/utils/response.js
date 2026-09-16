module.exports = {
  ok: (res, data = null, message = "OK", status = 200) =>
    res.status(status).json({ success: true, message, data }),
  fail: (res, message = "Something went wrong", status = 500) =>
    res.status(status).json({ success: false, message })
};
