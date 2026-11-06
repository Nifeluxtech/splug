// SPLUG — shared response helpers for all API routes.

// Never show supplier or payment-partner names, or their raw error text, to users.
const SUPPLIER = /5\s*sim|five\s*sim|sms\s*pool|afrstar/i;
const NO_STOCK = /no (free )?(phones?|numbers?)|not available|no available|out of stock|no stock|unavailable/i;
const NO_NUMBER = 'No SPLUG number is available for this country and service right now. Try another country, or switch route.';

function publicMessage(e, message, status) {
  if (e?.upstream || SUPPLIER.test(message)) {
    if (NO_STOCK.test(message)) return NO_NUMBER;
    if (e?.payment) return 'SPLUG payments are temporarily unavailable. Please try again in a moment.';
    if (/rate limit|too many/i.test(message)) return 'SPLUG is busy right now. Please try again in a moment.';
    return 'SPLUG could not complete this right now. Please try again in a moment.';
  }
  if (status >= 500 && !e?.safe && !/^(Insufficient|Payments|Could not)/.test(message)) {
    return 'Something went wrong on SPLUG. Please try again in a moment.';
  }
  return message;
}

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
      const safe = publicMessage(e, message, status);
      if (safe !== message) console.error('[splug] upstream error hidden from user:', message);
      res.status(status).json({ success: false, message: safe });
    }
  };
}

const ok = (data) => ({ status: 200, body: { success: true, data } });

module.exports = { handler, ok, publicMessage, NO_NUMBER };
