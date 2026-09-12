/* Dolarfy Standalone Bundle */
(function() {
  "use strict";

  // --- js/constants.js ---
/**
 * Constantes globales de Dolarfy
 */

const APP_VERSION = '1.0.0';

// Clave de caché de tasas en localStorage.
const RATES_CACHE_VERSION = 'v1';
const RATES_CACHE_KEY_PREFIX = `dolarfy_rates_cache_${RATES_CACHE_VERSION}`;

  // --- js/utils/formatters.js ---
/**
 * Formateadores de moneda y tiempo para Dolarfy
 */

const formatCurrency = (amount, currency = 'USD', decimals = 2) => {
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

const formatPercentage = (value) => {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return '0.00%';
  const sign = parsed > 0 ? '+' : '';
  return `${sign}${parsed.toFixed(2)}%`;
};

const formatTime = (date = new Date()) => {
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
const escapeHtml = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};


  // --- js/utils/mathEval.js ---
/**
 * Evaluador matemático seguro para Dolarfy.
 * Reemplaza el uso de eval() y new Function() en la calculadora.
 * Soporta + - * /, paréntesis, y decimales con coma o punto.
 */

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const n = expr.length;

  while (i < n) {
    const ch = expr[i];

    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }

    if (ch === '(' || ch === ')' || ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    if (ch >= '0' && ch <= '9') {
      let j = i;
      let decimalSeen = false;
      while (j < n) {
        const c = expr[j];
        if (c >= '0' && c <= '9') {
          j++;
          continue;
        }
        if ((c === ',' || c === '.') && !decimalSeen && j + 1 < n && expr[j + 1] >= '0' && expr[j + 1] <= '9') {
          decimalSeen = true;
          j++;
          continue;
        }
        break;
      }
      const raw = expr.slice(i, j).replace(/,/g, '.');
      tokens.push({ type: 'num', value: parseFloat(raw) });
      i = j;
      continue;
    }

    throw new Error(`Carácter inesperado: ${ch}`);
  }

  return tokens;
}

function evaluateMath(expr) {
  if (typeof expr !== 'string' || expr.trim() === '') return NaN;

  const tokens = tokenize(expr);
  let pos = 0;

  const peek = () => tokens[pos] || null;
  const next = () => tokens[pos++];

  function parseUnary() {
    const t = peek();
    if (t && t.type === 'op' && (t.value === '-' || t.value === '+')) {
      next();
      const value = parseUnary();
      return t.value === '-' ? -value : value;
    }
    return parseNumber();
  }

  function parseNumber() {
    const t = next();
    if (!t) throw new Error('Operando esperado');
    if (t.type === 'num') return t.value;
    if (t.type === 'op' && t.value === '(') {
      const value = parseExpr();
      const close = next();
      if (!close || close.type !== 'op' || close.value !== ')') {
        throw new Error('Paréntesis sin cerrar');
      }
      return value;
    }
    throw new Error('Operando esperado');
  }

  function parseTerm() {
    let value = parseUnary();
    while (true) {
      const t = peek();
      if (t && t.type === 'op' && (t.value === '*' || t.value === '/')) {
        next();
        const rhs = parseUnary();
        if (t.value === '*') value *= rhs;
        else value /= rhs;
      } else {
        break;
      }
    }
    return value;
  }

  function parseExpr() {
    let value = parseTerm();
    while (true) {
      const t = peek();
      if (t && t.type === 'op' && (t.value === '+' || t.value === '-')) {
        next();
        const rhs = parseTerm();
        if (t.value === '+') value += rhs;
        else value -= rhs;
      } else {
        break;
      }
    }
    return value;
  }

  return parseExpr();
}

  // --- js/countriesData.js ---
/**
 * Catálogo de países y tasas financieras de Dolarfy
 * Los valores son placeholders de arranque; se sobreescriben con datos reales en runtime.
 */

const COUNTRIES_DATA = [
  {
    id: 'VE',
    name: 'Venezuela',
    flag: '🇻🇪',
    flagUrl: 'https://flagcdn.com/w40/ve.png',
    officialSchedule: '5:00 PM VET (Cierre BCV Oficial)',
    currency: { code: 'VES', symbol: 'Bs', name: 'Bolívar Digital' },
    defaultRateId: 'bcv',
    rates: {
      bcv: {
        id: 'bcv',
        name: 'Dólar Oficial (BCV)',
        code: 'USD/VES',
        value: null,
        change: 0,
        currency: 'VES',
        type: 'official',
        icon: 'building-2',
        nextDay: null
      },
      paralelo: {
        id: 'paralelo',
        name: 'USDT (Binance P2P)',
        code: 'USDT/VES',
        value: null,
        change: 0,
        currency: 'VES',
        type: 'crypto',
        icon: 'coins',
        nextDay: null
      },
      euro: {
        id: 'euro',
        name: 'Euro Oficial (BCV)',
        code: 'EUR/VES',
        value: null,
        change: 0,
        currency: 'VES',
        type: 'official',
        icon: 'euro',
        nextDay: null
      }
    }
  }
];


  // --- js/themeService.js ---
class ThemeService {
  constructor() {
    this.STORAGE_KEY = 'dolarfy_theme';
    this.currentTheme = 'dark';
    try {
      if (typeof localStorage !== 'undefined') {
        this.currentTheme = localStorage.getItem(this.STORAGE_KEY) || 'dark';
      }
    } catch (e) {
      console.warn('Error leyendo tema guardado:', e);
    }
  }

  init() {
    this.applyTheme(this.currentTheme);
  }

  getTheme() {
    return this.currentTheme;
  }

  setTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') return;
    this.currentTheme = theme;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.STORAGE_KEY, theme);
      }
    } catch (e) {
      console.warn('Error guardando tema:', e);
    }
    this.applyTheme(theme);
    
    document.dispatchEvent(new CustomEvent('dolarfy:theme_changed', {
      detail: { theme }
    }));
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
  }

  applyTheme(theme) {
    const htmlEl = document.documentElement;
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');

    if (theme === 'light') {
      htmlEl.classList.remove('dark');
      htmlEl.classList.add('light');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', '#F4F6F9');
      }
    } else {
      htmlEl.classList.remove('light');
      htmlEl.classList.add('dark');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', '#0B0E14');
      }
    }
  }
}

const themeService = new ThemeService();


  // --- js/calcHistoryService.js ---
/**
 * Servicio de Historial de Conversiones de la Calculadora
 */

class CalcHistoryService {
  constructor() {
    this.STORAGE_KEY = 'dolarfy_calc_history';
    this.history = this.loadHistory();
  }

