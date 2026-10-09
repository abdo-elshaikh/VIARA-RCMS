const paymentIntegrity = ({ first, replay, before, after, amount }) => {
    const id = first?.payment?.payment_id;
    const paidBefore = Number(before?.paid_amount), paidAfter = Number(after?.paid_amount);
    const previous = before?.payments, current = after?.payments;
    return Boolean(id && replay?.payment?.payment_id === id && Array.isArray(previous) && Array.isArray(current)
        && current.filter(payment => payment.payment_id === id).length === 1
        && !previous.some(payment => payment.payment_id === id)
        && current.length === previous.length + 1
        && Number.isFinite(paidBefore) && Number.isFinite(paidAfter)
        && Math.abs(paidAfter - paidBefore - amount) < 0.005);
};
module.exports = { paymentIntegrity };
