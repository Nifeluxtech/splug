// SPLUG — wallet funding rules (shared by the API and the payment callback).
const MIN_DEPOSIT = 500;        // ₦, amount credited to the wallet
const FEE_RATE = 0.03;          // 3% service fee, paid on top at checkout

const serviceFee = (amount) => Math.ceil(Number(amount) * FEE_RATE);
// What the customer pays at checkout for a deposit row. Older DEP- rows had no fee.
const checkoutTotal = (txn) => Number(txn.amount) + (String(txn.reference || '').startsWith('DPF-') ? serviceFee(txn.amount) : 0);

module.exports = { MIN_DEPOSIT, FEE_RATE, serviceFee, checkoutTotal };