  loadHistory() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('Error al cargar historial de calculadora', e);
      return [];
    }
  }

  saveHistory() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.history.slice(0, 20)));
    } catch (e) {
      console.warn('Error al guardar historial de calculadora', e);
    }
  }

  addEntry(entry) {
    // Evitar duplicados inmediatos idénticos
    if (this.history.length > 0) {
      const last = this.history[0];
      if (last.expression === entry.expression && last.rateId === entry.rateId && last.countryId === entry.countryId) {
        return;
      }
    }

    const newEntry = {
      id: Date.now(),
      expression: entry.expression,
      resultText: entry.resultText,
      countryId: entry.countryId,
      countryName: entry.countryName,
      flagUrl: entry.flagUrl,
      rateName: entry.rateName,
      rateId: entry.rateId,
      rateValue: entry.rateValue,
      fromCurrency: entry.fromCurrency,
      toCurrency: entry.toCurrency,
      timestamp: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true })
    };

    this.history.unshift(newEntry);
    this.saveHistory();
  }

  getHistory() {
    return this.history;
  }

  clearHistory() {
    this.history = [];
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

const calcHistoryService = new CalcHistoryService();


  // --- js/apiService.js ---
/**
 * Servicio de tasas de cambio reales para Dolarfy
 * Fuente primaria: open.er-api.com (USD/VES y EUR/VES exactos del BCV)
 * Fuente secundaria: ve.dolarapi.com (Dólar Paralelo en tiempo real)
 */



const REQUEST_TIMEOUT_MS = 10000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = { 'Accept': 'application/json, text/html, */*', ...(options.headers || {}) };

  try {
    return await fetch(url, { ...options, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

class ApiService {
  constructor() {
    this.CACHE_TTL_MS = 15 * 1000;           // 15 segundos — polling en vivo
    this.STALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días máximo stale
  }

  _fetch(url, options = {}) {
    return fetchWithTimeout(url, options);
  }

  _decorate(rates, source = 'live', extra = {}) {
    rates._meta = { source, fetchedAt: extra.fetchedAt || Date.now(), ...extra };
    return rates;
  }

  async fetchRatesForCountry(country, force = false) {
    const cacheKey = `${RATES_CACHE_KEY_PREFIX}_${country.id}`;

    if (!force) {
      const cached = this.getCache(cacheKey);
      if (cached) {
        this.fetchFreshRates(country, cacheKey).catch(e => console.warn('BG update error:', e));
        return cached;
      }

      const stale = this.getCacheStale(cacheKey);
      if (stale) {
        this.fetchFreshRates(country, cacheKey).catch(e => console.warn('BG stale update error:', e));
        return stale;
      }
    }

    return await this.fetchFreshRates(country, cacheKey);
  }

  async fetchFreshRates(country, cacheKey) {
    try {
      return await this.fetchVenezuelaRates(country, cacheKey);
    } catch (error) {
      console.warn(`Error al consultar API para ${country.name}:`, error);
      const rates = JSON.parse(JSON.stringify(country.rates));
      return this._decorate(rates, 'offline', { error: true });
    }
  }

  async fetchVenezuelaRates(country, cacheKey) {
    const rates = JSON.parse(JSON.stringify(country.rates));
    const fetched = {};

    // Guardar valores previos para calcular variación real
    const prevValues = {};
    Object.keys(rates).forEach(key => {
      const r = rates[key];
      if (r && typeof r.value === 'number' && !isNaN(r.value)) {
        prevValues[key] = r.value;
      }
    });

    // 1. FUENTE USDT/VES EN TIEMPO REAL: Binance P2P C2C Directo
    try {
      const resBinance = await this._fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fiat: 'VES', page: 1, rows: 5, tradeType: 'BUY', asset: 'USDT', countries: [], payTypes: []
        })
      });
      if (resBinance.ok) {
        const data = await resBinance.json();
        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
          const prices = data.data.map(i => parseFloat(i.adv.price)).filter(p => !isNaN(p) && p > 0);
          if (prices.length > 0) {
            rates.paralelo.value = parseFloat((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2));
            fetched.binanceP2p = true;
          }
        }
      }
    } catch (e) {
      console.warn('Error al consultar Binance P2P API:', e);
    }

    // 2. FUENTE OFICIAL DE HOY Y PARALELO (FALLBACK): ve.dolarapi.com
    //    Proporciona la tasa oficial vigente para el día de HOY y el respaldo para USDT/VES.
    try {
      const resUsd = await this._fetch('https://ve.dolarapi.com/v1/dolares');
      if (resUsd.ok) {
        const data = await resUsd.json();
        if (Array.isArray(data)) {
          const bcvItem = data.find(d => d.fuente === 'oficial' || d.casa === 'oficial');
          if (bcvItem?.promedio) {
            rates.bcv.value = parseFloat(bcvItem.promedio.toFixed(2));
          }
          if (!fetched.binanceP2p) {
            const paraleloItem = data.find(d => d.fuente === 'paralelo' || d.casa === 'paralelo');
            if (paraleloItem?.promedio) {
              rates.paralelo.value = parseFloat(paraleloItem.promedio.toFixed(2));
            }
          }
          fetched.dolarapi = true;
        }
      }
    } catch (e) {
      console.warn('Error al consultar DolarApi dolares:', e);
    }

    try {
      const resEur = await this._fetch('https://ve.dolarapi.com/v1/euros');
      if (resEur.ok) {
        const data = await resEur.json();
        if (Array.isArray(data)) {
          const item = data.find(d => d.fuente === 'oficial' || d.casa === 'oficial' || d.moneda === 'EUR');
          if (item?.promedio) {
            rates.euro.value = parseFloat(item.promedio.toFixed(2));
            fetched.dolarapiEuro = true;
          }
        }
      }
    } catch (e) {
      console.warn('Error al consultar DolarApi euros:', e);
    }

    // 2. PRONÓSTICO DÍA SIGUIENTE (LUNES / PRÓXIMO DÍA HÁBIL): open.er-api.com
    //    Si open.er-api difiere de la tasa de Hoy, es la tasa oficial recién publicada por el BCV para la Fecha Valor del próximo día hábil.
    try {
      const [resUsd, resEur] = await Promise.all([
        this._fetch('https://open.er-api.com/v6/latest/USD'),
        this._fetch('https://open.er-api.com/v6/latest/EUR')
      ]);

      if (resUsd.ok) {
        const data = await resUsd.json();
        if (data?.rates?.VES) {
          const openErUsd = parseFloat(data.rates.VES.toFixed(2));
          fetched.openErUsd = true;

          if (!rates.bcv.value) {
            rates.bcv.value = openErUsd;
          } else if (Math.abs(openErUsd - rates.bcv.value) >= 0.01) {
            // Tasa para el próximo día hábil (Lunes en fin de semana)
            const changeUsd = parseFloat((((openErUsd - rates.bcv.value) / rates.bcv.value) * 100).toFixed(2));
            rates.bcv.nextDay = {
              published: true, isOfficial: true, value: openErUsd, change: changeUsd,
              date: 'Fecha Valor BCV (Lunes)', scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
            };
          }
        }
      }

      if (resEur.ok) {
        const data = await resEur.json();
        if (data?.rates?.VES) {
          const openErEur = parseFloat(data.rates.VES.toFixed(2));
          fetched.openErEur = true;

          if (!rates.euro.value) {
            rates.euro.value = openErEur;
          } else if (Math.abs(openErEur - rates.euro.value) >= 0.01) {
            const changeEur = parseFloat((((openErEur - rates.euro.value) / rates.euro.value) * 100).toFixed(2));
            rates.euro.nextDay = {
              published: true, isOfficial: true, value: openErEur, change: changeEur,
              date: 'Fecha Valor BCV (Lunes)', scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
            };
          }
        }
      }
    } catch (e) {
      console.warn('Error al consultar open.er-api.com:', e);
    }

    // 3. Pronóstico oficial BCV por scraping o proxy si responde
    try {
      const bcvData = await this.fetchBcvOfficialSite();
      if (bcvData?.usd) {
        this.processBcvRates(rates, bcvData);
        fetched.bcvSite = true;
      }
    } catch (e) {
      console.warn('Error al consultar sitio oficial del BCV:', e);
    }

    // Calcular variación real vs valor previo conocido
    Object.keys(rates).forEach(key => {
      const r = rates[key];
      if (r && typeof r.value === 'number' && !isNaN(r.value) && r.value > 0) {
        const prev = prevValues[key];
        if (typeof prev === 'number' && prev > 0) {
          r.change = parseFloat((((r.value - prev) / prev) * 100).toFixed(2));
        }
      }
    });

    const hasLiveData = fetched.openErUsd || fetched.openErEur || fetched.dolarapi || fetched.dolarapiEuro || fetched.bcvSite;
    if (hasLiveData) this.setCache(cacheKey, rates);

    return this._decorate(rates, hasLiveData ? 'live' : 'offline', { sources: fetched });
  }

  processBcvRates(rates, bcvData) {
    if (!bcvData || typeof bcvData.usd !== 'number') return;

    const now = new Date();
    // Zona horaria VET: UTC-4
    const vetOffsetMs = -4 * 60 * 60 * 1000;
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const vetDate = new Date(utcMs + vetOffsetMs);
    const dayOfWeek = vetDate.getDay(); // 0 = Dom, 1 = Lun, 2 = Mar, 3 = Mié, 4 = Jue, 5 = Vie, 6 = Sáb

    const rawFecha = (bcvData.fecha || '').toLowerCase();

    // Identificar el día mencionado en Fecha Valor
    let targetDay = null;
    if (rawFecha.includes('lunes')) targetDay = 'lunes';
    else if (rawFecha.includes('martes')) targetDay = 'martes';
    else if (rawFecha.includes('miércoles') || rawFecha.includes('miercoles')) targetDay = 'miércoles';
    else if (rawFecha.includes('jueves')) targetDay = 'jueves';
    else if (rawFecha.includes('viernes')) targetDay = 'viernes';

    const bcvUsd = parseFloat(bcvData.usd.toFixed(2));
    const bcvEur = bcvData.eur ? parseFloat(bcvData.eur.toFixed(2)) : null;
    const cleanDate = bcvData.fecha
      ? bcvData.fecha.replace(/^Fecha\s+Valor\s*:?\s*/i, '').trim()
      : 'Oficial BCV';

    // Determinar si la tasa publicada por el BCV le corresponde a 'Hoy' o es el 'Pronóstico' para el siguiente día hábil
    const isWeekend = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0);

    let isNextDay = false;
    if (isWeekend) {
      // En Viernes, Sábado o Domingo, si la Fecha Valor es Lunes, es el PRONÓSTICO (nextDay)
      if (targetDay === 'lunes') {
        isNextDay = true;
      } else if (targetDay === 'viernes') {
        isNextDay = false;
      }
    } else {
      const dayMap = { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes' };
      const todayName = dayMap[dayOfWeek];
      const nextDayMap = { 1: 'martes', 2: 'miércoles', 3: 'jueves', 4: 'viernes' };
      const expectedNextName = nextDayMap[dayOfWeek];

      if (targetDay === expectedNextName) {
        isNextDay = true;
      } else if (targetDay === todayName) {
        isNextDay = false;
      }
    }

    if (isNextDay) {
      // Asignar al botón de Pronóstico (Día Siguiente / Lunes)
      const currentUsd = rates.bcv.value || bcvUsd;
      const changeUsd = currentUsd > 0 ? parseFloat((((bcvUsd - currentUsd) / currentUsd) * 100).toFixed(2)) : 0;
      rates.bcv.nextDay = {
        published: true, isOfficial: true, value: bcvUsd, change: changeUsd,
        date: cleanDate, scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
      };

      if (bcvEur && rates.euro) {
        const currentEur = rates.euro.value || bcvEur;
        const changeEur = currentEur > 0 ? parseFloat((((bcvEur - currentEur) / currentEur) * 100).toFixed(2)) : 0;
        rates.euro.nextDay = {
          published: true, isOfficial: true, value: bcvEur, change: changeEur,
          date: cleanDate, scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
        };
      }
    } else {
      // Asignar como Tasa Oficial de Hoy
      rates.bcv.value = bcvUsd;
      if (bcvEur && rates.euro) {
        rates.euro.value = bcvEur;
      }
    }
  }

  async fetchBcvOfficialSite() {
    const proxies = [
      'https://www.bcv.org.ve',
      'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.bcv.org.ve'),
      'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent('https://www.bcv.org.ve')
    ];

    for (const url of proxies) {
      try {
        const res = await this._fetch(url);
        if (res.ok) {
          const text = await res.text();
          let html = text;
          if (text.trimStart().startsWith('{')) {
            try { html = JSON.parse(text).contents || ''; } catch { html = text; }
          }
          const parsed = this.parseBcvHtml(html);
          if (parsed?.usd) return parsed;
        }
      } catch (e) {
        console.warn(`Error BCV proxy ${url}:`, e);
      }
    }

    // Respaldo: api.dolarvzla.com
    try {
      const res = await this._fetch('https://api.dolarvzla.com/bcv/current.json');
      if (res.ok) {
        const json = await res.json();
        if (json?.usd) {
          return {
            usd: parseFloat(json.usd),
            eur: json.eur ? parseFloat(json.eur) : null,
            fecha: json.fecha_valor || json.fecha || 'Fecha Valor Oficial BCV'
          };
        }
      }
    } catch (e) {
      console.warn('Error api.dolarvzla.com:', e);
    }

    return null;
  }

  parseBcvHtml(html) {
    if (!html || typeof html !== 'string') return null;
    try {
      const usdMatch = html.match(/id=["']dolar["'][\s\S]*?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i);
      const eurMatch = html.match(/id=["']euro["'][\s\S]*?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i);
      const fechaMatch = html.match(/(?:Fecha\s+Valor|dinamic-date)[\s\S]*?<span[^>]*>\s*([^<]+)\s*<\/span>/i);

      const parseVal = (match) => {
        if (!match?.[1]) return null;
        const val = parseFloat(match[1].trim().replace(/\./g, '').replace(',', '.'));
        return isNaN(val) ? null : val;
      };

      const usd = parseVal(usdMatch);
      const eur = parseVal(eurMatch);
      const fecha = fechaMatch?.[1]?.trim().replace(/\s+/g, ' ').replace(/^Fecha\s+Valor\s*:?\s*/i, '') || null;

      return usd ? { usd, eur, fecha } : null;
    } catch (e) {
      console.warn('Error parseando HTML BCV:', e);
      return null;
    }
  }

  hasValidRateValue(data) {
    if (!data || typeof data !== 'object') return false;
    return Object.values(data).some(r =>
      r && typeof r === 'object' && typeof r.value === 'number' && !isNaN(r.value)
    );
  }

  getCache(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { timestamp, data } = JSON.parse(raw);
      if (typeof timestamp !== 'number' || !data) return null;
      if (Date.now() - timestamp < this.CACHE_TTL_MS && this.hasValidRateValue(data)) {
        return this._decorate(JSON.parse(JSON.stringify(data)), 'cache', { cachedAt: timestamp, fetchedAt: timestamp });
      }
    } catch (e) {
      console.warn('Error leyendo caché:', e);
    }
    return null;
  }

  getCacheStale(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { timestamp, data } = JSON.parse(raw);
      if (typeof timestamp !== 'number' || !data) return null;
      if (Date.now() - timestamp > this.STALE_MAX_AGE_MS) return null;
      if (this.hasValidRateValue(data)) {
        return this._decorate(JSON.parse(JSON.stringify(data)), 'stale', { cachedAt: timestamp, fetchedAt: timestamp });
      }
    } catch (e) {
      console.warn('Error leyendo caché expirada:', e);
    }
    return null;
  }

  setCache(key, data) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
      }
    } catch (e) {
      console.warn('Error guardando caché:', e);
    }
  }
}

const apiService = new ApiService();

  // --- js/notificationService.js ---
/**
 * Servicio de Notificaciones Automáticas de Tasa Diaria
 * - Notificaciones reales del sistema vía @capacitor/local-notifications
 * - Respaldado por toast/log in-app cuando se ejecuta en navegador (no-nativo)
 */





class NotificationService {
  constructor() {
    this.STORAGE_ENABLED = 'dolarfy_notifications_enabled';
    this.STORAGE_LAST_DATE = 'dolarfy_last_notified_date';
    this.STORAGE_LOGS = 'dolarfy_notification_logs';
    this.STORAGE_CHANNEL = 'dolarfy_notification_channel';
    this.DAILY_NOTIFICATION_ID = 9001;
    this.CHANNEL_ID = 'dolarfy-daily-rate';

    this.isNative = typeof Capacitor !== 'undefined' && !!Capacitor.isNativePlatform();

    this.enabled = this.loadEnabledState();
    this.lastNotifiedDate = this._storageGet(this.STORAGE_LAST_DATE) || '';
    this.logs = this.loadLogs();

    if (this.isNative) {
      this.ensureChannel();
    }
  }

