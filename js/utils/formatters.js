/**
 * Formateadores de moneda y tiempo para Dolarfy
 */

export const formatCurrency = (amount, currency = 'USD', decimals = 2) => {
  const parsed = parseFloat(amount);
  if (isNaN(parsed)) return '0.00';

  const symbols = {
    USD: '$',
    VES: 'Bs.',
    COP: '$',
    ARS: '$',
    MXN: '$',
    CLP: '$',
    PEN: 'S/',
    BRL: 'R$',
    DOP: 'RD$',
    EUR: '€',
    USDT: '₮',
    GBP: '£'
  };

  const symbol = symbols[currency] || '$';

  // Si el valor es menor a 10 (ej. Pen 3.75, BRL 5.52, EUR/USD 1.088), ajustamos decimales dinámicamente si no viene forzado
  const finalDecimals = (parsed < 10 && parsed > 0 && decimals === 2) ? (parsed < 2 ? 3 : 2) : decimals;

  const formatted = parsed.toLocaleString('es-VE', {
    minimumFractionDigits: finalDecimals,
    maximumFractionDigits: finalDecimals
  });

  return `${symbol} ${formatted}`.trim();
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
