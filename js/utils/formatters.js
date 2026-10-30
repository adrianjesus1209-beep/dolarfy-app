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

export const parseSpanishDateToIso = (text) => {
  if (!text) return null;
  const months = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
  };
  const m = String(text).match(/(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/i);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = months[m[2].toLowerCase()];
  const year = m[3];
  return `${year}-${month}-${day}`;
};

export const isoToShortDate = (iso) => {
  if (!iso) return '';
  const parts = String(iso).slice(0, 10).split('-');
  if (parts.length !== 3) return String(iso);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

/**
 * Calcula dinámicamente el nombre del próximo día hábil bancario según la fecha actual en VET (UTC-4)
 * o la Fecha Valor publicada por el BCV.
 */
export const getNextBusinessDayName = (rates) => {
  if (rates && typeof rates === 'object') {
    const rateObj = rates.bcv || rates.euro || Object.values(rates).find(r => r && r.nextDay && r.nextDay.published);
    if (rateObj?.nextDay?._iso) {
      const parts = String(rateObj.nextDay._iso).slice(0, 10).split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        if (dayNames[d.getDay()]) return dayNames[d.getDay()];
      }
    }
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

/**
 * Genera una clave única para la predicción publicada actual
 */
export const getPredictionKey = (rates) => {
  const bcvNext = rates?.bcv?.nextDay;
  if (!bcvNext || !bcvNext.published || !bcvNext.value) return null;
  return `pred_${bcvNext.date || ''}_${bcvNext.value}`;
};

/**
 * Verfica si el usuario ya vio/leyó el aviso rojo de la predicción actual
 */
export const isPredictionRead = (rates) => {
  const key = getPredictionKey(rates);
  if (!key) return true;
  try {
    const readKey = localStorage.getItem('dolarfy_prediction_read_key');
    return readKey === key;
  } catch {
    return false;
  }
};

/**
 * Marca la predicción actual como leída para ocultar el punto rojo y guardar el estado en caché
 */
export const markPredictionRead = (rates) => {
  const key = getPredictionKey(rates);
  if (key) {
    try {
      localStorage.setItem('dolarfy_prediction_read_key', key);
    } catch {}
  }
};


