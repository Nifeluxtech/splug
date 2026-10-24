// SPLUG — shared response helpers for all API routes.

function handler(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req, res);
      if (result) res.status(result.status || 200).json(result.body);
    } catch (e) {
      let message = e?.message || 'Server error';
      if (message.includes('INSUFFICIENT_BALANCE')) {
        message = 'Insufficient wallet balance — please fund your wallet';
      }
      const status = e?.status || (message.startsWith('Insufficient') ? 400 : 500);
      res.status(status).json({ success: false, message });
    }
  };
}

const ok = (data) => ({ status: 200, body: { success: true, data } });

module.exports = { handler, ok };