  _storageGet(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('Error leyendo almacenamiento', e);
      return null;
    }
  }

  _storageSet(key, value) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('Error escribiendo almacenamiento', e);
    }
  }

  loadEnabledState() {
    const saved = this._storageGet(this.STORAGE_ENABLED);
    return saved !== null ? saved === 'true' : true; // Por defecto activadas
  }

  loadLogs() {
    try {
      const raw = localStorage.getItem(this.STORAGE_LOGS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  saveLogs() {
    try {
      localStorage.setItem(this.STORAGE_LOGS, JSON.stringify(this.logs.slice(0, 15)));
    } catch (e) {
      console.warn('Error al guardar historial de notificaciones', e);
    }
  }

  isEnabled() {
    return this.enabled;
  }

  getLogs() {
    return this.logs;
  }

  getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  }

  // ==========================================================================
  //  Capacitor Local Notifications (Nativo)
  // ==========================================================================

  async ensureChannel() {
    try {
      const created = await LocalNotifications.isChannelCreated({ id: this.CHANNEL_ID });
      if (!created.value) {
        await LocalNotifications.createChannel({
          id: this.CHANNEL_ID,
          name: 'Tasas del Día',
          description: 'Alertas diarias de la tasa oficial del Banco Central de Venezuela (BCV).',
          importance: 5,
          visibility: 1,
          sound: 'default'
        });
        this._storageSet(this.STORAGE_CHANNEL, 'created');
      }
    } catch (e) {
      console.warn('Error creando canal de notificaciones:', e);
    }
  }

  async hasPermission() {
    if (!this.isNative) return false;
    try {
      const perm = await LocalNotifications.checkPermissions();
      return perm.display === 'granted';
    } catch (e) {
      console.warn('Error comprobando permisos:', e);
      return false;
    }
  }

  async requestPermission() {
    if (!this.isNative) return false;
    try {
      const perm = await LocalNotifications.requestPermissions();
      return perm.display === 'granted';
    } catch (e) {
      console.warn('Error solicitando permisos:', e);
      return false;
    }
  }

  /**
   * Hora local a la que 17:00 VET (hora de cierre BCV, UTC-4) ocurre en el
   * dispositivo. VET no usa horario de verano, por lo que es fijo = 21:00 UTC.
   * getTimezoneOffset() devuelve UTC - local (positivo al Oeste), p. ej.
   * +240 en Venezuela (UTC-4), -120 en España (UTC+2).
   */
  getLocalHourForVETClose() {
    const localOffsetHours = -new Date().getTimezoneOffset() / 60;
    const hour = (21 + localOffsetHours) % 24;
    return Math.floor(hour);
  }

  async scheduleDailyReminder() {
    if (!this.isNative || !this.enabled) return null;

    const granted = await this.hasPermission();
    if (!granted) {
      const grantedAfterPrompt = await this.requestPermission();
      if (!grantedAfterPrompt) return null;
    }

    const hour = this.getLocalHourForVETClose();
    try {
      await LocalNotifications.cancel({ notifications: [{ id: this.DAILY_NOTIFICATION_ID }] });
      await LocalNotifications.schedule({
        notifications: [{
          id: this.DAILY_NOTIFICATION_ID,
          title: 'Hora del BCV · Tasa del día',
          body: 'El Banco Central publica la tasa oficial (Fecha Valor). Abre Dolarfy para verla.',
          schedule: {
            on: { hour, minute: 5 },
            allowWhileIdle: true
          },
          channelId: this.CHANNEL_ID,
          smallIcon: 'ic_stat_dollar',
          iconColor: '#06B6D4',
          sound: 'default'
        }]
      });
    } catch (e) {
      console.warn('Error programando recordatorio diario:', e);
    }
    return null;
  }

  async cancelDailyReminder() {
    if (!this.isNative) return;
    try {
      await LocalNotifications.cancel({ notifications: [{ id: this.DAILY_NOTIFICATION_ID }] });
    } catch (e) {
      console.warn('Error cancelando recordatorio diario:', e);
    }
  }

  async sendLocalNotification(entry) {
    if (!this.isNative || !this.enabled) return;

    const granted = await this.hasPermission();
    if (!granted) {
      const grantedAfterPrompt = await this.requestPermission();
      if (!grantedAfterPrompt) return;
    }

    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: entry.id,
          title: 'Nueva Tasa del Día',
          body: `${entry.rateName}: ${entry.formattedValue}`,
          channelId: this.CHANNEL_ID,
          smallIcon: 'ic_stat_dollar',
          iconColor: '#06B6D4',
          sound: 'default'
        }]
      });
    } catch (e) {
      console.warn('Error enviando notificación local:', e);
    }
  }

  // ==========================================================================
  //  Toggle
  // ==========================================================================

  async toggleNotifications(forceState = null) {
    this.enabled = forceState !== null ? forceState : !this.enabled;
    this._storageSet(this.STORAGE_ENABLED, this.enabled.toString());

    if (this.enabled) {
      await this.scheduleDailyReminder();
    } else {
      await this.cancelDailyReminder();
    }
    return this.enabled;
  }

  // ==========================================================================
  //  Detección de nueva tasa diaria
  // ==========================================================================

  async checkDailyUpdate(country, rates) {
    if (!this.enabled || !rates) return;

    const rateKeys = Object.keys(rates);
    if (rateKeys.length === 0) return;

    const mainRate = rates[country.defaultRateId] || rates[rateKeys[0]];
    if (!mainRate || !mainRate.value) return;

    // Con tasa activa de "predicción" si está publicada, sino hoy
    const notifiedValue = (mainRate.nextDay && mainRate.nextDay.value)
      ? mainRate.nextDay.value
      : mainRate.value;

    const todayStr = this.getTodayString();
    const lastKey = `${country.id}_${todayStr}_${notifiedValue.toFixed(2)}`;

    // Si ya notificamos esta misma tasa para la fecha de hoy, omitir
    if (this.lastNotifiedDate === lastKey) return;

    this.lastNotifiedDate = lastKey;
    this._storageSet(this.STORAGE_LAST_DATE, lastKey);

    const logEntry = {
      id: Date.now(),
      countryId: country.id,
      countryName: country.name,
      flagUrl: country.flagUrl,
      rateName: mainRate.name,
      value: notifiedValue,
      currency: mainRate.currency,
      formattedValue: formatCurrency(notifiedValue, mainRate.currency, notifiedValue < 10 ? 4 : 2),
      time: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true }),
      date: new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })
    };

    this.logs.unshift(logEntry);
    this.saveLogs();

    // Notificación real del sistema (nativo) + toast in-app (siempre)
    await this.sendLocalNotification(logEntry);
    this.showToast(logEntry);
  }

  // ==========================================================================
  //  Toast in-app (fallback / navegador)
  // ==========================================================================

  showToast(logEntry) {
    let toastContainer = document.getElementById('dolarfy-toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'dolarfy-toast-container';
      toastContainer.className = 'fixed top-16 left-1/2 -translate-x-1/2 z-[150] w-full max-w-sm px-4 pointer-events-none';
      document.body.appendChild(toastContainer);
    }

    const toastEl = document.createElement('div');
    toastEl.className = 'pointer-events-auto bg-[#0F141C] border border-cyan-500/40 rounded-2xl p-4 shadow-2xl glow-cyan flex items-start space-x-3 animate-fade-in transition-all duration-300';
    toastEl.innerHTML = `
      <img src="${logEntry.flagUrl}" alt="${logEntry.countryName}" class="w-8 h-8 rounded-full object-cover border border-cyan-500/30 mt-0.5">
      <div class="flex-1">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Nueva Tasa del Día
          </span>
          <span class="text-[9px] text-gray-400">${logEntry.time}</span>
        </div>
        <h4 class="text-xs font-bold text-white mt-0.5">${logEntry.rateName}</h4>
        <p class="text-sm font-extrabold text-emerald-400">${logEntry.formattedValue}</p>
      </div>
      <button class="toast-close-btn text-gray-400 hover:text-white p-1 text-xs">✕</button>
    `;

    const closeBtn = toastEl.querySelector('.toast-close-btn');
    closeBtn?.addEventListener('click', () => {
      toastEl.remove();
    });

    toastContainer.appendChild(toastEl);

    // Auto eliminar después de 6 segundos
    setTimeout(() => {
      if (toastEl.parentNode) {
        toastEl.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => toastEl.remove(), 300);
      }
    }, 6000);
  }
}

const notificationService = new NotificationService();

  // --- js/mockData.js ---
/**
 * Motor de tasas de cambio de Dolarfy
 * Gestiona el ciclo de vida de los datos: caché, sincronización y suscripciones.
 */





class RatesEngine {
  constructor() {
    this.countries = COUNTRIES_DATA;
    this.listeners = [];
    this._hydrateCacheSync();
    this.syncRealRates();
    this._startPolling();
  }

  _hydrateCacheSync() {
    const current = this.getCurrentCountry();
    try {
      if (typeof localStorage === 'undefined') return;

      const cacheKey = `${RATES_CACHE_KEY_PREFIX}_${current.id}`;

      // Limpiar entradas de versiones anteriores del caché
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('dolarfy_rates_cache_') && key !== cacheKey) {
          toRemove.push(key);
        }
      }
      toRemove.forEach(k => { try { localStorage.removeItem(k); } catch {} });

      const raw = localStorage.getItem(cacheKey);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const data = parsed.data || parsed;
      const hasValidRates = data && typeof data === 'object' &&
        Object.values(data).some(r => r && typeof r === 'object' &&
          typeof r.value === 'number' && !isNaN(r.value));

      if (!hasValidRates) return;

      // Descartar caché de más de 7 días
      const cachedAt = typeof parsed.timestamp === 'number' ? parsed.timestamp : 0;
      if (cachedAt > 0 && Date.now() - cachedAt > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(cacheKey);
        return;
      }

      current.rates = { ...this.countries[0].rates, ...data };
    } catch (e) {
      console.warn('Error al cargar caché inicial:', e);
    } finally {
      if (!current.rates._meta) {
        current.rates._meta = { source: 'placeholder', placeholder: true, fetchedAt: 0 };
      }
    }
  }

  async syncRealRates(force = false) {
    const current = this.getCurrentCountry();
    try {
      const rates = await apiService.fetchRatesForCountry(current, force);
      if (rates) {
        current.rates = rates;
        this._notify(null, 'rates_refreshed');
      }
    } catch (e) {
      console.warn('Error al sincronizar tasas:', e);
    }
  }

  _startPolling() {
    // Polling cada 15 segundos
    setInterval(() => this.syncRealRates(true), 15 * 1000);

    // Refrescar al volver a la app
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.syncRealRates(true);
      });
    }
  }

  getCurrentCountry() {
    return this.countries[0];
  }

  getRates() {
    return { ...this.getCurrentCountry().rates };
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  _notify(updatedRateId, action = 'update') {
    this.listeners.forEach(l => l(this.getRates(), updatedRateId, action));
  }

  // Alias público para compatibilidad interna
  notifyListeners(updatedRateId, action = 'update') {
    this._notify(updatedRateId, action);
  }
}

const ratesEngine = new RatesEngine();

// Alias de compatibilidad — todos los componentes usan mockEngine
const mockEngine = ratesEngine;


  // --- js/components/notificationModal.js ---



class NotificationModal {
  constructor() {
    this.modalEl = null;
  }

  init() {
    let container = document.getElementById('notification-modal-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-modal-container';
      document.body.appendChild(container);
    }
    this.modalEl = container;
  }

  open() {
    this.init();
    this.render();
    if (window.lucide) window.lucide.createIcons();
  }

  close() {
    if (this.modalEl) {
      this.modalEl.innerHTML = '';
    }
  }

