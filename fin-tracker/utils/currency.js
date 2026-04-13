const ngnFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCurrency = (value) => {
  const number = Number(value || 0);
  return ngnFormatter.format(Number.isFinite(number) ? number : 0);
};
