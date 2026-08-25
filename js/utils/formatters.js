/**
 * Formateadores de moneda y tiempo para Dolarfy
 */

export const formatCurrency = (amount, currency = 'USD', decimals = 2) => {
  const parsed = parseFloat(amount);
  if (isNaN(parsed)) return '0.00';

  const symbols = {
    USD: '$',
    VES: 'Bs.',
    EUR: '€',
    USDT: '₮'
  };

  const formatted = parsed.toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

  return `${symbols[currency] || ''} ${formatted}`.trim();
};

export const formatPercentage = (value) => {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return '0.00%';
  const sign = parsed > 0 ? '+' : '';
  return `${sign}${parsed.toFixed(2)}%`;
};

export const formatTime = (date = new Date()) => {
  return date.toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
};