  render() {
    const isEnabled = notificationService.isEnabled();
    const logs = notificationService.getLogs();
    const currentCountry = mockEngine.getCurrentCountry();

    this.modalEl.innerHTML = `
      <div id="notification-modal-backdrop" class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 animate-fade-in">
        <div class="w-full max-w-md bg-[#0F141C] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
          
          <!-- Modal Header -->
          <div class="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
            <div class="flex items-center space-x-2">
              <i data-lucide="bell" class="w-5 h-5 text-cyan-400"></i>
              <h3 class="text-base font-extrabold text-white">Alertas de Tasa Diaria</h3>
            </div>
            <button id="close-notif-modal-btn" type="button" class="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white transition-all active:scale-95">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <!-- Content Body -->
          <div class="p-4 overflow-y-auto space-y-4 max-h-[70vh] custom-scroll">
            
            <!-- Toggle Switch Card -->
            <div class="glass-card rounded-2xl p-4 flex items-center justify-between border border-cyan-500/30">
              <div class="pr-3">
                <h4 class="text-xs font-extrabold text-white flex items-center gap-1.5">
                  <span>Notificar Tasa del Día</span>
                  ${isEnabled ? `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>` : ''}
                </h4>
                <p class="text-[11px] text-gray-400 mt-1 leading-snug">
                  Te avisará automáticamente apenas cambie la tasa oficial del día sin necesidad de adivinar la hora.
                </p>
              </div>

              <button id="toggle-notif-switch" type="button" class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isEnabled ? 'bg-cyan-500' : 'bg-gray-700'}">
                <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isEnabled ? 'translate-x-5' : 'translate-x-0'}"></span>
              </button>
            </div>

            <!-- Current Country Info Tip -->
            <div class="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center space-x-3 text-xs">
              <img src="${currentCountry.flagUrl}" alt="${currentCountry.name}" class="w-6 h-6 rounded-full object-cover">
              <div>
                <p class="font-bold text-gray-200">Monitoreando: ${currentCountry.name}</p>
                <p class="text-[10px] text-gray-400">Recibirás alertas cuando el Banco Central publica la tasa oficial.</p>
              </div>
            </div>

            <!-- Log History Section -->
            <div>
              <div class="flex justify-between items-center mb-3">
                <h4 class="text-xs font-bold uppercase tracking-wider text-gray-400">Historial de Alertas</h4>
                <span class="text-[10px] text-gray-500">${logs.length} registros</span>
              </div>

              ${logs.length === 0 ? `
                <div class="text-center py-8 bg-black/20 rounded-2xl border border-white/5 space-y-2">
                  <i data-lucide="bell-off" class="w-8 h-8 text-gray-600 mx-auto"></i>
                  <p class="text-xs text-gray-400 font-semibold">Sin alertas recientes</p>
                  <p class="text-[10px] text-gray-500 max-w-xs mx-auto">
                    Tan pronto como la API detecte una actualización en la tasa del día, aparecerá aquí.
                  </p>
                </div>
              ` : `
                <div class="space-y-2">
                  ${logs.map(log => `
                    <div class="glass-card rounded-xl p-3 flex items-center justify-between border border-white/5">
                      <div class="flex items-center space-x-3">
                        <img src="${log.flagUrl}" alt="${log.countryName}" class="w-6 h-6 rounded-full object-cover">
                        <div>
                          <h5 class="text-xs font-bold text-white">${log.rateName}</h5>
                          <p class="text-[10px] text-gray-400">${log.date} a las ${log.time}</p>
                        </div>
                      </div>
                      <span class="text-sm font-extrabold text-emerald-400">${log.formattedValue}</span>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

          </div>

        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    const backdrop = document.getElementById('notification-modal-backdrop');
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    const closeBtn = document.getElementById('close-notif-modal-btn');
    closeBtn?.addEventListener('click', () => this.close());

    const toggleSwitch = document.getElementById('toggle-notif-switch');
    toggleSwitch?.addEventListener('click', async () => {
      await notificationService.toggleNotifications();
      this.render();
      if (window.lucide) window.lucide.createIcons();

      // Notificar a la app para actualizar el icono de la campana en el header
      const event = new CustomEvent('dolarfy:notification_toggled');
      document.dispatchEvent(event);
    });
  }
}


  // --- js/components/dashboard.js ---



class DashboardView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.unsubscribe = null;
    this.selectedDay = 'hoy'; // 'hoy' | 'manana'
  }

  getNextDayLabel(rates) {
    const now = new Date();
    const vetOffsetMs = -4 * 60 * 60 * 1000;
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const vetDate = new Date(utcMs + vetOffsetMs);
    const todayDay = vetDate.getDay(); // 0 = Dom, 1 = Lun, 2 = Mar, 3 = Mié, 4 = Jue, 5 = Vie, 6 = Sáb

    // En Viernes, Sábado y Domingo, la próxima fecha valor del BCV es siempre el Lunes
    if (todayDay === 5 || todayDay === 6 || todayDay === 0) {
      return 'Lunes';
    }

    const bcvNext = rates && rates.bcv && rates.bcv.nextDay;
    if (bcvNext && bcvNext.date) {
      const match = bcvNext.date.match(/(Lunes|Martes|Miércoles|Miercoles|Jueves|Viernes|Sábado|Sabado|Domingo)/i);
      if (match) {
        let day = match[1].toLowerCase();
        if (day === 'sábado' || day === 'sabado' || day === 'domingo') {
          return 'Lunes';
        }
        return day.charAt(0).toUpperCase() + day.slice(1);
      }
    }

    const dayNames = { 1: 'Martes', 2: 'Miércoles', 3: 'Jueves', 4: 'Viernes' };
    return dayNames[todayDay] || 'Mañana';
  }

  cleanText(str) {
    if (!str || typeof str !== 'string') return str || '';
    return str.replace(/Fecha\s+Valor\s*:?\s*/gi, '').trim();
  }

  formatSourceTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  getSourceLabel(rates) {
    const meta = (rates && rates._meta) || {};
    const src = meta.source || 'live';
    const time = this.formatSourceTime(meta.cachedAt || meta.fetchedAt);

    switch (src) {
      case 'stale':
        return `<span class="text-[10px] text-amber-400 font-semibold" title="Dato almacenado">Última: ${time}</span>`;
      case 'cache':
        return `<span class="text-[10px] text-gray-400 font-medium" title="Dato almacenado">Caché ${time}</span>`;
      case 'placeholder':
        return `<span class="text-[10px] text-gray-500 font-medium" title="Datos de referencia">Sin conexión · Referencia</span>`;
      case 'offline':
        return `<span class="text-[10px] text-red-400 font-semibold" title="Sin conexión activa">Sin conexión${time ? ` · ${time}` : ''}</span>`;
      default:
        return `<span class="text-[10px] text-emerald-400 font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block mr-1"></span>En Vivo</span>`;
    }
  }

  render() {
    const currentCountry = mockEngine.getCurrentCountry();
    const rates = mockEngine.getRates();
    const rateKeys = Object.keys(rates).filter(k => k !== '_meta');
    const rawNextDayLabel = this.getNextDayLabel(rates);
    const nextDayLabel = escapeHtml(this.cleanText(rawNextDayLabel));

    const isManana = this.selectedDay === 'manana';
    const mainRate = rates[currentCountry.defaultRateId] || rates[rateKeys[0]] || { name: 'Dólar Oficial (BCV)', currency: 'VES', value: 0 };
    const secondRate = rateKeys.length > 1 ? rates[rateKeys[1]] : null;

    const mainVal = (isManana && mainRate && mainRate.nextDay && mainRate.nextDay.value) ? mainRate.nextDay.value : (mainRate ? mainRate.value : null);
    const secondVal = (secondRate && isManana && secondRate.nextDay && secondRate.nextDay.value) ? secondRate.nextDay.value : (secondRate ? secondRate.value : null);

    let bannerTag = isManana 
      ? `Fecha Valor · ${nextDayLabel}` 
      : 'Resumen del Día';
    let bannerText = '';
    let bannerSub = '';

    if (isManana) {
      bannerText = (mainVal !== null && mainVal !== undefined)
        ? `${this.cleanText(mainRate.name)} (${nextDayLabel}): ${formatCurrency(mainVal, mainRate.currency, 2)}`
        : `${nextDayLabel}: Bs. — — —`;
      bannerSub = `Cotización oficial del Banco Central de Venezuela publicada en bcv.org.ve para ${nextDayLabel}.`;
    } else {
      bannerText = (mainVal !== null && mainVal !== undefined) ? `${this.cleanText(mainRate.name)}: ${formatCurrency(mainVal, mainRate.currency, 2)}` : `${mainRate.name}: Bs. — — —`;
      bannerSub = mainVal 
        ? `Tasas de referencia en vivo actualizadas desde bcv.org.ve.`
        : 'Cargando tasas en vivo...';

      if (secondVal && mainVal && mainRate.currency === secondRate.currency) {
        const diff = Math.abs(secondVal - mainVal);
        const gapPercent = ((diff / Math.min(mainVal, secondVal)) * 100).toFixed(1);
        bannerSub = `Diferencia entre ${mainRate.name} y ${secondRate.name} se ubica en ${gapPercent}%.`;
      }
    }

    this.container.innerHTML = `
      <div class="space-y-6 pb-24 animate-fade-in">
        <!-- Header status bar -->
        <div class="flex items-center justify-between bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-4">
          <div class="flex items-center space-x-3">
            <span class="relative flex h-3 w-3">
              <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <p class="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <i data-lucide="landmark" class="w-3.5 h-3.5 text-emerald-400"></i>
                <span>Monitoreo Oficial BCV (bcv.org.ve)</span>
              </p>
              <p class="text-[11px] text-gray-300 font-semibold mt-0.5">${currentCountry.officialSchedule || 'Cierre Banco Central'}</p>
            </div>
          </div>
          <div id="dash-country-badge" class="text-xs font-bold px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center space-x-1.5">
            <img src="${currentCountry.flagUrl}" alt="${currentCountry.name}" class="w-4 h-4 rounded-full object-cover border border-cyan-500/30">
            <span>${currentCountry.name}</span>
          </div>
        </div>

        <!-- Banner Promocional / Alerta de Mercado -->
        <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-900/40 via-blue-900/30 to-purple-900/40 p-5 border border-white/10">
          <div class="relative z-10">
            <span class="bg-cyan-500/20 text-cyan-300 text-xs px-2.5 py-0.5 rounded-full font-semibold">${bannerTag}</span>
            <h3 class="text-lg font-bold text-white mt-2">${bannerText}</h3>
            <p class="text-xs text-gray-300 mt-1">${bannerSub}</p>
          </div>
        </div>

        <!-- Encabezado de Tasas y Selector 'Hoy' / Pronóstico Día Siguiente -->
        <div>
          <div class="flex justify-between items-center mb-3">
            <div>
              <h2 class="text-xs font-bold uppercase tracking-wider text-gray-400">Tasas Principales ${currentCountry.name}</h2>
              <span class="text-xs font-bold text-cyan-400">${currentCountry.currency.code}</span>
            </div>

            <!-- Selector de Fecha 'Hoy' / Pronóstico Día Siguiente ('Lunes', 'Martes', 'Miércoles', etc.) -->
            <div class="bg-[#131924] border border-white/10 p-1 rounded-2xl flex items-center space-x-1 shadow-inner">
              <button type="button" data-day="hoy" class="dash-day-btn relative px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${this.selectedDay === 'hoy' ? 'bg-cyan-500/20 text-emerald-400 border border-cyan-500/40 shadow-sm' : 'text-gray-400 hover:text-white'}">
                Hoy
              </button>
              <button type="button" data-day="manana" class="dash-day-btn relative px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${this.selectedDay === 'manana' ? 'bg-cyan-500/20 text-emerald-400 border border-cyan-500/40 shadow-sm' : 'text-gray-400 hover:text-white'}">
                <span>${nextDayLabel}</span>
              </button>
            </div>
          </div>

          <!-- Contenido de Cotizaciones segun la pestaña activa -->
          ${this.renderContentSection(rates, rateKeys, currentCountry, isManana, nextDayLabel)}
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.subscribeToUpdates();
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  renderContentSection(rates, rateKeys, currentCountry, isManana, nextDayLabel) {
    if (isManana) {
      return `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
          ${rateKeys.map(key => this.renderNextDayRateCard(rates[key], nextDayLabel)).join('')}
        </div>
      `;
    }

    // Modo 'hoy' por defecto
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
        ${rateKeys.map(key => this.renderRateCard(rates[key], rates)).join('')}
      </div>
    `;
  }

  renderRateCard(rate, rates) {
    if (!rate) return '';
    const isPositive = rate.change >= 0;
    const badgeBg = isPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20';
    const trendIcon = isPositive ? 'trending-up' : 'trending-down';

    const isLoaded = rate.value !== null && rate.value !== undefined && !isNaN(rate.value);
    const valueDisplay = isLoaded
      ? formatCurrency(rate.value, rate.currency, rate.value < 10 ? 4 : 2)
      : `<span class="text-white/30 tracking-widest font-mono text-xl">— — —</span>`;

    return `
      <div id="card-${rate.id}" class="glass-card-interactive rounded-2xl p-4 relative overflow-hidden transition-all duration-300">
        <div class="flex justify-between items-start">
          <div class="flex items-center space-x-3">
            <div class="p-2.5 rounded-xl bg-white/5 border border-white/10 text-cyan-400">
              <i data-lucide="${rate.icon || 'coins'}" class="w-5 h-5"></i>
            </div>
            <div>
              <h4 class="font-bold text-gray-100 text-sm">${rate.name}</h4>
              <p class="text-xs text-gray-400">${rate.code}</p>
            </div>
          </div>
          <span id="badge-${rate.id}" class="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeBg}">
            <i data-lucide="${trendIcon}" class="w-3.5 h-3.5"></i>
            <span>${formatPercentage(rate.change)}</span>
          </span>
        </div>

        <div class="mt-4 flex justify-between items-end">
          <div>
            <p class="text-2xl font-extrabold text-white tracking-tight" id="val-${rate.id}">
              ${valueDisplay}
            </p>
          </div>
          <span class="text-[10px] text-gray-500 font-medium">${this.getSourceLabel(rates)}</span>
        </div>
      </div>
    `;
  }

  renderNextDayRateCard(rate, nextDayLabel = 'Mañana') {
    if (!rate) return '';

    // Manejo especial para USDT / Crypto (Mercado 24/7 en tiempo real)
    if (rate.id === 'paralelo' || rate.type === 'crypto') {
      const liveVal = rate.value;
      const valueDisplay = liveVal !== null && liveVal !== undefined && !isNaN(liveVal)
        ? formatCurrency(liveVal, rate.currency, 2)
        : `<span class="text-white/30 tracking-widest font-mono text-xl">— — —</span>`;

      return `
        <div id="card-next-${rate.id}" class="glass-card-interactive rounded-2xl p-4 relative overflow-hidden transition-all duration-300 border-yellow-500/30">
          <div class="flex justify-between items-start">
            <div class="flex items-center space-x-3">
              <div class="p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-300">
                <i data-lucide="${rate.icon || 'coins'}" class="w-5 h-5"></i>
              </div>
              <div>
                <h4 class="font-bold text-gray-100 text-sm">${rate.name}</h4>
                <span class="text-[10px] bg-yellow-500/20 text-yellow-300 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <i data-lucide="zap" class="w-3 h-3 text-yellow-400"></i> Binance P2P
                </span>
              </div>
            </div>
            <span class="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
              <span>En Vivo</span>
            </span>
          </div>

          <div class="mt-4 flex justify-between items-end">
            <div>
              <p class="text-2xl font-extrabold text-amber-400 tracking-tight">
                ${valueDisplay}
              </p>
              <p class="text-[11px] text-gray-300 font-medium mt-0.5">Mercado 24/7 en Tiempo Real</p>
            </div>
            <span class="text-[10px] text-yellow-400 font-bold">Sin Cierre</span>
          </div>
        </div>
      `;
    }

    const hasOfficialNextDay = rate.nextDay && rate.nextDay.value && rate.nextDay.published;
    const nextDay = hasOfficialNextDay ? rate.nextDay : null;

    const val = nextDay ? nextDay.value : null;
    const isPositive = nextDay ? nextDay.change >= 0 : true;
    const badgeBg = isPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20';
    const trendIcon = isPositive ? 'trending-up' : 'trending-down';

    const valueDisplay = val !== null && val !== undefined && !isNaN(val)
      ? formatCurrency(val, rate.currency, val < 10 ? 4 : 2)
      : `<span class="text-white/30 tracking-widest font-mono text-xl">— — —</span>`;

    const isOfficial = rate.type === 'official' || (nextDay && nextDay.isOfficial);
    const badgeTag = isOfficial 
      ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><i data-lucide="check-circle" class="w-3 h-3 text-emerald-400"></i> Oficial BCV</span>'
      : '<span class="text-[10px] bg-cyan-500/20 text-cyan-300 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><i data-lucide="coins" class="w-3 h-3 text-cyan-400"></i> Binance P2P</span>';

    const dateSubtitle = hasOfficialNextDay
      ? escapeHtml(this.cleanText(nextDay.date)) || `Oficial ${nextDayLabel}`
      : `Sin publicación oficial BCV aún para ${nextDayLabel}`;

    return `
      <div id="card-next-${rate.id}" class="glass-card-interactive rounded-2xl p-4 relative overflow-hidden transition-all duration-300 border-cyan-500/30">
        <div class="flex justify-between items-start">
          <div class="flex items-center space-x-3">
            <div class="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
              <i data-lucide="${rate.icon || 'coins'}" class="w-5 h-5"></i>
            </div>
            <div>
              <h4 class="font-bold text-gray-100 text-sm">${rate.name}</h4>
              ${badgeTag}
            </div>
          </div>
          <span class="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeBg}">
            <i data-lucide="${trendIcon}" class="w-3.5 h-3.5"></i>
            <span>${nextDay ? formatPercentage(nextDay.change) : '0.00%'}</span>
          </span>
        </div>

        <div class="mt-4 flex justify-between items-end">
          <div>
            <p class="text-2xl font-extrabold text-emerald-400 tracking-tight">
              ${valueDisplay}
            </p>
            <p class="text-[11px] text-gray-300 font-medium mt-0.5">${dateSubtitle}</p>
          </div>
          <span class="text-[10px] text-cyan-400 font-bold">Ref. ${nextDayLabel}</span>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    const dayBtns = this.container.querySelectorAll('.dash-day-btn');
    dayBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const day = btn.getAttribute('data-day');
        if (day && day !== this.selectedDay) {
          this.selectedDay = day;
          this.render();
        }
      });
    });
  }

  subscribeToUpdates() {
    if (this.unsubscribe) this.unsubscribe();

    this.unsubscribe = mockEngine.subscribe((rates, updatedId, action) => {
      if (action === 'rates_refreshed') {
        this.render();
      }
    });
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}


  // --- js/components/calculator.js ---





