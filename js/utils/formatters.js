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

/**
 * Escapa caracteres HTML para interpolar texto de origen externo (p. ej. scraping)
 * de forma segura dentro de plantillas con innerHTML.
 */
export const escapeHtml = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * Calcula dinámicamente el nombre del próximo día hábil bancario según la fecha actual en VET (UTC-4).
 * Viernes, Sábado y Domingo -> 'Lunes'
 * Lunes -> 'Martes'
 * Martes -> 'Miércoles'
 * Miércoles -> 'Jueves'
 * Jueves -> 'Viernes'
 */
export const getNextBusinessDayName = (rates) => {
  if (rates && typeof rates === 'object') {
    const rateObj = rates.bcv || rates.euro || Object.values(rates).find(r => r && r.nextDay && r.nextDay.published);
    if (rateObj?.nextDay?.date) {
      const rawDate = rateObj.nextDay.date.toLowerCase();
      if (rawDate.includes('lunes')) return 'Lunes';
      if (rawDate.includes('martes')) return 'Martes';
      if (rawDate.includes('miércoles') || rawDate.includes('miercoles')) return 'Miércoles';
      if (rawDate.includes('jueves')) return 'Jueves';
      if (rawDate.includes('viernes')) return 'Viernes';
    }
  }

  const now = new Date();
  const vetOffsetMs = -4 * 60 * 60 * 1000;
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const vetDate = new Date(utcMs + vetOffsetMs);
  const day = vetDate.getDay();

  const daysMap = {
    0: 'Lunes',     // Domingo -> Lunes
    1: 'Martes',    // Lunes -> Martes
    2: 'Miércoles', // Martes -> Miércoles
    3: 'Jueves',    // Miércoles -> Jueves
    4: 'Viernes',   // Jueves -> Viernes
    5: 'Lunes',     // Viernes -> Lunes
    6: 'Lunes'      // Sábado -> Lunes
  };

  return daysMap[day] || 'Lunes';
};

