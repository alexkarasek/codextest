export function sendOk(res, data, status = 200) {
  res.status(status).json({ ok: true, data });
}

export function sendError(res, status, code, message, details) {
  res.status(status).json({
    ok: false,
    error: {
      code,
      message,
      details: details || null
    }
  });
}