class CalculatorView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.expression = '0';
    this.currentCountry = mockEngine.getCurrentCountry();
    
    // Monedas por defecto
    const localCode = this.currentCountry.currency.code;
    this.fromCurrency = 'USD';
    this.toCurrency = localCode === 'USD' ? 'EUR' : localCode;

    // Tasa por defecto
    const rates = this.currentCountry.rates;
    const rateKeys = Object.keys(rates);
    this.selectedRateId = this.currentCountry.defaultRateId && rates[this.currentCountry.defaultRateId] 
      ? this.currentCountry.defaultRateId 
      : rateKeys[0];

    // Selector de día: 'hoy' o 'prediccion'
    this.selectedDay = 'hoy';
    this.unsubscribe = null;
  }

  getNextDayLabel(rates) {
    const todayDay = new Date().getDay();
    // Viernes=5, Sábado=6, Domingo=0 → siguiente publicación es Lunes
    if (todayDay === 5 || todayDay === 6 || todayDay === 0) return 'Lunes';

    const bcvNext = rates && rates.bcv && rates.bcv.nextDay;
    if (bcvNext && bcvNext.date) {
      const match = bcvNext.date.match(/(Lunes|Martes|Mi[eé]rcoles|Jueves|Viernes|S[aá]bado|Domingo)/i);
      if (match) {
        let day = match[1].toLowerCase();
        if (day === 'sábado' || day === 'sabado' || day === 'domingo') return 'Lunes';
        return day.charAt(0).toUpperCase() + day.slice(1);
      }
    }
    return 'Mañana';
  }

  hasNextDayRate(rates) {
    // Comprueba si hay algún nextDay publicado con valor
    return Object.values(rates).some(
      r => r && r.nextDay && r.nextDay.value && r.nextDay.published
    );
  }

  getPillLabel(rateKey, rateObj) {
    if (!rateObj) return rateKey || '';
    if (rateKey === 'bcv') return 'BCV';
    if (rateKey === 'paralelo' || rateObj.id === 'paralelo') return 'Paralelo';
    if (rateKey === 'usdc' || rateObj.id === 'usdc') return 'USDC';
    if (rateKey === 'usdt' || rateObj.id === 'usdt') return 'USDT';
    if (rateKey === 'euro') return 'Euro';
    if (rateKey === 'eurusd') return 'EUR';
    if (rateKey === 'usdeur') return 'USD';
    if (rateKey === 'base') return rateObj.currency === 'USD' ? 'Dólar' : 'Euro';

    return rateObj.name.split(' ')[0];
  }

  getEffectiveRate(rateObj) {
    if (!rateObj) return 1;
    // Usar tasa del día siguiente solo si el usuario la seleccionó y está publicada
    if (
      this.selectedDay === 'prediccion' &&
      rateObj.nextDay &&
      rateObj.nextDay.published &&
      rateObj.nextDay.value
    ) {
      return rateObj.nextDay.value;
    }
    return rateObj.value || 1;
  }

  getCurrencySymbol(code) {
    const symbols = {
      USD: '$', VES: 'Bs.', COP: '$', ARS: '$', MXN: '$', CLP: '$',
      PEN: 'S/', BRL: 'R$', DOP: 'RD$', EUR: '€', USDT: '₮', USDC: '₮', GBP: '£'
    };
    return symbols[code] || '$';
  }

  getSourceLabel(rates) {
    const meta = (rates && rates._meta) || {};
    const src = meta.source || 'live';
    const ts = meta.fetchedAt || meta.cachedAt;
    let time = '';
    if (ts) {
      time = new Date(ts).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    switch (src) {
      case 'stale':
        return `<span class="text-[9px] text-amber-400 font-bold">Última: ${time}</span>`;
      case 'cache':
        return `<span class="text-[9px] text-gray-400 font-bold">Caché ${time}</span>`;
      case 'offline':
        return `<span class="text-[9px] text-red-400 font-bold">Sin conexión</span>`;
      default:
        return `<span class="text-[9px] text-emerald-400 font-bold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>En Vivo</span>`;
    }
  }

  render() {
    this.currentCountry = mockEngine.getCurrentCountry();
    const rates = this.currentCountry.rates;
    const rateKeys = Object.keys(rates).filter(k => k !== '_meta');

    if (!rates[this.selectedRateId]) {
      this.selectedRateId = this.currentCountry.defaultRateId && rates[this.selectedRateId]
        ? this.currentCountry.defaultRateId
        : rateKeys[0];
    }

    const activeRateObj = rates[this.selectedRateId] || Object.values(rates)[0];
    const activeRate = this.getEffectiveRate(activeRateObj);
    const [baseCode, targetCode] = activeRateObj && activeRateObj.code ? activeRateObj.code.split('/') : ['USD', this.currentCountry.currency.code];
    const ratePair = [baseCode, targetCode];

    // Ajustar monedas de origen y destino si alguna no pertenece al par de la tasa activa
    if (!ratePair.includes(this.fromCurrency) || !ratePair.includes(this.toCurrency)) {
      if (targetCode === 'USD' && baseCode !== 'USD') {
        this.fromCurrency = 'USD';
        this.toCurrency = baseCode;
      } else {
        this.fromCurrency = baseCode;
        this.toCurrency = targetCode;
      }
    }

    const fromSym = this.getCurrencySymbol(this.fromCurrency);
    const toSym = this.getCurrencySymbol(this.toCurrency);

    const showDayToggle = this.hasNextDayRate(rates);
    const nextDayLabel = this.getNextDayLabel(rates);

    this.container.innerHTML = `
      <div class="space-y-3 pb-24 animate-fade-in max-w-md mx-auto">
        
        <!-- 1. Barra Superior: Tasas + Selector Hoy/Predicción -->
        <div class="w-full text-xs space-y-2">
          <!-- Píldoras de Tasas del País -->
          <div class="grid grid-cols-${Math.min(rateKeys.length, 4)} gap-1 bg-black/40 p-1 rounded-2xl border border-white/10 w-full items-center" id="rate-pills-group">
            ${rateKeys.map(key => {
              const r = rates[key];
              const isSelected = this.selectedRateId === key;
              const pillLabel = this.getPillLabel(key, r);
              return `
                <button data-rate="${key}" type="button" class="rate-pill-btn w-full py-1.5 px-1 rounded-xl font-bold text-center transition-all text-xs truncate flex items-center justify-center ${isSelected ? 'bg-emerald-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                  ${pillLabel}
                </button>
              `;
            }).join('')}
          </div>

          <!-- Selector Hoy / Predicción (solo si hay nextDay publicado) -->
          ${showDayToggle ? `
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-gray-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">Calcular con tasa de: ${this.getSourceLabel(rates)}</span>
            <div class="bg-[#131924] border border-white/10 p-0.5 rounded-xl flex items-center space-x-0.5 shadow-inner" id="calc-day-toggle">
              <button type="button" data-calcday="hoy" class="calc-day-btn px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${this.selectedDay === 'hoy' ? 'bg-cyan-500/20 text-emerald-400 border border-cyan-500/40 shadow-sm' : 'text-gray-400 hover:text-white'}">
                Hoy
              </button>
              <button type="button" data-calcday="prediccion" class="calc-day-btn px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${this.selectedDay === 'prediccion' ? 'bg-cyan-500/20 text-emerald-400 border border-cyan-500/40 shadow-sm' : 'text-gray-400 hover:text-white'}">
                ${nextDayLabel}
              </button>
            </div>
          </div>
          ` : ''}
        </div>

        <!-- 2. Pantalla Digital de Conversión Integrada -->
        <div class="glass-card rounded-3xl p-4 relative space-y-3 shadow-2xl border border-white/10 bg-[#111622]/95">
          
          <!-- Top info bar inside card -->
          <div class="flex items-center justify-between">
            <span id="rate-badge-pill" class="bg-black/50 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
              ${this.selectedDay === 'prediccion' && showDayToggle
                ? `<i data-lucide="calendar-check" class="w-3 h-3 text-amber-400"></i><span class="text-amber-300">${nextDayLabel}:</span>`
                : `<i data-lucide="sun" class="w-3 h-3 text-emerald-400"></i>`
              }
              ${activeRate.toFixed(activeRate < 10 ? 4 : 2)}
            </span>
            <div class="flex items-center space-x-3 text-cyan-400">
              <button id="calc-shift-btn" type="button" title="Shift / Swap" class="hover:text-white transition-all cursor-pointer"><i data-lucide="code-2" class="w-4 h-4"></i></button>
              <button id="swap-currency-btn" type="button" title="Intercambiar divisas" class="hover:text-white transition-all cursor-pointer"><i data-lucide="arrow-up-down" class="w-4 h-4"></i></button>
              <button id="calc-history-btn" type="button" title="Historial de conversiones" class="hover:text-emerald-400 transition-all cursor-pointer"><i data-lucide="history" class="w-4 h-4 text-emerald-400"></i></button>
            </div>
          </div>

          <!-- User typed amount display (Middle Right) -->
          <div class="text-right py-1">
            <span id="calc-display-input" class="text-3xl sm:text-4xl font-black text-white tracking-tight break-all">${this.expression} ${fromSym}</span>
          </div>

          <!-- Large Green Equality Result Display (Center) -->
          <div class="text-left border-t border-white/5 pt-2 flex justify-between items-center">
            <p id="calc-equality-display" class="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight leading-tight">
              ${fromSym}0,00 = 0,00 ${toSym}
            </p>
            <button id="copy-result-btn" type="button" title="Copiar resultado" class="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-emerald-400 active:scale-95 transition-all cursor-pointer">
              <i data-lucide="copy" class="w-4 h-4"></i>
            </button>
          </div>

          <!-- Mode Badge at Bottom Right of card -->
          <div class="flex justify-end items-center space-x-1 text-[10px] text-gray-400 font-bold uppercase tracking-wider pt-1">
            <span id="calc-mode-badge">${this.fromCurrency} → ${this.toCurrency}</span>
            <i data-lucide="arrow-left-right" class="w-3 h-3 text-cyan-400"></i>
          </div>

        </div>

        <!-- 3. Teclado Numérico de 5 Filas -->
        <div class="grid grid-cols-4 gap-2 pt-1" id="calc-keypad">
          <!-- Row 1 -->
          <button data-key="C" type="button" class="calc-key-btn calc-key-clear py-3.5 rounded-2xl text-xl font-black text-amber-400">C</button>
          <button data-key="/" type="button" class="calc-key-btn calc-key-op py-3.5 rounded-2xl text-2xl font-bold flex items-center justify-center text-emerald-400">÷</button>
          <button data-key="*" type="button" class="calc-key-btn calc-key-op py-3.5 rounded-2xl text-2xl font-bold flex items-center justify-center text-emerald-400">×</button>
          <button data-key="BACKSPACE" type="button" class="calc-key-btn py-3.5 rounded-2xl text-sm font-extrabold flex items-center justify-center text-amber-400 border-amber-500/30">
            <i data-lucide="delete" class="w-5 h-5"></i>
          </button>

          <!-- Row 2 -->
          <button data-key="7" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">7</button>
          <button data-key="8" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">8</button>
          <button data-key="9" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">9</button>
          <button data-key="-" type="button" class="calc-key-btn calc-key-op py-3.5 rounded-2xl text-3xl font-bold flex items-center justify-center text-emerald-400">-</button>

          <!-- Row 3 -->
          <button data-key="4" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">4</button>
          <button data-key="5" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">5</button>
          <button data-key="6" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">6</button>
          <button data-key="+" type="button" class="calc-key-btn calc-key-op py-3.5 rounded-2xl text-2xl font-bold flex items-center justify-center text-emerald-400">+</button>

          <!-- Row 4 & 5 (with row-span-2 Equals button) -->
          <button data-key="1" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">1</button>
          <button data-key="2" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">2</button>
          <button data-key="3" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">3</button>
          <button data-key="=" type="button" class="calc-key-btn calc-key-equals row-span-2 rounded-2xl text-3xl font-black flex items-center justify-center shadow-lg shadow-emerald-500/30">=</button>

          <button data-key="0" type="button" class="calc-key-btn col-span-2 py-3.5 rounded-2xl text-2xl text-white font-bold">0</button>
          <button data-key="," type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">,</button>
        </div>

      </div>
    `;

    this.attachEvents();
    this.subscribeToUpdates();
    this.calculate();
    if (window.lucide) window.lucide.createIcons();
  }

  attachEvents() {
    const ratePills = document.querySelectorAll('.rate-pill-btn');
    const swapBtn = document.getElementById('swap-currency-btn');
    const shiftBtn = document.getElementById('calc-shift-btn');
    const copyBtn = document.getElementById('copy-result-btn');
    const historyBtn = document.getElementById('calc-history-btn');
    const keypadKeys = document.querySelectorAll('#calc-keypad button');

    // Selector Hoy / Predicción
    const dayBtns = document.querySelectorAll('.calc-day-btn');
    dayBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const day = btn.getAttribute('data-calcday');
        if (day && day !== this.selectedDay) {
          this.selectedDay = day;
          this.render();
        }
      });
    });

    ratePills.forEach(btn => {
      btn.addEventListener('click', () => {
        const newRateId = btn.getAttribute('data-rate');
        if (this.selectedRateId !== newRateId) {
          this.selectedRateId = newRateId;
          const rates = this.currentCountry.rates;
          const newRateObj = rates[newRateId];
          if (newRateObj && newRateObj.code) {
            const [baseCode, targetCode] = newRateObj.code.split('/');
            if (targetCode === 'USD' && baseCode !== 'USD') {
              this.fromCurrency = 'USD';
              this.toCurrency = baseCode;
            } else {
              this.fromCurrency = baseCode;
              this.toCurrency = targetCode;
            }
          }
          this.render();
        }
      });
    });

    const triggerSwap = () => {
      const temp = this.fromCurrency;
      this.fromCurrency = this.toCurrency;
      this.toCurrency = temp;
      this.calculate();
    };

    swapBtn?.addEventListener('click', triggerSwap);
    shiftBtn?.addEventListener('click', triggerSwap);

    copyBtn?.addEventListener('click', () => {
      const displayEl = document.getElementById('calc-equality-display');
      if (!displayEl) return;
      const textToCopy = displayEl.textContent.trim();

      navigator.clipboard.writeText(textToCopy).then(() => {
        copyBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4 text-emerald-400"></i>`;
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => {
          copyBtn.innerHTML = `<i data-lucide="copy" class="w-4 h-4 text-gray-400"></i>`;
          if (window.lucide) window.lucide.createIcons();
        }, 2000);
      }).catch(e => console.warn('Clipboard write error:', e));
    });

    historyBtn?.addEventListener('click', () => {
      this.openHistoryModal();
    });

    keypadKeys.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        this.handleKeyPress(key);
      });
    });
  }

  handleKeyPress(key) {
    if (key >= '0' && key <= '9') {
      if (this.expression === '0') {
        this.expression = key;
      } else {
        if (this.expression.length < 14) {
          this.expression += key;
        }
      }
    } else if (key === ',' || key === '.') {
      const lastToken = this.expression.split(/[\s+\-*\/]/).pop();
      if (!lastToken.includes('.') && !lastToken.includes(',')) {
        this.expression += ',';
      }
    } else if (key === '+' || key === '-' || key === '*' || key === '/') {
      const trimmed = this.expression.trim();
      const lastChar = trimmed.slice(-1);
      if (['+', '-', '*', '/'].includes(lastChar)) {
        this.expression = trimmed.slice(0, -1) + key;
      } else {
        this.expression += ` ${key} `;
      }
    } else if (key === 'C') {
      this.expression = '0';
    } else if (key === 'BACKSPACE') {
      const trimmed = this.expression.trim();
      if (trimmed.length > 1) {
        this.expression = trimmed.slice(0, -1).trim();
        if (this.expression === '') this.expression = '0';
      } else {
        this.expression = '0';
      }
    } else if (key === '=') {
      this.evaluateExpression();
      this.saveToHistory();
    }

    const rates = this.currentCountry.rates;
    const activeRateObj = rates[this.selectedRateId] || Object.values(rates)[0];
    const currentSym = this.getCurrencySymbol(this.fromCurrency);

    const displayInput = document.getElementById('calc-display-input');
    if (displayInput) {
      displayInput.textContent = `${this.expression} ${currentSym}`;
    }

    const modeBadge = document.getElementById('calc-mode-badge');
    if (modeBadge) {
      modeBadge.textContent = `${this.fromCurrency} → ${this.toCurrency}`;
    }

    this.calculate();
  }

  evaluateExpression() {
    try {
      const evalResult = evaluateMath(this.expression);
      if (!isNaN(evalResult) && isFinite(evalResult)) {
        this.expression = evalResult.toString().replace(/\./g, ',');
      }
    } catch (e) {}
  }

  saveToHistory() {
    const equalityEl = document.getElementById('calc-equality-display');
    if (!equalityEl) return;
    const rates = this.currentCountry.rates;
    const activeRateObj = rates[this.selectedRateId] || Object.values(rates)[0];

    calcHistoryService.addEntry({
      expression: this.expression,
      resultText: equalityEl.textContent.trim(),
      countryId: this.currentCountry.id,
      countryName: this.currentCountry.name,
      flagUrl: this.currentCountry.flagUrl,
      rateName: activeRateObj ? activeRateObj.name : '',
      rateId: this.selectedRateId,
      rateValue: activeRateObj ? activeRateObj.value : 1,
      fromCurrency: this.fromCurrency,
      toCurrency: this.toCurrency
    });
  }

  openHistoryModal() {
    let container = document.getElementById('calc-history-modal-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'calc-history-modal-container';
      document.body.appendChild(container);
    }

    const history = calcHistoryService.getHistory();

    container.innerHTML = `
      <div id="calc-history-backdrop" class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 animate-fade-in">
        <div class="w-full max-w-md bg-[#0F141C] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
          
          <!-- Modal Header -->
          <div class="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
            <div class="flex items-center space-x-2">
              <i data-lucide="history" class="w-5 h-5 text-emerald-400"></i>
              <h3 class="text-base font-extrabold text-white">Historial de Conversiones</h3>
            </div>
            <div class="flex items-center space-x-2">
              ${history.length > 0 ? `
                <button id="clear-calc-history-btn" type="button" class="text-xs text-red-400 hover:text-red-300 font-bold px-2 py-1 bg-red-500/10 rounded-lg border border-red-500/20">
                  Borrar todo
                </button>
              ` : ''}
              <button id="close-calc-history-btn" type="button" class="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white">
                <i data-lucide="x" class="w-5 h-5"></i>
              </button>
            </div>
          </div>

          <!-- History Content -->
          <div class="p-4 overflow-y-auto space-y-2.5 max-h-[65vh] custom-scroll">
            ${history.length === 0 ? `
              <div class="text-center py-10 bg-black/20 rounded-2xl border border-white/5 space-y-2">
                <i data-lucide="calculator" class="w-8 h-8 text-gray-600 mx-auto"></i>
                <p class="text-xs text-gray-400 font-semibold">Sin conversiones en el historial</p>
                <p class="text-[10px] text-gray-500">Realiza un cálculo y presiona = para guardarlo aquí.</p>
              </div>
            ` : `
              ${history.map(item => `
                <div data-id="${item.id}" class="calc-history-item glass-card-interactive rounded-2xl p-3 border border-white/10 flex items-center justify-between cursor-pointer hover:border-emerald-500/40">
                  <div class="flex items-center space-x-3">
                    <img src="${item.flagUrl}" alt="${item.countryName}" class="w-6 h-6 rounded-full object-cover">
                    <div>
                      <p class="text-xs font-black text-emerald-400">${item.resultText}</p>
                      <p class="text-[10px] text-gray-400">${item.rateName} • ${item.timestamp}</p>
                    </div>
                  </div>
                  <i data-lucide="arrow-up-right" class="w-4 h-4 text-cyan-400"></i>
                </div>
              `).join('')}
            `}
          </div>

        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Eventos del Modal
    const backdrop = document.getElementById('calc-history-backdrop');
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) container.innerHTML = '';
    });

    document.getElementById('close-calc-history-btn')?.addEventListener('click', () => {
      container.innerHTML = '';
    });

    document.getElementById('clear-calc-history-btn')?.addEventListener('click', () => {
      calcHistoryService.clearHistory();
      this.openHistoryModal();
    });

    const items = container.querySelectorAll('.calc-history-item');
    items.forEach(itemEl => {
      itemEl.addEventListener('click', () => {
        const id = parseInt(itemEl.getAttribute('data-id'));
        const entry = history.find(h => h.id === id);
        if (entry) {
          this.expression = entry.expression;
          this.selectedRateId = entry.rateId;
          this.fromCurrency = entry.fromCurrency;
          this.toCurrency = entry.toCurrency;
          container.innerHTML = '';
          this.render();
        }
      });
    });
  }

  calculate() {
    const rates = this.currentCountry.rates;
    const activeRateObj = rates[this.selectedRateId] || Object.values(rates)[0];
    if (!activeRateObj) return;

    const activeRate = this.getEffectiveRate(activeRateObj);
    const [baseCode, targetCode] = activeRateObj.code ? activeRateObj.code.split('/') : ['USD', this.currentCountry.currency.code];

    let numericAmount = 0;
    try {
      const res = evaluateMath(this.expression);
      if (!isNaN(res) && isFinite(res)) {
        numericAmount = res;
      }
    } catch (e) {
      numericAmount = parseFloat(this.expression.replace(/,/g, '.')) || 0;
    }

    let finalResult = 0;
    if (this.fromCurrency === baseCode && this.toCurrency === targetCode) {
      finalResult = numericAmount * activeRate;
    } else if (this.fromCurrency === targetCode && this.toCurrency === baseCode) {
      finalResult = numericAmount / activeRate;
    } else if (this.fromCurrency === this.toCurrency) {
      finalResult = numericAmount;
    } else {
      if (this.fromCurrency === baseCode) {
        finalResult = numericAmount * activeRate;
      } else {
        finalResult = numericAmount / activeRate;
      }
    }

    const equalityEl = document.getElementById('calc-equality-display');
    if (equalityEl) {
      const fromSym = this.getCurrencySymbol(this.fromCurrency);
      const toSym = this.getCurrencySymbol(this.toCurrency);

      const fromFormatted = numericAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const toFormatted = finalResult.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: finalResult < 10 ? 4 : 2 });

      equalityEl.textContent = `${fromSym} ${fromFormatted} = ${toFormatted} ${toSym}`;
    }
  }

  subscribeToUpdates() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = mockEngine.subscribe((rates, updatedId, action) => {
      if (action === 'rates_refreshed') {
        this.render();
      }
    });
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}


  // --- js/components/analytics.js ---





class AnalyticsView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.chart = null;
    this.selectedPeriod = '1M'; // 1W, 1M, 3M, 1Y
    this.selectedRateFilter = 'all'; // 'all' o ID de tasa específica
    this.historicalCache = {}; // Cache de datos históricos reales
    this.unsubscribe = null;
  }

  getPeriodDetails(period) {
    const map = {
      '1W': { short: '7 Días', text: 'Últimos 7 días' },
      '1M': { short: '30 Días', text: 'Últimos 30 días' },
      '3M': { short: '90 Días', text: 'Últimos 90 días' },
      '1Y': { short: '1 Año', text: 'Últimos 365 días' }
    };
    return map[period] || map['1M'];
  }

  getPillLabel(rateKey, rateObj) {
    if (!rateObj) return rateKey || '';
    if (rateKey === 'bcv') return 'BCV';
    if (rateKey === 'euro') return 'Euro';
    if (rateKey === 'paralelo' || rateObj.id === 'paralelo') return 'Paralelo';
    return rateObj.name.split(' ')[0];
  }

  /**
   * Obtiene días de historia según el período seleccionado
   */
  getDaysForPeriod(period) {
    switch (period) {
      case '1W': return 7;
      case '3M': return 90;
      case '1Y': return 365;
      default: return 30;
    }
  }

  /**
   * Fetch de datos históricos reales desde ve.dolarapi.com (1 punto/día hábil)
   * Endpoints: /v1/historicos/dolares/oficial | /v1/historicos/dolares/paralelo | /v1/historicos/euros
   * Respuesta: [{ fuente, promedio, fecha }]
   */
  async fetchHistoricalData(rateKey, days) {
    const endpointMap = {
      bcv: 'https://ve.dolarapi.com/v1/historicos/dolares/oficial',
      paralelo: 'https://ve.dolarapi.com/v1/historicos/dolares/paralelo',
      euro: 'https://ve.dolarapi.com/v1/historicos/euros'
    };
    // /v1/historicos/euros devuelve series oficial Y paralelo juntas: filtrar por fuente
    const fuenteMap = { bcv: 'oficial', paralelo: 'paralelo', euro: 'oficial' };
    const url = endpointMap[rateKey];
    const fuente = fuenteMap[rateKey];
    if (!url || !fuente) return null;

    if (this.historicalCache[rateKey]) {
      return this._filterHistorical(this.historicalCache[rateKey], days);
    }

    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;

      const parsed = data
        .filter(d => d && d.fuente === fuente && d.promedio && d.fecha)
        .map(d => ({
          date: String(d.fecha).split('T')[0],
          value: parseFloat(parseFloat(d.promedio).toFixed(2))
        }))
        .filter(d => d.date && typeof d.value === 'number' && !isNaN(d.value))
        .sort((a, b) => a.date.localeCompare(b.date));

      if (parsed.length === 0) return null;

      this.historicalCache[rateKey] = parsed;
      return this._filterHistorical(parsed, days);
    } catch (e) {
      console.warn(`Error fetching historical data for ${rateKey}:`, e);
    }

    return null; // Retorna null si falla, el gráfico mostrará un aviso
  }

  /**
   * Filtra la serie completa (cacheada) al período solicitado, en cliente.
   */
  _filterHistorical(series, days) {
    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - days);
    const fromStr = from.toISOString().split('T')[0];
    const toStr = today.toISOString().split('T')[0];
    return series.filter(d => d.date >= fromStr && d.date <= toStr);
  }

  /**
   * Convierte los datos históricos reales a formato para ApexCharts
   * Reduce puntos si son muchos para mejor visualización
   */
  processHistoricalForChart(historicalData, period) {
    if (!historicalData || historicalData.length === 0) return null;

    let data = [...historicalData];

    // Reducir puntos para mejor visualización según el período
    const maxPoints = { '1W': 7, '1M': 30, '3M': 30, '1Y': 24 };
    const targetPoints = maxPoints[period] || 30;

    if (data.length > targetPoints) {
      const step = Math.ceil(data.length / targetPoints);
      const sampled = [];
      for (let i = 0; i < data.length; i += step) {
        sampled.push(data[i]);
      }
      // Siempre incluir el último punto
      if (sampled[sampled.length - 1] !== data[data.length - 1]) {
        sampled.push(data[data.length - 1]);
      }
      data = sampled;
    }

    const labels = data.map(d => {
      const date = new Date(d.date + 'T12:00:00');
      if (period === '1Y') {
        return date.toLocaleDateString('es-VE', { month: 'short', year: '2-digit' });
      } else if (period === '3M') {
        return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
      } else {
        return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
      }
    });

    const values = data.map(d => d.value);

    return { labels, values };
  }

  render() {
    const currentCountry = mockEngine.getCurrentCountry();
    const rates = currentCountry.rates;
    const rateKeys = Object.keys(rates).filter(k => k !== '_meta');

    // Brecha cambiaria real del mercado venezolano: Dólar Paralelo vs BCV Oficial
    const bcvRate = rates.bcv;
    const paraleloRate = rates.paralelo;
    let gapPercent = 0;
    if (
      bcvRate && paraleloRate &&
      typeof bcvRate.value === 'number' && typeof paraleloRate.value === 'number' &&
      bcvRate.value > 0 && paraleloRate.value > 0
    ) {
      gapPercent = ((paraleloRate.value / bcvRate.value) - 1) * 100;
    }

    const periodDetails = this.getPeriodDetails(this.selectedPeriod);

    this.container.innerHTML = `
      <div class="space-y-4 pb-24 animate-fade-in max-w-md mx-auto">
        
        <!-- Header con selector de país -->
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-lg font-extrabold text-white leading-tight">Tendencias de Mercado</h2>
            <p class="text-xs text-gray-400 mt-0.5">Datos históricos oficiales BCV · ${currentCountry.name}</p>
          </div>

          <div class="bg-white/5 border border-white/10 text-cyan-300 text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center space-x-1.5">
            <img src="${currentCountry.flagUrl}" alt="${currentCountry.name}" class="w-4 h-4 rounded-full object-cover">
            <span>${currentCountry.currency.code}</span>
          </div>
        </div>

        <!-- Tarjetas de Métricas Principales (Brecha, Mín, Máx) -->
        <div class="grid grid-cols-3 gap-2">
          <!-- Brecha BCV vs Paralelo -->
          <div class="glass-card rounded-2xl p-3 text-center border border-white/10">
            <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Brecha BCV → Paralelo</span>
            <p class="text-lg font-black text-cyan-400 mt-0.5">${gapPercent > 0 ? `+${gapPercent.toFixed(2)}%` : '0.00%'}</p>
            <span class="text-[9px] text-gray-400 font-semibold block truncate">Mercado paralelo vs oficial</span>
          </div>

          <!-- Mínimo del Período (histórico real) -->
          <div class="glass-card rounded-2xl p-3 text-center border border-white/10">
            <span id="min-period-label" class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Mínimo (${periodDetails.short})</span>
            <p id="stat-min-value" class="text-sm font-black text-emerald-400 mt-1">— — —</p>
            <span class="text-[9px] text-gray-500 font-medium block">Piso oficial</span>
          </div>

          <!-- Máximo del Período (histórico real) -->
          <div class="glass-card rounded-2xl p-3 text-center border border-white/10">
            <span id="max-period-label" class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Máximo (${periodDetails.short})</span>
            <p id="stat-max-value" class="text-sm font-black text-amber-400 mt-1">— — —</p>
            <span class="text-[9px] text-gray-500 font-medium block">Techo oficial</span>
          </div>
        </div>

        <!-- Tarjeta del Gráfico ApexCharts -->
        <div class="glass-card rounded-3xl p-4 relative overflow-hidden space-y-3 border border-white/10 shadow-2xl">
          
          <!-- Filtros del Gráfico: Tasas y Períodos -->
          <div class="space-y-2">
            <!-- Píldoras de Tasas para filtrar -->
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <i data-lucide="line-chart" class="w-3.5 h-3.5 text-cyan-400"></i> Histórico de Mercado
              </span>
              <span class="text-[9px] text-emerald-400 font-bold flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
                Fuente: ve.dolarapi.com
              </span>
            </div>

            <div class="grid grid-cols-${Math.min(rateKeys.length + 1, 4)} gap-1 bg-black/40 p-1 rounded-2xl border border-white/10 w-full items-center" id="analytics-rate-filter">
              <button data-rate="all" class="w-full py-1 px-1 text-[11px] font-bold rounded-xl transition-all text-center truncate ${this.selectedRateFilter === 'all' ? 'bg-emerald-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                Todas
              </button>
              ${rateKeys.map(key => {
                const r = rates[key];
                const isSel = this.selectedRateFilter === key;
                const pillLabel = this.getPillLabel(key, r);
                return `
                  <button data-rate="${key}" class="w-full py-1 px-1 text-[11px] font-bold rounded-xl transition-all text-center truncate ${isSel ? 'bg-emerald-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                    ${pillLabel}
                  </button>
                `;
              }).join('')}
            </div>

            <!-- Selector de Período Temporal -->
            <div class="space-y-1.5 pt-1">
              <div class="flex bg-black/40 p-1 rounded-xl border border-white/10 justify-between" id="period-selector">
                ${[
                  { code: '1W', name: '1W (Semana)' },
                  { code: '1M', name: '1M (Mes)' },
                  { code: '3M', name: '3M (Trimestre)' },
                  { code: '1Y', name: '1Y (Año)' }
                ].map(p => `
                  <button data-period="${p.code}" title="${p.name}" class="flex-1 py-1.5 text-[11px] font-bold rounded-lg text-center transition-all ${this.selectedPeriod === p.code ? 'bg-cyan-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                    ${p.code}
                  </button>
                `).join('')}
              </div>

              <p id="period-info-text" class="text-[10px] text-gray-400 font-semibold text-right pt-0.5 px-1">
                ${periodDetails.text}
              </p>
            </div>

          </div>

          <!-- Contenedor del Gráfico -->
          <div id="apex-analytics-chart" class="w-full h-60 pt-1 relative">
            <!-- Skeleton loader mientras carga -->
            <div id="chart-loading-skeleton" class="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div class="w-8 h-8 border-2 border-cyan-500/40 border-t-cyan-400 rounded-full animate-spin"></div>
              <p class="text-[10px] text-gray-400 font-semibold">Cargando datos históricos BCV...</p>
            </div>
          </div>
        </div>

        <!-- Fuente Oficial y Señales -->
        <div class="space-y-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Fuente Oficial</h3>

          <div class="glass-card rounded-2xl p-3 flex items-center justify-between border border-white/5">
            <div class="flex items-center space-x-3">
              <div class="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <i data-lucide="landmark" class="w-4 h-4"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-gray-100">Banco Central de Venezuela</h4>
                <p class="text-[10px] text-gray-400">Tasas oficiales publicadas en bcv.org.ve</p>
              </div>
            </div>
            <span class="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">BCV</span>
          </div>

          <div class="glass-card rounded-2xl p-3 flex items-center justify-between border border-white/5">
            <div class="flex items-center space-x-3">
              <div class="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <i data-lucide="shield-check" class="w-4 h-4"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-gray-100">Publicación Oficial</h4>
                <p class="text-[10px] text-gray-400">${currentCountry.officialSchedule || 'Monitoreo diario del Banco Central'}</p>
              </div>
            </div>
            <span class="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">Oficial</span>
          </div>
        </div>

      </div>
    `;

    this.initChart();
    this.attachEvents();
    this.subscribeToUpdates();
    if (window.lucide) window.lucide.createIcons();
  }

  async initChart() {
    const chartContainer = document.getElementById('apex-analytics-chart');
    if (!chartContainer || !window.ApexCharts) return;

    const currentCountry = mockEngine.getCurrentCountry();
    const rates = currentCountry.rates;
    const rateKeys = Object.keys(rates).filter(k => k !== '_meta');

    let activeKeys = rateKeys;
    if (this.selectedRateFilter !== 'all' && rates[this.selectedRateFilter]) {
      activeKeys = [this.selectedRateFilter];
    }

    const days = this.getDaysForPeriod(this.selectedPeriod);
    const paletteColors = ['#06B6D4', '#10B981', '#F59E0B', '#8B5CF6'];
    const seriesData = [];
    let categories = [];
    let hasRealData = false;

    // Rango real del período sobre la tasa activa (BCV por defecto con "Todas"):
    // las tarjetas dicen "Piso/Techo oficial", así que nunca mezclan series.
    const rangeKey = this.selectedRateFilter !== 'all' && rates[this.selectedRateFilter]
      ? this.selectedRateFilter
      : 'bcv';
    let realMin = Infinity;
    let realMax = -Infinity;
    let hasRangeData = false;

    // Intentar cargar datos históricos reales para cada tasa activa
    for (let index = 0; index < activeKeys.length; index++) {
      const key = activeKeys[index];
      const rateObj = rates[key];

      const historicalRaw = await this.fetchHistoricalData(key, days);
      let chartData = null;

      if (historicalRaw && historicalRaw.length > 0) {
        chartData = this.processHistoricalForChart(historicalRaw, this.selectedPeriod);
        hasRealData = true;
        if (key === rangeKey) {
          for (const point of historicalRaw) {
            if (typeof point.value === 'number' && !isNaN(point.value)) {
              if (point.value < realMin) realMin = point.value;
              if (point.value > realMax) realMax = point.value;
              hasRangeData = true;
            }
          }
        }
      }

      if (chartData) {
        if (index === 0) {
          categories = chartData.labels;
        }
        seriesData.push({
          name: rateObj.name,
          data: chartData.values,
          color: paletteColors[index % paletteColors.length]
        });
      } else {
        // Si no hay datos históricos reales, usar valor actual como referencia con aviso
        seriesData.push({
          name: rateObj.name,
          data: [rateObj.value || 0],
          color: paletteColors[index % paletteColors.length]
        });
      }
    }

    // Quitar skeleton loader
    const skeleton = document.getElementById('chart-loading-skeleton');
    if (skeleton) skeleton.remove();

    if (!hasRealData || seriesData.every(s => s.data.length <= 1)) {
      // Mostrar aviso de datos no disponibles
      chartContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full gap-2 py-8">
          <i data-lucide="wifi-off" class="w-8 h-8 text-gray-500"></i>
          <p class="text-[11px] text-gray-400 font-semibold text-center">Datos históricos no disponibles</p>
          <p class="text-[10px] text-gray-500 text-center">Verifica tu conexión a Internet para cargar el historial oficial del BCV</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // Actualizar tarjetas de Mínimo/Máximo con el rango real del período
    const minStatEl = document.getElementById('stat-min-value');
    const maxStatEl = document.getElementById('stat-max-value');
    if (minStatEl && maxStatEl) {
      if (hasRangeData && realMin !== Infinity && realMax !== -Infinity) {
        minStatEl.textContent = formatCurrency(realMin, currentCountry.currency.code, 2);
        maxStatEl.textContent = formatCurrency(realMax, currentCountry.currency.code, 2);
      } else {
        minStatEl.textContent = '— — —';
        maxStatEl.textContent = '— — —';
      }
    }

    const options = {
      series: seriesData.map(s => ({ name: s.name, data: s.data })),
      chart: {
        type: 'area',
        height: 220,
        toolbar: { show: false },
        background: 'transparent',
        sparkline: { enabled: false },
        animations: { enabled: true, speed: 400 }
      },
      colors: seriesData.map(s => s.color),
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.4,
          opacityTo: 0.05,
          stops: [0, 100]
        }
      },
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 2.5 },
      xaxis: {
        categories: categories,
        labels: { style: { colors: themeService.getTheme() === 'light' ? '#64748B' : '#9CA3AF', fontSize: '9px', fontWeight: 600 } },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: {
          style: { colors: themeService.getTheme() === 'light' ? '#64748B' : '#9CA3AF', fontSize: '9px', fontWeight: 600 },
          formatter: (val) => val.toFixed(val < 10 ? 2 : 0)
        }
      },
      grid: {
        borderColor: themeService.getTheme() === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)',
        strokeDashArray: 4
      },
      legend: {
        labels: { colors: themeService.getTheme() === 'light' ? '#0F172A' : '#E5E7EB', useSeriesColors: false },
        fontSize: '10px',
        position: 'top',
        horizontalAlign: 'right',
        markers: { radius: 12 }
      },
      tooltip: {
        theme: themeService.getTheme() === 'light' ? 'light' : 'dark',
        x: { show: true },
        y: {
          formatter: (val) => `${val.toLocaleString('es-VE')} ${currentCountry.currency.code}`
        }
      }
    };

    if (this.chart) {
      this.chart.destroy();
    }
    this.chart = new ApexCharts(chartContainer, options);
    this.chart.render();
  }

  attachEvents() {
    const periodBtns = document.querySelectorAll('#period-selector button');
    periodBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedPeriod = btn.getAttribute('data-period');
        const details = this.getPeriodDetails(this.selectedPeriod);

        periodBtns.forEach(b => {
          const isSel = b.getAttribute('data-period') === this.selectedPeriod;
          b.className = `flex-1 py-1.5 text-[11px] font-bold rounded-lg text-center transition-all ${isSel ? 'bg-cyan-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}`;
        });

        const infoText = document.getElementById('period-info-text');
        if (infoText) infoText.textContent = details.text;

        const minLabel = document.getElementById('min-period-label');
        if (minLabel) minLabel.textContent = `Mínimo (${details.short})`;

        const maxLabel = document.getElementById('max-period-label');
        if (maxLabel) maxLabel.textContent = `Máximo (${details.short})`;

        this.initChart();
      });
    });

    const rateFilterBtns = document.querySelectorAll('#analytics-rate-filter button');
    rateFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedRateFilter = btn.getAttribute('data-rate');
        rateFilterBtns.forEach(b => {
          const isSel = b.getAttribute('data-rate') === this.selectedRateFilter;
          b.className = `px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap ${isSel ? 'bg-emerald-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}`;
        });
        this.initChart();
      });
    });
  }

  subscribeToUpdates() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = mockEngine.subscribe((rates, updatedId, action) => {
      if (action === 'rates_refreshed') {
        this.render();
      }
    });
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}


  // --- js/components/settings.js ---






