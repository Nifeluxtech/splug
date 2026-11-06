// SPLUG — wallet funding helpers (limits and fee rate live in lib/settings.js, editable by admins).
const serviceFee = (amount, percent) => Math.ceil(Number(amount) * Number(percent) / 100);

// What the customer pays at checkout for a deposit row.
//   DPF-...-F<fee>  fee recorded in the reference (current format)
//   DPF-...         3% fee (first fee release)
//   DEP-...         no fee (before fees)
function checkoutTotal(txn) {
  const ref = String(txn.reference || '');
  const m = ref.match(/-F(\d+(?:\.\d+)?)$/);
  if (m) return Number(txn.amount) + Number(m[1]);
  if (ref.startsWith('DPF-')) return Number(txn.amount) + serviceFee(txn.amount, 3);
  return Number(txn.amount);
}

module.exports = { serviceFee, checkoutTotal };