class SettingsView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.unsubscribe = null;
  }

  getConnectionStatus(rates) {
    const meta = (rates && rates._meta) || {};
    const src = meta.source || 'live';
    switch (src) {
      case 'stale':
        return { label: 'Conectado · Último dato', cls: 'text-amber-400', dot: 'bg-amber-400' };
      case 'cache':
        return { label: 'Conectado · Caché', cls: 'text-gray-400', dot: 'bg-gray-400' };
      case 'placeholder':
      case 'offline':
        return { label: 'Sin conexión', cls: 'text-red-400', dot: 'bg-red-400' };
      default:
        return { label: 'Conectado', cls: 'text-emerald-400', dot: 'bg-emerald-400' };
    }
  }

  render() {
    const isNotifEnabled = notificationService.isEnabled();
    const currentTheme = themeService.getTheme();
    const status = this.getConnectionStatus(mockEngine.getRates());

    this.container.innerHTML = `
      <div class="space-y-4 pb-24 animate-fade-in max-w-md mx-auto">
        
        <!-- Header de Ajustes -->
        <div class="flex items-center space-x-2">
          <div class="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <i data-lucide="settings" class="w-5 h-5"></i>
          </div>
          <div>
            <h2 class="text-lg font-extrabold text-white leading-tight">Ajustes y Preferencias</h2>
            <p class="text-xs text-gray-400 mt-0.5">Configuración general de Dolarfy Mobile</p>
          </div>
        </div>

        <!-- 1. Sección: Preferencias Principales -->
        <div class="space-y-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Preferencias del Sistema</h3>

          <!-- Tema de la Aplicación -->
          <div class="glass-card rounded-2xl p-3.5 flex items-center justify-between border border-white/10">
            <div class="flex items-center space-x-3">
              <div class="p-2 rounded-xl bg-white/5 text-amber-400">
                <i data-lucide="${currentTheme === 'light' ? 'sun' : 'moon'}" class="w-4 h-4"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-gray-100">Tema de la Aplicación</h4>
                <p class="text-[10px] text-gray-400">Selecciona el modo visual de la interfaz.</p>
              </div>
            </div>

            <div id="settings-theme-selector" class="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 space-x-1">
              <button type="button" data-theme="dark" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${currentTheme === 'dark' ? 'bg-cyan-500 text-slate-950 shadow-md font-black' : 'text-gray-400 hover:text-white'}">
                <i data-lucide="moon" class="w-3.5 h-3.5"></i>
                <span>Oscuro</span>
              </button>
              <button type="button" data-theme="light" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${currentTheme === 'light' ? 'bg-cyan-500 text-slate-950 shadow-md font-black' : 'text-gray-400 hover:text-white'}">
                <i data-lucide="sun" class="w-3.5 h-3.5"></i>
                <span>Claro</span>
              </button>
            </div>
          </div>



          <!-- Alertas de Tasa Diaria -->
          <div class="glass-card rounded-2xl p-3.5 flex items-center justify-between border border-white/10">
            <div class="flex items-center space-x-3">
              <div class="p-2 rounded-xl bg-white/5 text-emerald-400">
                <i data-lucide="bell" class="w-4 h-4"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-gray-100">Alertas de Tasa Diaria</h4>
                <p class="text-[10px] text-gray-400">Notificar al emitirse la nueva tasa del Banco Central.</p>
              </div>
            </div>

            <button id="settings-notif-toggle" type="button" class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isNotifEnabled ? 'bg-cyan-500' : 'bg-gray-700'}">
              <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isNotifEnabled ? 'translate-x-5' : 'translate-x-0'}"></span>
            </button>
          </div>
        </div>

        <!-- 2. Sección: Almacenamiento y Datos -->
        <div class="space-y-2 pt-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Gestión de Datos</h3>

          <div class="glass-card rounded-2xl p-3.5 flex items-center justify-between border border-white/10">
            <div class="flex items-center space-x-3">
              <div class="p-2 rounded-xl bg-white/5 text-amber-400">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-gray-100">Historial de Conversiones</h4>
                <p class="text-[10px] text-gray-400">Eliminar registros guardados de la calculadora.</p>
              </div>
            </div>

            <button id="settings-clear-history-btn" type="button" class="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold transition-all active:scale-95">
              Limpiar
            </button>
          </div>
        </div>

        <!-- 3. Sección: Información de la Aplicación -->
        <div class="space-y-2 pt-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Información del Sistema</h3>

          <div class="glass-card rounded-2xl p-4 space-y-3 border border-white/10">
            <div class="flex items-center justify-between border-b border-white/5 pb-2.5">
              <span class="text-xs font-semibold text-gray-300">Versión</span>
              <span class="text-xs font-extrabold text-cyan-400">${APP_VERSION}</span>
            </div>

            <div class="flex items-center justify-between border-b border-white/5 pb-2.5">
              <span class="text-xs font-semibold text-gray-300">Estado de APIs Bancarias</span>
              <span class="text-xs font-bold ${status.cls} flex items-center gap-1">
                <span class="w-2 h-2 rounded-full ${status.dot} animate-pulse"></span> ${status.label}
              </span>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-gray-300">Desarrollo</span>
              <span class="text-xs font-bold text-cyan-300">Adrian Bello</span>
            </div>
          </div>
        </div>

      </div>
    `;

    this.attachEvents();
    this.subscribeToUpdates();
    if (window.lucide) window.lucide.createIcons();
  }

  subscribeToUpdates() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = mockEngine.subscribe((rates, updatedId, action) => {
      if (action === 'rates_refreshed') {
        this.render();
      }
    });
  }

  attachEvents() {
    const notifToggle = document.getElementById('settings-notif-toggle');
    const clearHistoryBtn = document.getElementById('settings-clear-history-btn');
    const themeSelector = document.getElementById('settings-theme-selector');

    themeSelector?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-theme]');
      if (btn) {
        const selectedTheme = btn.getAttribute('data-theme');
        if (selectedTheme && selectedTheme !== themeService.getTheme()) {
          themeService.setTheme(selectedTheme);
          this.render();
        }
      }
    });

    notifToggle?.addEventListener('click', async () => {
      await notificationService.toggleNotifications();
      this.render();
      document.dispatchEvent(new CustomEvent('dolarfy:notification_toggled'));
    });

    clearHistoryBtn?.addEventListener('click', () => {
      calcHistoryService.clearHistory();
      clearHistoryBtn.textContent = '¡Limpiado!';
      clearHistoryBtn.className = 'px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold transition-all';
      setTimeout(() => {
        clearHistoryBtn.textContent = 'Limpiar';
        clearHistoryBtn.className = 'px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold transition-all active:scale-95';
      }, 2000);
    });
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}


  // --- js/app.js ---









class App {
  constructor() {
    this.currentView = null;
    this.activeTab = 'dashboard'; // 'dashboard', 'calculator', 'analytics', 'settings'
    this.notificationModal = new NotificationModal();
    this.init();
  }

  init() {
    themeService.init();
    if (window.lucide) window.lucide.createIcons();
    this.bindNavigation();
    this.bindNotificationBell();
    this.bindRefreshButton();
    this.updateHeaderBellUI();
    this.navigateTo(this.activeTab);

    // Programar recordatorio diario de la tasa BCV (17:00 VET) si las alertas están activas
    notificationService.scheduleDailyReminder();

    // Suscribir a cambios globales en mockEngine
    mockEngine.subscribe((rates, updatedRateId, action) => {
      if (action === 'rates_refreshed') {
        notificationService.checkDailyUpdate(mockEngine.getCurrentCountry(), rates);
        // El refresco visual lo maneja cada vista activa vía su propio subscribe,
        // lo que preserva su estado (expresión, día seleccionado, etc.).
      }
    });

    // Escuchar toggle de notificaciones
    document.addEventListener('dolarfy:notification_toggled', () => {
      this.updateHeaderBellUI();
    });

    // Escuchar cambios de tema
    document.addEventListener('dolarfy:theme_changed', () => {
      if (this.activeTab === 'analytics' && this.currentView) {
        this.navigateTo('analytics', true);
      }
    });
  }

  bindNotificationBell() {
    document.addEventListener('click', (e) => {
      const bellBtn = e.target.closest('#header-bell-btn');
      if (bellBtn) {
        e.preventDefault();
        e.stopPropagation();
        this.notificationModal.open();
      }
    });
  }

  bindRefreshButton() {
    document.addEventListener('click', async (e) => {
      const refreshBtn = e.target.closest('#header-refresh-btn');
      if (refreshBtn) {
        e.preventDefault();
        e.stopPropagation();

        const icon = refreshBtn.querySelector('i, svg');
        if (icon) icon.classList.add('animate-spin');

        try {
          await mockEngine.syncRealRates(true);
        } finally {
          setTimeout(() => {
            if (icon) icon.classList.remove('animate-spin');
          }, 600);
        }
      }
    });
  }

  updateHeaderBellUI() {
    const isEnabled = notificationService.isEnabled();
    const dotEl = document.getElementById('header-bell-dot');
    if (dotEl) {
      dotEl.style.display = isEnabled ? 'block' : 'none';
    }
  }

  bindNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = item.getAttribute('data-tab');
        if (tab && tab !== this.activeTab) {
          this.navigateTo(tab);
        }
      });
    });
  }

  navigateTo(tab, forceReload = false) {
    if (!forceReload && this.activeTab === tab && this.currentView) {
      return;
    }

    if (this.currentView && typeof this.currentView.destroy === 'function') {
      this.currentView.destroy();
    }

    this.activeTab = tab;
    this.updateBottomNavUI(tab);

    const mainContainer = 'app-view-container';
    
    switch (tab) {
      case 'dashboard':
        this.currentView = new DashboardView(mainContainer);
        break;
      case 'calculator':
        this.currentView = new CalculatorView(mainContainer);
        break;
      case 'analytics':
        this.currentView = new AnalyticsView(mainContainer);
        break;
      case 'settings':
        this.currentView = new SettingsView(mainContainer);
        break;
      default:
        this.currentView = new DashboardView(mainContainer);
    }

    this.currentView.render();
  }

  updateBottomNavUI(activeTab) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const tab = item.getAttribute('data-tab');
      const label = item.querySelector('span');

      if (tab === activeTab) {
        item.className = 'nav-item flex flex-col items-center justify-center text-cyan-400 font-bold transition-all relative';
        if (label) label.className = 'text-[11px] font-bold mt-1 text-cyan-400';
      } else {
        item.className = 'nav-item flex flex-col items-center justify-center text-gray-500 hover:text-gray-300 font-medium transition-all';
        if (label) label.className = 'text-[11px] font-medium mt-1 text-gray-500';
      }
    });
  }
}

// Inicializar la aplicación de forma segura si el DOM ya está listo
const startApp = () => {
  // Registrar Service Worker (solo en contextos seguros / Capacitor)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  if (!window.dolarfyApp) {
    window.dolarfyApp = new App();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}


})();
