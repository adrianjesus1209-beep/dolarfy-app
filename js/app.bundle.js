/* Dolarfy Standalone Bundle */
(function() {
  "use strict";

  // --- js/constants.js ---
/**
 * Constantes globales de Dolarfy
 */

const APP_VERSION = '1.0.8';

// Clave de caché de tasas en localStorage. v4: soporte directo BCV en vivo + notificaciones exactas.
const RATES_CACHE_VERSION = 'v4';
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

const parseSpanishDateToIso = (text) => {
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

const isoToShortDate = (iso) => {
  if (!iso) return '';
  const parts = String(iso).slice(0, 10).split('-');
  if (parts.length !== 3) return String(iso);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

/**
 * Calcula dinámicamente el nombre del próximo día hábil bancario según la fecha actual en VET (UTC-4)
 * o la Fecha Valor publicada por el BCV.
 */
const getNextBusinessDayName = (rates) => {
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
const getPredictionKey = (rates) => {
  const bcvNext = rates?.bcv?.nextDay;
  if (!bcvNext || !bcvNext.published || !bcvNext.value) return null;
  return `pred_${bcvNext.date || ''}_${bcvNext.value}`;
};

/**
 * Verfica si el usuario ya vio/leyó el aviso rojo de la predicción actual
 */
const isPredictionRead = (rates) => {
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
const markPredictionRead = (rates) => {
  const key = getPredictionKey(rates);
  if (key) {
    try {
      localStorage.setItem('dolarfy_prediction_read_key', key);
    } catch {}
  }
};




  // --- js/utils/mathEval.js ---
/**
 * Evaluador matemático seguro y preciso para Dolarfy.
 * Reemplaza el uso de eval() y new Function() en la calculadora.
 * Soporta + - * /, paréntesis, decimales con coma o punto, y previene divisiones por cero.
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

    if ((ch >= '0' && ch <= '9') || ch === ',' || ch === '.') {
      let j = i;
      let decimalSeen = false;
      while (j < n) {
        const c = expr[j];
        if (c >= '0' && c <= '9') {
          j++;
          continue;
        }
        if ((c === ',' || c === '.') && !decimalSeen) {
          decimalSeen = true;
          j++;
          continue;
        }
        break;
      }
      let raw = expr.slice(i, j).replace(/,/g, '.');
      if (raw === '.' || raw === '') raw = '0';
      const num = parseFloat(raw);
      tokens.push({ type: 'num', value: isNaN(num) ? 0 : num });
      i = j;
      continue;
    }

    throw new Error(`Carácter inesperado: ${ch}`);
  }

  return tokens;
}

function evaluateMath(expr) {
  if (typeof expr !== 'string' || expr.trim() === '') return 0;

  const tokens = tokenize(expr.trim());
  if (tokens.length === 0) return 0;

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
    if (!t) return 0;
    if (t.type === 'num') return t.value;
    if (t.type === 'op' && t.value === '(') {
      const value = parseExpr();
      const close = next();
      if (!close || close.type !== 'op' || close.value !== ')') {
        return value;
      }
      return value;
    }
    return 0;
  }

  function parseTerm() {
    let value = parseUnary();
    while (true) {
      const t = peek();
      if (t && t.type === 'op' && (t.value === '*' || t.value === '/')) {
        next();
        const rhs = parseUnary();
        if (t.value === '*') {
          value = value * rhs;
        } else {
          if (rhs === 0) {
            throw new Error('División entre cero');
          }
          value = value / rhs;
        }
        value = Math.round((value + Number.EPSILON) * 1e8) / 1e8;
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
        if (t.value === '+') value = value + rhs;
        else value = value - rhs;
        value = Math.round((value + Number.EPSILON) * 1e8) / 1e8;
      } else {
        break;
      }
    }
    return value;
  }

  const result = parseExpr();
  return isFinite(result) ? result : 0;
}


  // --- js/utils/toast.js ---
function showToast(message, title = 'Dolarfy', icon = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-[200] w-full max-w-xs space-y-2 pointer-events-none px-4';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto bg-[#111622]/95 border border-cyan-500/30 text-white rounded-2xl p-3.5 shadow-2xl backdrop-blur-xl flex items-start space-x-3 animate-fade-in transition-all duration-300 transform scale-100';

  toast.innerHTML = `
    <div class="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 shrink-0 mt-0.5">
      <i data-lucide="${icon}" class="w-4 h-4"></i>
    </div>
    <div class="flex-1 min-w-0 pr-1">
      <h4 class="text-xs font-extrabold text-white">${title}</h4>
      <p class="text-[11px] text-gray-300 font-medium leading-snug mt-0.5">${message.replace(/\n/g, '<br>')}</p>
    </div>
    <button type="button" class="text-gray-500 hover:text-white p-1 text-xs shrink-0 cursor-pointer">
      <i data-lucide="x" class="w-3.5 h-3.5"></i>
    </button>
  `;

  const closeBtn = toast.querySelector('button');
  const removeToast = () => {
    toast.classList.add('opacity-0', 'scale-95', '-translate-y-2');
    setTimeout(() => toast.remove(), 300);
  };

  closeBtn?.addEventListener('click', removeToast);
  container.appendChild(toast);

  if (window.lucide) window.lucide.createIcons();

  setTimeout(removeToast, 4000);
}

function showDialogModal({ title, body, icon = 'info' }) {
  let container = document.getElementById('dialog-modal-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'dialog-modal-container';
    document.body.appendChild(container);
  }

  container.innerHTML = `
    <div id="dialog-backdrop" class="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
      <div class="w-full max-w-sm bg-[#111622] border border-cyan-500/30 rounded-3xl shadow-2xl p-5 space-y-4 animate-scale-up">
        
        <div class="flex items-center space-x-3">
          <div class="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
            <i data-lucide="${icon}" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-base font-extrabold text-white">${title}</h3>
          </div>
        </div>

        <div class="text-xs text-gray-300 leading-relaxed bg-black/40 p-3.5 rounded-2xl border border-white/5 space-y-2 max-h-60 overflow-y-auto">
          ${body.replace(/\n/g, '<br>')}
        </div>

        <button id="close-dialog-btn" type="button" class="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs shadow-md transition-all active:scale-95 cursor-pointer">
          Entendido
        </button>

      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const backdrop = document.getElementById('dialog-backdrop');
  const closeBtn = document.getElementById('close-dialog-btn');

  const close = () => { container.innerHTML = ''; };
  backdrop?.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  closeBtn?.addEventListener('click', close);
}


  // --- js/countriesData.js ---
/**
 * Catálogo de países y tasas financieras de Dolarfy
 * Los valores base sirven de respaldo instantáneo para el arranque offline
 * y se sincronizan inmediatamente con datos en vivo en runtime.
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
        value: 888.12,
        change: 0.09,
        currency: 'VES',
        type: 'official',
        icon: 'building-2',
        nextDay: null
      },
      paralelo: {
        id: 'paralelo',
        name: 'USDT (Binance P2P)',
        code: 'USDT/VES',
        value: 1004.03,
        change: 0.35,
        currency: 'VES',
        type: 'crypto',
        icon: 'coins',
        nextDay: null
      },
      euro: {
        id: 'euro',
        name: 'Euro Oficial (BCV)',
        code: 'EUR/VES',
        value: 989.72,
        change: 0.12,
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
 * Fuentes en Tiempo Real:
 * 1. Puente Nativo Android (window.DolarfyNative) para conexión directa a bcv.org.ve y Binance P2P sin CORS ni bloqueos SSL.
 * 2. Lector directo BCV (bcv.org.ve vía Jina/Proxy PHP) para detectar al instante la Fecha Valor apenas se publica (~4:20 PM VET).
 * 3. DolarApi (ve.dolarapi.com) y DolarApi Históricos para tasa vigente del día e historial oficial.
 */




const REQUEST_TIMEOUT_MS = 7000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || REQUEST_TIMEOUT_MS);
  const headers = { 'Accept': 'application/json, text/html, text/plain, */*', ...(options.headers || {}) };

  try {
    return await fetch(url, { ...options, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extrae USD, EUR, Fecha Valor ISO y fecha corta DD/MM/YYYY desde HTML crudo de bcv.org.ve o Markdown de lector directo
 */
function parseBcvPayload(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const toNum = (s) => {
    if (!s) return null;
    const cleaned = String(s).trim().replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return !isNaN(n) && n > 0 ? parseFloat(n.toFixed(2)) : null;
  };

  // 1. Formato HTML directo de bcv.org.ve
  const htmlUsd = rawText.match(/id="dolar"[\s\S]{0,800}?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i);
  const htmlEur = rawText.match(/id="euro"[\s\S]{0,800}?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i);
  const htmlIso = rawText.match(/Fecha\s+Valor[\s\S]{0,500}?content="(\d{4}-\d{2}-\d{2})/i);
  const htmlFechaText = rawText.match(/Fecha\s+Valor[\s\S]{0,500}?<span[^>]*>([^<]+)<\/span>/i);

  if (htmlUsd) {
    const usd = toNum(htmlUsd[1]);
    const eur = htmlEur ? toNum(htmlEur[1]) : null;
    const fechaText = htmlFechaText ? htmlFechaText[1].trim().replace(/\s+/g, ' ') : '';
    const isoDate = (htmlIso ? htmlIso[1] : null) || parseSpanishDateToIso(fechaText);
    if (usd) {
      return {
        status: 'ok',
        usd,
        eur,
        isoDate,
        shortDate: isoToShortDate(isoDate),
        fecha: fechaText || (isoDate ? isoToShortDate(isoDate) : 'Oficial BCV')
      };
    }
  }

  // 2. Formato Markdown de lector en vivo (r.jina.ai/https://www.bcv.org.ve/)
  const mdUsd = rawText.match(/\bUSD\b[\s\S]{0,120}?\*\*([\d.,]+)\*\*/i);
  const mdEur = rawText.match(/\bEUR\b[\s\S]{0,120}?\*\*([\d.,]+)\*\*/i);
  const mdFecha = rawText.match(/Fecha\s+Valor\s*:\s*([^\n\r*]+)/i);

  if (mdUsd) {
    const usd = toNum(mdUsd[1]);
    const eur = mdEur ? toNum(mdEur[1]) : null;
    const fechaText = mdFecha ? mdFecha[1].trim().replace(/\s+/g, ' ') : '';
    const isoDate = parseSpanishDateToIso(fechaText);
    if (usd) {
      return {
        status: 'ok',
        usd,
        eur,
        isoDate,
        shortDate: isoToShortDate(isoDate),
        fecha: fechaText || (isoDate ? isoToShortDate(isoDate) : 'Oficial BCV')
      };
    }
  }

  return null;
}

// Cadencia por fuente (evita saturar peticiones pero garantiza detección en tiempo real)
const API_SOURCE_CONFIG = {
  proxy: { ttlMs: 15 * 1000 },
  bcvDirect: { ttlMs: 25 * 1000 },
  binance: { ttlMs: 25 * 1000 },
  dolarapi: { ttlMs: 30 * 1000 },
  histDolarapi: { ttlMs: 60 * 1000 }
};

const BACKOFF_BASE_MS = 5 * 1000;
const BACKOFF_MAX_MS = 60 * 1000;

class ApiService {
  constructor() {
    this.CACHE_TTL_MS = 30 * 1000;                      // 30s
    this.STALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;    // 7 días máximo
    this.isSyncing = false;
    this._inflightPromise = null;
    this._lastRates = null;
    this._lastFetchedAt = 0;
    this._sourceState = {};
    this._hasPhpProxy = null;                           // null: no probado, true/false: verificado
  }

  _fetch(url, options = {}) {
    return fetchWithTimeout(url, options);
  }

  _decorate(rates, source = 'live', extra = {}) {
    rates._meta = { source, fetchedAt: extra.fetchedAt || Date.now(), ...extra };
    return rates;
  }

  _shouldFetchSource(source, force = false) {
    if (force) return true;
    const cfg = API_SOURCE_CONFIG[source];
    if (!cfg) return true;
    const state = this._sourceState[source];
    if (!state) return true;
    return !state.nextAllowedAt || Date.now() >= state.nextAllowedAt;
  }

  _markSource(source, ok) {
    const cfg = API_SOURCE_CONFIG[source] || { ttlMs: 30000 };
    const state = (this._sourceState[source] = this._sourceState[source] || {});
    if (ok) {
      state.consecutiveFailures = 0;
      state.nextAllowedAt = Date.now() + cfg.ttlMs;
    } else {
      state.consecutiveFailures = (state.consecutiveFailures || 0) + 1;
      const backoff = Math.min(
        BACKOFF_MAX_MS,
        BACKOFF_BASE_MS * Math.pow(2, state.consecutiveFailures - 1)
      );
      state.nextAllowedAt = Date.now() + backoff;
    }
  }

  async _request({ source, url, options = {}, parse = 'json', force = false }) {
    if (!this._shouldFetchSource(source, force)) return { status: 'skip', data: null };
    try {
      const res = await this._fetch(url, options);
      if (!res.ok) return { status: 'fail', data: null };
      const data = parse === 'json' ? await res.json() : await res.text();
      return { status: 'ok', data };
    } catch (e) {
      return { status: 'fail', data: null };
    }
  }

  /**
   * Detecta si la app está siendo servida desde XAMPP/Apache con soporte para api/proxy.php
   */
  async checkPhpProxy() {
    if (this._hasPhpProxy !== null) return this._hasPhpProxy;

    if (typeof location !== 'undefined' && (location.protocol === 'file:' || location.hostname === 'localhost' && window.DolarfyNative)) {
      this._hasPhpProxy = false;
      return false;
    }

    try {
      const res = await fetchWithTimeout('api/proxy.php?action=check', { timeout: 1500 });
      if (res.ok) {
        const json = await res.json();
        this._hasPhpProxy = Boolean(json && json.proxy === 'active');
        return this._hasPhpProxy;
      }
    } catch (e) {}

    this._hasPhpProxy = false;
    return false;
  }

  /**
   * Consulta al puente nativo de Android (window.DolarfyNative) si está disponible en la APK
   */
  _fetchFromAndroidNative(force = false) {
    try {
      if (typeof window !== 'undefined' && window.DolarfyNative) {
        if (typeof window.DolarfyNative.requestLiveSync === 'function') {
          window.DolarfyNative.requestLiveSync(Boolean(force));
        }
        if (typeof window.DolarfyNative.getCachedLivePayload === 'function') {
          const raw = window.DolarfyNative.getCachedLivePayload();
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && (parsed.bcv || parsed.binance)) {
              return parsed;
            }
          }
        }
      }
    } catch (e) {}
    return null;
  }

  /**
   * Consulta directa al proxy PHP local si existe (Binance P2P + BCV Oficial sin CORS)
   */
  async _fetchFromPhpProxy(force = false) {
    const hasProxy = await this.checkPhpProxy();
    if (!hasProxy) return null;

    try {
      const res = await this._request({
        source: 'proxy',
        url: 'api/proxy.php?action=all',
        options: { timeout: 4500 },
        force
      });

      if (res.status === 'ok' && res.data) {
        this._markSource('proxy', true);
        return res.data;
      }
    } catch (e) {}

    this._markSource('proxy', false);
    return null;
  }

  /**
   * Consulta directa en tiempo real al portal oficial del BCV (bcv.org.ve)
   * Funciona en navegadores y WebViews sin depender de que DolarApi actualice su base de datos.
   */
  async _fetchBcvDirectWeb(force = false) {
    if (!this._shouldFetchSource('bcvDirect', force)) {
      return { status: 'skip', bcv: null };
    }

    try {
      const cb = Math.floor(Date.now() / 15000);
      const res = await this._fetch(`https://r.jina.ai/https://www.bcv.org.ve/?_cb=${cb}`, {
        timeout: 6500
      });
      if (res.ok) {
        const text = await res.text();
        const parsed = parseBcvPayload(text);
        if (parsed && parsed.usd > 0) {
          this._markSource('bcvDirect', true);
          return { status: 'ok', bcv: parsed };
        }
      }
    } catch (e) {}

    this._markSource('bcvDirect', false);
    return { status: 'fail', bcv: null };
  }

  /**
   * Intenta consultar Binance P2P directamente
   */
  async _fetchBinanceDirect(force = false) {
    if (!this._shouldFetchSource('binance', force)) return { status: 'skip', prices: [] };

    const r = await this._request({
      source: 'binance',
      url: 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fiat: 'VES', page: 1, rows: 10, tradeType: 'BUY', asset: 'USDT', countries: [], payTypes: []
        }),
        timeout: 4500
      },
      force
    });

    if (r.status !== 'ok' || !r.data?.data || !Array.isArray(r.data.data) || r.data.data.length === 0) {
      this._markSource('binance', false);
      return { status: 'fail', prices: [] };
    }

    const organicItems = r.data.data.filter(i => !i.adv?.isPromoted && !i.isPromoted && i.adv?.price);
    const sourceItems = organicItems.length > 0 ? organicItems : r.data.data;
    const prices = sourceItems
      .map(i => parseFloat(i.adv?.price))
      .filter(p => !isNaN(p) && p > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) {
      this._markSource('binance', false);
      return { status: 'fail', prices: [] };
    }

    this._markSource('binance', true);
    return { status: 'ok', prices };
  }

  /**
   * Consulta DolarApi para tasas vigentes de Dólar y Euro (Oficial y Paralelo)
   */
  async _fetchDolarApi(force = false) {
    if (!this._shouldFetchSource('dolarapi', force)) {
      return { status: 'skip', bcvUsd: null, bcvIso: null, euroValue: null, euroIso: null, paraleloUsd: null, paraleloEuro: null };
    }

    const [usdRes, eurRes] = await Promise.all([
      this._request({ source: 'dolarapi', url: 'https://ve.dolarapi.com/v1/dolares', force }),
      this._request({ source: 'dolarapi', url: 'https://ve.dolarapi.com/v1/euros', force })
    ]);

    const out = { bcvUsd: null, bcvIso: null, euroValue: null, euroIso: null, paraleloUsd: null, paraleloEuro: null };
    let ok = false;

    if (usdRes.status === 'ok' && Array.isArray(usdRes.data)) {
      const bcvItem = usdRes.data.find(d => d.fuente === 'oficial' || d.casa === 'oficial');
      const paraleloItem = usdRes.data.find(d => d.fuente === 'paralelo' || d.casa === 'paralelo');
      if (bcvItem?.promedio) {
        out.bcvUsd = parseFloat(parseFloat(bcvItem.promedio).toFixed(2));
        if (bcvItem.fechaActualizacion) {
          out.bcvIso = String(bcvItem.fechaActualizacion).split('T')[0];
        }
        ok = true;
      }
      if (paraleloItem?.promedio) {
        out.paraleloUsd = parseFloat(parseFloat(paraleloItem.promedio).toFixed(2));
        ok = true;
      }
    }

    if (eurRes.status === 'ok' && Array.isArray(eurRes.data)) {
      const oficialItem = eurRes.data.find(d => d.fuente === 'oficial' || d.casa === 'oficial' || d.moneda === 'EUR');
      const paraleloItem = eurRes.data.find(d => d.fuente === 'paralelo' || d.casa === 'paralelo');
      if (oficialItem?.promedio) {
        out.euroValue = parseFloat(parseFloat(oficialItem.promedio).toFixed(2));
        if (oficialItem.fechaActualizacion) {
          out.euroIso = String(oficialItem.fechaActualizacion).split('T')[0];
        }
        ok = true;
      }
      if (paraleloItem?.promedio) {
        out.paraleloEuro = parseFloat(parseFloat(paraleloItem.promedio).toFixed(2));
      }
    }

    this._markSource('dolarapi', ok);
    return { status: ok ? 'ok' : 'fail', ...out };
  }

  getTodayIsoVet() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
    } catch (e) {
      return new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().split('T')[0];
    }
  }

  _formatFechaValor(isoDate) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    try {
      const parts = String(isoDate).slice(0, 10).split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day, 12, 0, 0);
        return `Fecha Valor ${days[d.getDay()]} ${day} de ${months[month]} ${year}`;
      }
    } catch (e) {}
    return isoDate;
  }

  /**
   * Consulta históricos de DolarApi para obtener tasa vigente de hoy y eventuales Fechas Valor futuras
   */
  async _fetchDolarApiHistorics(force = false) {
    if (!this._shouldFetchSource('histDolarapi', force)) {
      return { status: 'skip', nextUsd: null, hoyUsd: null, nextEur: null, hoyEur: null };
    }

    const [usdRes, eurRes] = await Promise.all([
      this._request({ source: 'histDolarapi', url: 'https://ve.dolarapi.com/v1/historicos/dolares/oficial', force }),
      this._request({ source: 'histDolarapi', url: 'https://ve.dolarapi.com/v1/historicos/euros', force })
    ]);

    const today = this.getTodayIsoVet();
    const pick = (series, defaultFuente = 'oficial') => {
      if (!Array.isArray(series)) return { next: null, hoy: null };
      let hoy = null;
      let next = null;
      for (const rec of series) {
        if (!rec || !rec.fecha) continue;
        if (rec.fuente && rec.fuente !== defaultFuente) continue;
        const value = parseFloat(parseFloat(rec.promedio).toFixed(2));
        if (!isNaN(value) && value > 0) {
          const recDate = String(rec.fecha).split('T')[0];
          if (recDate <= today) {
            hoy = { value, date: recDate };
          } else {
            next = { value, date: recDate };
          }
        }
      }
      return { next, hoy };
    };

    const usdPick = pick(usdRes.data, 'oficial');
    const eurPick = pick(eurRes.data, 'oficial');

    const ok = Boolean(usdPick.hoy || usdPick.next || eurPick.hoy || eurPick.next);
    this._markSource('histDolarapi', ok);

    return {
      status: ok ? 'ok' : 'fail',
      nextUsd: usdPick.next,
      hoyUsd: usdPick.hoy,
      nextEur: eurPick.next,
      hoyEur: eurPick.hoy
    };
  }

  // --------------------------------------------------------------------------
  // Flujo principal de sincronización
  // --------------------------------------------------------------------------

  async fetchRatesForCountry(country, force = false) {
    const cacheKey = `${RATES_CACHE_KEY_PREFIX}_${country.id}`;

    if (!force) {
      const cached = this.getCache(cacheKey);
      if (cached) {
        this.fetchFreshRates(country, cacheKey, false).catch(() => {});
        return cached;
      }

      const stale = this.getCacheStale(cacheKey);
      if (stale) {
        this.fetchFreshRates(country, cacheKey, false).catch(() => {});
        return stale;
      }
    }

    return await this.fetchFreshRates(country, cacheKey, force);
  }

  async fetchFreshRates(country, cacheKey, force = false) {
    if (this.isSyncing && this._inflightPromise && !force) {
      return this._inflightPromise;
    }

    this.isSyncing = true;
    this._inflightPromise = this.fetchVenezuelaRates(country, cacheKey, force)
      .then(rates => {
        if (rates && rates._meta) {
          this._lastRates = JSON.parse(JSON.stringify(rates));
          delete this._lastRates._meta;
          if (rates._meta.source === 'live') {
            this._lastFetchedAt = rates._meta.fetchedAt || Date.now();
          }
        }
        return rates;
      })
      .catch((error) => {
        console.warn(`Error al consultar API para ${country.name}:`, error);
        return this._getLastKnownRates(country);
      });

    try {
      return await this._inflightPromise;
    } finally {
      this.isSyncing = false;
      this._inflightPromise = null;
    }
  }

  async fetchVenezuelaRates(country, cacheKey, force = false) {
    // Partir del último estado vivo conocido para preservar nextDay cuando alguna fuente salta por TTL
    const baseRates = this._lastRates || country.rates;
    const rates = JSON.parse(JSON.stringify(baseRates));
    const fetched = {};
    let anySkipped = false;

    // Valores previos para cálculo de variación
    const prevValues = {};
    Object.keys(rates).forEach(key => {
      const r = rates[key];
      if (r && typeof r.value === 'number' && !isNaN(r.value)) {
        prevValues[key] = r.value;
      }
    });

    const nativeData = this._fetchFromAndroidNative(force);

    // Ejecución paralela de alta velocidad incluyendo scraping directo BCV en vivo
    const [proxyData, bcvDirectRes, binanceRes, dolarApiRes, histRes] = await Promise.allSettled([
      this._fetchFromPhpProxy(force),
      this._fetchBcvDirectWeb(force),
      this._fetchBinanceDirect(force),
      this._fetchDolarApi(force),
      this._fetchDolarApiHistorics(force)
    ]);

    const todayIso = this.getTodayIsoVet();

    // Detectar si las fuentes omitieron petición por TTL activo
    if (bcvDirectRes.status === 'fulfilled' && bcvDirectRes.value.status === 'skip') anySkipped = true;
    if (binanceRes.status === 'fulfilled' && binanceRes.value.status === 'skip') anySkipped = true;
    if (dolarApiRes.status === 'fulfilled' && dolarApiRes.value.status === 'skip') anySkipped = true;
    if (histRes.status === 'fulfilled' && histRes.value.status === 'skip') anySkipped = true;

    // 1. DolarApi Históricos (Base autoritativa para la tasa vigente de HOY cuando BCV ya publicó mañana/lunes)
    if (histRes.status === 'fulfilled' && histRes.value.status === 'ok') {
      const h = histRes.value;
      if (h.hoyUsd && h.hoyUsd.value > 0) {
        rates.bcv.value = h.hoyUsd.value;
        rates.bcv._iso = h.hoyUsd.date || todayIso;
        rates.bcv.effectiveDate = isoToShortDate(rates.bcv._iso);
        fetched.dolarapiHistHoy = true;
      }
      if (h.hoyEur && rates.euro && h.hoyEur.value > 0) {
        rates.euro.value = h.hoyEur.value;
        rates.euro._iso = h.hoyEur.date || todayIso;
        rates.euro.effectiveDate = isoToShortDate(rates.euro._iso);
        fetched.dolarapiHistEuroHoy = true;
      }
      if (h.nextUsd && String(h.nextUsd.date) > todayIso) {
        const curUsd = rates.bcv.value || h.nextUsd.value;
        const changeUsd = curUsd > 0
          ? parseFloat((((h.nextUsd.value - curUsd) / curUsd) * 100).toFixed(2))
          : 0;
        rates.bcv.nextDay = {
          published: true, isOfficial: true, value: h.nextUsd.value, change: changeUsd,
          date: this._formatFechaValor(h.nextUsd.date),
          shortDate: isoToShortDate(h.nextUsd.date),
          _iso: h.nextUsd.date,
          scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
        };
        fetched.dolarapiHistNext = true;
      }
      if (h.nextEur && rates.euro && String(h.nextEur.date) > todayIso) {
        const curEur = rates.euro.value || h.nextEur.value;
        const changeEur = curEur > 0
          ? parseFloat((((h.nextEur.value - curEur) / curEur) * 100).toFixed(2))
          : 0;
        rates.euro.nextDay = {
          published: true, isOfficial: true, value: h.nextEur.value, change: changeEur,
          date: this._formatFechaValor(h.nextEur.date),
          shortDate: isoToShortDate(h.nextEur.date),
          _iso: h.nextEur.date,
          scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
        };
        fetched.dolarapiHistEuroNext = true;
      }
    }

    // 2. DolarApi en vivo (Oficial y Paralelo de respaldo)
    if (dolarApiRes.status === 'fulfilled' && dolarApiRes.value.status === 'ok') {
      const r = dolarApiRes.value;
      if (r.bcvUsd) {
        if (r.bcvIso && r.bcvIso > todayIso) {
          this.processBcvRates(rates, {
            usd: r.bcvUsd,
            eur: r.euroValue,
            isoDate: r.bcvIso,
            shortDate: isoToShortDate(r.bcvIso),
            fecha: this._formatFechaValor(r.bcvIso)
          }, todayIso);
        } else {
          rates.bcv.value = r.bcvUsd;
          rates.bcv._iso = r.bcvIso || todayIso;
          rates.bcv.effectiveDate = isoToShortDate(rates.bcv._iso);
        }
        fetched.dolarapi = true;
      }
      if (r.euroValue && rates.euro) {
        if (!r.euroIso || r.euroIso <= todayIso) {
          rates.euro.value = r.euroValue;
          rates.euro._iso = r.euroIso || todayIso;
          rates.euro.effectiveDate = isoToShortDate(rates.euro._iso);
        }
        fetched.dolarapiEuro = true;
      }
      if (r.paraleloUsd) {
        rates.paralelo.value = r.paraleloUsd;
        fetched.dolarapiParalelo = true;
      }
    }

    // 3. BCV Oficial en Tiempo Real (Prioridad máxima: Android Nativo -> Proxy PHP -> Lector Directo bcv.org.ve)
    let liveBcv = null;
    if (nativeData?.bcv?.status === 'ok' && nativeData.bcv.usd > 0) {
      liveBcv = nativeData.bcv;
      fetched.nativeBcv = true;
    } else if (proxyData.status === 'fulfilled' && proxyData.value?.bcv?.status === 'ok' && proxyData.value.bcv.usd > 0) {
      liveBcv = proxyData.value.bcv;
      fetched.phpBcv = true;
    } else if (bcvDirectRes.status === 'fulfilled' && bcvDirectRes.value?.status === 'ok' && bcvDirectRes.value.bcv?.usd > 0) {
      liveBcv = bcvDirectRes.value.bcv;
      fetched.webBcvDirect = true;
    }

    if (liveBcv) {
      this.processBcvRates(rates, liveBcv, todayIso);
    }

    // 4. Binance P2P USDT en Tiempo Real (Prioridad: Android Nativo -> Proxy PHP -> Directo)
    let binancePrices = null;
    if (nativeData?.binance?.status === 'ok' && Array.isArray(nativeData.binance.prices) && nativeData.binance.prices.length > 0) {
      binancePrices = nativeData.binance.prices;
      fetched.nativeBinance = true;
    } else if (proxyData.status === 'fulfilled' && proxyData.value?.binance?.status === 'ok' && Array.isArray(proxyData.value.binance.prices) && proxyData.value.binance.prices.length > 0) {
      binancePrices = proxyData.value.binance.prices;
      fetched.phpBinance = true;
    } else if (binanceRes.status === 'fulfilled' && binanceRes.value?.status === 'ok' && binanceRes.value.prices.length > 0) {
      binancePrices = binanceRes.value.prices;
      fetched.directBinance = true;
    }

    if (binancePrices && binancePrices.length > 0) {
      const topPrices = binancePrices.slice(0, Math.min(3, binancePrices.length));
      rates.paralelo.value = parseFloat((topPrices.reduce((a, b) => a + b, 0) / topPrices.length).toFixed(2));
    }

    // Sanitizar pronósticos expirados
    Object.keys(rates).forEach(k => {
      const r = rates[k];
      if (r && r.nextDay && r.nextDay._iso && String(r.nextDay._iso) <= todayIso) {
        r.nextDay = null;
      }
    });

    // Calcular variación vs valor previo conocido
    Object.keys(rates).forEach(key => {
      const r = rates[key];
      if (r && typeof r.value === 'number' && !isNaN(r.value) && r.value > 0) {
        const prev = prevValues[key];
        if (typeof prev === 'number' && prev > 0 && prev !== r.value) {
          r.change = parseFloat((((r.value - prev) / prev) * 100).toFixed(2));
        }
      }
    });

    const succeeded = Object.values(fetched).some(Boolean);
    const hasRecentLive = this._lastFetchedAt > 0 && (Date.now() - this._lastFetchedAt) < 3 * 60 * 1000;
    const sourceLabel = (succeeded || (anySkipped && hasRecentLive)) ? 'live' : 'cache';

    if (succeeded) {
      this._lastFetchedAt = Date.now();
      const stored = JSON.parse(JSON.stringify(rates));
      delete stored._meta;
      this.setCache(cacheKey, stored);
    }

    return this._decorate(rates, sourceLabel, {
      sources: fetched,
      hasPhpProxy: this._hasPhpProxy,
      fetchedAt: this._lastFetchedAt || Date.now()
    });
  }

  processBcvRates(rates, bcvData, todayIso = null) {
    if (!bcvData || typeof bcvData.usd !== 'number' || isNaN(bcvData.usd) || bcvData.usd <= 0) return;

    const today = todayIso || this.getTodayIsoVet();
    const bcvUsd = parseFloat(bcvData.usd.toFixed(2));
    const bcvEur = bcvData.eur ? parseFloat(bcvData.eur.toFixed(2)) : null;
    const rawFecha = (bcvData.fecha || '').toLowerCase();
    const cleanDate = bcvData.fecha
      ? bcvData.fecha.replace(/^Fecha\s+Valor\s*:?\s*/i, '').trim()
      : 'Oficial BCV';

    const isoDate = bcvData.isoDate || parseSpanishDateToIso(cleanDate);
    const shortDate = bcvData.shortDate || (isoDate ? isoToShortDate(isoDate) : '');

    let isNextDay = false;
    if (isoDate) {
      isNextDay = String(isoDate) > String(today);
    } else {
      const targetDayName = getNextBusinessDayName().toLowerCase();
      if (rawFecha.includes(targetDayName)) {
        isNextDay = true;
      }
    }

    if (isNextDay) {
      const currentUsd = (typeof rates.bcv.value === 'number' && rates.bcv.value > 0) ? rates.bcv.value : bcvUsd;
      const changeUsd = currentUsd > 0 ? parseFloat((((bcvUsd - currentUsd) / currentUsd) * 100).toFixed(2)) : 0;
      const formattedDate = isoDate ? this._formatFechaValor(isoDate) : cleanDate;

      rates.bcv.nextDay = {
        published: true,
        isOfficial: true,
        value: bcvUsd,
        change: changeUsd,
        date: formattedDate,
        shortDate: shortDate || cleanDate,
        _iso: isoDate || null,
        scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
      };

      if (bcvEur && rates.euro) {
        const currentEur = (typeof rates.euro.value === 'number' && rates.euro.value > 0) ? rates.euro.value : bcvEur;
        const changeEur = currentEur > 0 ? parseFloat((((bcvEur - currentEur) / currentEur) * 100).toFixed(2)) : 0;
        rates.euro.nextDay = {
          published: true,
          isOfficial: true,
          value: bcvEur,
          change: changeEur,
          date: formattedDate,
          shortDate: shortDate || cleanDate,
          _iso: isoDate || null,
          scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
        };
      }
    } else {
      rates.bcv.value = bcvUsd;
      rates.bcv._iso = isoDate || today;
      rates.bcv.effectiveDate = shortDate || isoToShortDate(today);
      if (bcvEur && rates.euro) {
        rates.euro.value = bcvEur;
        rates.euro._iso = isoDate || today;
        rates.euro.effectiveDate = shortDate || isoToShortDate(today);
      }
    }
  }

  hasValidRateValue(data) {
    if (!data || typeof data !== 'object') return false;
    return Object.values(data).some(r =>
      r && typeof r === 'object' && typeof r.value === 'number' && !isNaN(r.value)
    );
  }

  _getLastKnownRates(country, extra = {}) {
    try {
      if (this._lastRates) {
        const clone = JSON.parse(JSON.stringify(this._lastRates));
        return this._decorate(clone, 'offline', { fetchedAt: this._lastFetchedAt || Date.now(), ...extra });
      }
      const cacheKey = `${RATES_CACHE_KEY_PREFIX}_${country.id}`;
      const stale = this.getCacheStale(cacheKey);
      if (stale) {
        const clone = JSON.parse(JSON.stringify(stale));
        delete clone._meta;
        return this._decorate(clone, 'offline', { fetchedAt: this._lastFetchedAt || Date.now(), ...extra });
      }
    } catch (e) {}

    const rates = JSON.parse(JSON.stringify(country.rates));
    return this._decorate(rates, 'offline', { error: true, ...extra });
  }

  getCache(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { timestamp, data } = JSON.parse(raw);
      if (typeof timestamp !== 'number' || !data) return null;
      if (Date.now() - timestamp < this.CACHE_TTL_MS && this.hasValidRateValue(data)) {
        const enriched = JSON.parse(JSON.stringify(data));
        return this._decorate(enriched, 'live', { reused: true, cachedAt: timestamp, fetchedAt: this._lastFetchedAt || timestamp });
      }
    } catch (e) {}
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
        const enriched = JSON.parse(JSON.stringify(data));
        return this._decorate(enriched, 'stale', { cachedAt: timestamp, fetchedAt: this._lastFetchedAt || timestamp });
      }
    } catch (e) {}
    return null;
  }

  setCache(key, data) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
      }
    } catch (e) {}
  }
}

const apiService = new ApiService();


  // --- js/notificationService.js ---
/**
 * Servicio de Notificaciones Automáticas de Tasa BCV en Tiempo Real (Nativo Android + Web/PWA)
 */




const REMINDER_CHECK_INTERVAL_MS = 60 * 1000; // Verificación activa cada 60s

class NotificationService {
  constructor() {
    this.STORAGE_ENABLED = 'dolarfy_notifications_enabled';
    this.STORAGE_LAST_DATE = 'dolarfy_last_notified_date';
    this.STORAGE_LOGS = 'dolarfy_notification_logs';

    this.enabled = this.loadEnabledState();
    this.lastNotifiedDate = this._storageGet(this.STORAGE_LAST_DATE) || '';
    this.logs = this.loadLogs();
    this.notificationTimer = null;

    this._syncNativeState();
  }

  _storageGet(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  _storageSet(key, value) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  _syncNativeState() {
    try {
      if (typeof window !== 'undefined' && window.DolarfyNative) {
        if (typeof window.DolarfyNative.setNotificationsEnabled === 'function') {
          window.DolarfyNative.setNotificationsEnabled(Boolean(this.enabled));
        }
      }
    } catch (e) {}
  }

  loadEnabledState() {
    const saved = this._storageGet(this.STORAGE_ENABLED);
    return saved !== null ? saved === 'true' : true;
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
      localStorage.setItem(this.STORAGE_LOGS, JSON.stringify(this.logs.slice(0, 20)));
    } catch (e) {}
  }

  isEnabled() {
    return this.enabled;
  }

  getLogs() {
    return this.logs;
  }

  getTodayString() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
    } catch (e) {
      return new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().split('T')[0];
    }
  }

  async hasPermission() {
    if (typeof window !== 'undefined' && window.DolarfyNative) return true;
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    return Notification.permission === 'granted';
  }

  async requestPermission() {
    try {
      if (typeof window !== 'undefined' && window.DolarfyNative && typeof window.DolarfyNative.requestNotificationPermission === 'function') {
        window.DolarfyNative.requestNotificationPermission();
        return true;
      }
    } catch (e) {}

    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    try {
      const result = await Notification.requestPermission();
      return result === 'granted';
    } catch (e) {
      return false;
    }
  }

  /**
   * Envía la notificación al sistema operativo:
   * 1. Android APK Nativo (NotificationManager con formato idéntico a la bandeja de Android)
   * 2. ServiceWorker Registration (estándar PWA móvil sin error de constructor ilegal)
   * 3. Notification API de escritorio (fallback)
   */
  async sendLocalNotification(entry, dedupKey = '') {
    if (!this.enabled) return;

    const title = entry.title || '📢 Nueva Tasa BCV Disponible';
    const body = entry.body || `${entry.summaryLine || `${entry.rateName}: ${entry.formattedValue}`}${entry.fechaLine ? `\n${entry.fechaLine}` : ''}`;

    // 1. Puente Nativo Android (APK)
    try {
      if (typeof window !== 'undefined' && window.DolarfyNative && typeof window.DolarfyNative.showNotification === 'function') {
        window.DolarfyNative.showNotification(title, body, dedupKey || '');
        return;
      }
    } catch (e) {
      console.warn('Error en notificación nativa Android:', e);
    }

    // 2. Navegador Web / PWA
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        await this.requestPermission();
      }
      if (Notification.permission === 'granted') {
        try {
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg && typeof reg.showNotification === 'function') {
              await reg.showNotification(title, {
                body,
                icon: 'assets/icons/icon-192.png',
                badge: 'assets/icons/favicon-32.png',
                vibrate: [200, 100, 200],
                tag: dedupKey || 'dolarfy-bcv-rate'
              });
              return;
            }
          }
        } catch (swErr) {}

        try {
          new Notification(title, {
            body,
            icon: 'assets/icons/icon-192.png'
          });
        } catch (e) {}
      }
    }
  }

  // ==========================================================================
  //  Toggle
  // ==========================================================================

  async toggleNotifications(forceState = null) {
    this.enabled = forceState !== null ? forceState : !this.enabled;
    this._storageSet(this.STORAGE_ENABLED, this.enabled.toString());
    this._syncNativeState();

    if (this.enabled) {
      await this.requestPermission();
      await this.scheduleDailyReminder();
      await this.checkDailyUpdate(mockEngine.getCurrentCountry(), mockEngine.getRates());
    } else {
      await this.cancelDailyReminder();
    }
    return this.enabled;
  }

  // ==========================================================================
  //  Monitoreo periódico activo
  // ==========================================================================

  async scheduleDailyReminder() {
    this.cancelDailyReminder();
    if (typeof setInterval === 'undefined') return;
    this.notificationTimer = setInterval(async () => {
      try {
        await mockEngine.syncRealRates(false);
        const country = mockEngine.getCurrentCountry();
        const rates = mockEngine.getRates();
        await this.checkDailyUpdate(country, rates);
      } catch (e) {}
    }, REMINDER_CHECK_INTERVAL_MS);
  }

  async cancelDailyReminder() {
    if (this.notificationTimer) {
      clearInterval(this.notificationTimer);
      this.notificationTimer = null;
    }
  }

  getLiveRateSummary(country, rates) {
    if (!country || !rates || !rates.bcv) return null;
    return this._buildBcvNotificationPayload(country, rates);
  }

  /**
   * Construye los datos de notificación BCV (USD + EUR + Fecha DD/MM/YYYY)
   * priorizando la Fecha Valor futura (pronóstico) apenas es publicada por el BCV.
   */
  _buildBcvNotificationPayload(country, rates) {
    const bcv = rates?.bcv || {};
    const euro = rates?.euro || {};

    const hasNextDay = Boolean(bcv.nextDay && bcv.nextDay.published && typeof bcv.nextDay.value === 'number' && bcv.nextDay.value > 0);

    const usdVal = hasNextDay
      ? bcv.nextDay.value
      : (typeof bcv.value === 'number' && bcv.value > 0 ? bcv.value : 889.26);

    const eurVal = (hasNextDay && euro.nextDay && typeof euro.nextDay.value === 'number' && euro.nextDay.value > 0)
      ? euro.nextDay.value
      : (typeof euro.value === 'number' && euro.value > 0 ? euro.value : 992.80);

    const isoDate = (hasNextDay && bcv.nextDay._iso)
      ? bcv.nextDay._iso
      : (bcv._iso || this.getTodayString());

    const shortDate = (hasNextDay && bcv.nextDay.shortDate)
      ? bcv.nextDay.shortDate
      : (bcv.effectiveDate || isoToShortDate(isoDate));

    const usdText = usdVal.toFixed(2);
    const eurText = eurVal.toFixed(2);

    const title = '📢 Nueva Tasa BCV Disponible';
    const summaryLine = `USD = Bs. ${usdText} | EUR = Bs. ${eurText}`;
    const fechaLine = `Fecha: ${shortDate}`;
    const body = `${summaryLine}\n${fechaLine}`;
    const dedupKey = `${country.id}_${isoDate}_${usdText}_${eurText}`;

    return {
      id: Date.now(),
      countryId: country.id,
      countryName: country.name,
      flagUrl: country.flagUrl,
      title,
      rateName: title,
      summaryLine,
      fechaLine,
      shortDate,
      isoDate,
      body,
      value: usdVal,
      eurValue: eurVal,
      currency: bcv.currency || 'VES',
      formattedValue: `Bs. ${usdText}`,
      time: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true }),
      date: shortDate,
      dedupKey,
      isNextDay: hasNextDay,
      type: 'live'
    };
  }

  // ==========================================================================
  //  Detección de nueva tasa BCV publicada (Hoy o Fecha Valor siguiente)
  // ==========================================================================

  async checkDailyUpdate(country, rates) {
    if (!this.enabled || !rates || !rates.bcv) return;

    // No disparar sobre datos placeholder antes de la primera sincronización real
    if (rates._meta?.placeholder) return;

    const payload = this._buildBcvNotificationPayload(country, rates);
    if (!payload || !payload.value) return;

    // Si ya notificamos exactamente esta misma Fecha Valor + tasa, omitir
    if (this.lastNotifiedDate === payload.dedupKey) return;

    // Verificar si el servicio en segundo plano de Android ya lanzó la notificación en la barra de estado
    let alreadyNotifiedByNative = false;
    try {
      if (typeof window !== 'undefined' && window.DolarfyNative && typeof window.DolarfyNative.getLastNotifiedKey === 'function') {
        const nativeKey = window.DolarfyNative.getLastNotifiedKey();
        if (nativeKey && nativeKey === payload.dedupKey) {
          alreadyNotifiedByNative = true;
        }
      }
    } catch (e) {}

    this.lastNotifiedDate = payload.dedupKey;
    this._storageSet(this.STORAGE_LAST_DATE, payload.dedupKey);

    this.logs.unshift(payload);
    this.saveLogs();

    if (!alreadyNotifiedByNative) {
      await this.sendLocalNotification(payload, payload.dedupKey);
    }
    this.showToast(payload);
  }

  clearLogs() {
    this.logs = [];
    this.saveLogs();
  }

  // ==========================================================================
  //  Toast in-app con diseño de Alerta Oficial BCV
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
    toastEl.className = 'pointer-events-auto bg-[#161B22] border border-cyan-500/40 rounded-2xl p-4 shadow-2xl glow-cyan flex items-start space-x-3 animate-fade-in transition-all duration-300 mb-2';
    toastEl.innerHTML = `
      <img src="assets/img/logo-sin-fondo.webp" alt="Dolarfy" class="w-8 h-8 rounded-xl object-contain bg-cyan-500/10 p-1 border border-cyan-500/30 mt-0.5">
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Dolarfy · Ahora
          </span>
          <span class="text-[9px] text-gray-400">${logEntry.time}</span>
        </div>
        <h4 class="text-xs font-extrabold text-white mt-1">${logEntry.title || logEntry.rateName}</h4>
        <p class="text-xs font-bold text-emerald-400 mt-0.5">${logEntry.summaryLine || logEntry.formattedValue}</p>
        ${logEntry.fechaLine ? `<p class="text-[11px] text-gray-300 font-semibold mt-0.5">${logEntry.fechaLine}</p>` : ''}
      </div>
      <button class="toast-close-btn text-gray-400 hover:text-white p-1 text-xs cursor-pointer">✕</button>
    `;

    const closeBtn = toastEl.querySelector('.toast-close-btn');
    closeBtn?.addEventListener('click', () => {
      toastEl.remove();
    });

    toastContainer.appendChild(toastEl);

    setTimeout(() => {
      if (toastEl.parentNode) {
        toastEl.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => toastEl.remove(), 300);
      }
    }, 7000);
  }
}

const notificationService = new NotificationService();


  // --- js/mockData.js ---
/**
 * Motor de tasas de cambio de Dolarfy
 * Gestiona el ciclo de vida de los datos: caché, sincronización y suscripciones.
 */





const POLL_INTERVAL_MS = 15 * 1000; // Base de polling; cada fuente gestiona su propia cadencia/TTL

class RatesEngine {
  constructor() {
    this.countries = COUNTRIES_DATA;
    this.listeners = [];
    this._timer = null;
    this._hydrateCacheSync();
    this._bindNativeBridge();
    this.syncRealRates(true);
    this._startPolling();
  }

  _bindNativeBridge() {
    if (typeof window !== 'undefined') {
      window.__onDolarfyNativeSync = () => {
        this.syncRealRates(false);
      };
    }
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

      // Fecha de hoy en VET (UTC-4)
      const now = new Date();
      const vetOffsetMs = -4 * 60 * 60 * 1000;
      const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
      const todayIso = new Date(utcMs + vetOffsetMs).toISOString().split('T')[0];

      // Preservar datos válidos de nextDay y sanitizar cotizaciones USDT desactualizadas
      Object.keys(data).forEach(k => {
        const item = data[k];
        if (item && typeof item === 'object') {
          if (item.nextDay && (!item.nextDay.value || item.nextDay.value <= 0)) {
            item.nextDay = null;
          }
          // Descartar nextDay fabricados por versiones antiguas (publicación falsa con la tasa de hoy)
          if (item.nextDay && /^Oficial BCV \((Lunes|Martes|Mi[ée]rcoles|Jueves|Viernes)\)$/i.test(String(item.nextDay.date || ''))) {
            item.nextDay = null;
          }
          // Descartar pronósticos cuya Fecha Valor ya pasó o corresponde al día actual
          if (item.nextDay && item.nextDay._iso && String(item.nextDay._iso) <= todayIso) {
            item.nextDay = null;
          }
        }
      });

      current.rates = { ...this.countries[0].rates, ...data };
    } catch (e) {
      console.warn('Error al cargar caché inicial:', e);
    } finally {
      if (!current.rates._meta) {
        current.rates._meta = { source: 'placeholder', placeholder: true, fetchedAt: 0 };
      }
    }
  }

  hasRatesChanged(oldRates, newRates) {
    if (!oldRates || !newRates) return true;
    if ((oldRates._meta?.source || '') !== (newRates._meta?.source || '')) return true;
    const keys = ['bcv', 'paralelo', 'euro'];
    for (const k of keys) {
      const o = oldRates[k];
      const n = newRates[k];
      if (!o || !n) return true;
      if (o.value !== n.value) return true;
      const oNext = o.nextDay ? o.nextDay.value : null;
      const nNext = n.nextDay ? n.nextDay.value : null;
      if (oNext !== nNext) return true;
      const oIso = o.nextDay ? o.nextDay._iso : null;
      const nIso = n.nextDay ? n.nextDay._iso : null;
      if (oIso !== nIso) return true;
    }
    return false;
  }

  async syncRealRates(force = false) {
    const current = this.getCurrentCountry();
    try {
      const oldRates = JSON.parse(JSON.stringify(current.rates));
      const rates = await apiService.fetchRatesForCountry(current, force);
      if (rates) {
        const changed = this.hasRatesChanged(oldRates, rates);
        current.rates = rates;
        if (changed || force) {
          this._notify(null, 'rates_refreshed');
        }
      }
    } catch (e) {
      console.warn('Error al sincronizar tasas:', e);
    }
  }

  _startPolling() {
    // Polling en segundo plano; la cadencia real por fuente la controla ApiService
    this._startPollTimer();

    // Pausar mientras la app esté en segundo plano y reanudar al volver
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this._startPollTimer();
          this.syncRealRates(true);
        } else {
          this._stopPollTimer();
        }
      });
    }
  }

  _startPollTimer() {
    if (this._timer) return;
    this._timer = setInterval(() => this.syncRealRates(false), POLL_INTERVAL_MS);
  }

  _stopPollTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
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
    const rates = mockEngine.getRates();
    const livePreview = notificationService.getLiveRateSummary(currentCountry, rates);

    this.modalEl.innerHTML = `
      <div id="notification-modal-backdrop" class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 animate-fade-in">
        <div class="w-full max-w-md bg-[#0F141C] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
          
          <!-- Modal Header -->
          <div class="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
            <div class="flex items-center space-x-2">
              <div class="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <i data-lucide="bell" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="text-base font-extrabold text-white leading-tight">Centro de Alertas</h3>
                <p class="text-[10px] text-cyan-400 font-semibold">Monitoreo BCV en Tiempo Real</p>
              </div>
            </div>
            <button id="close-notif-modal-btn" type="button" class="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white transition-all active:scale-95 cursor-pointer">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <!-- Content Body -->
          <div class="p-4 overflow-y-auto space-y-4 max-h-[70vh] custom-scroll">
            
            <!-- Toggle Switch Card -->
            <div class="glass-card rounded-2xl p-4 flex items-center justify-between border border-cyan-500/30 bg-gradient-to-r from-cyan-950/20 to-blue-950/20">
              <div class="pr-3">
                <h4 class="text-xs font-extrabold text-white flex items-center gap-1.5">
                  <span>Alertas Automáticas BCV</span>
                  ${isEnabled ? `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>` : ''}
                </h4>
                <p class="text-[11px] text-gray-400 mt-1 leading-snug">
                  Recibe una notificación inmediata en tu dispositivo cada vez que el BCV publique una nueva tasa oficial o Fecha Valor.
                </p>
              </div>

              <button id="toggle-notif-switch" type="button" class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isEnabled ? 'bg-cyan-500' : 'bg-gray-700'}">
                <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isEnabled ? 'translate-x-5' : 'translate-x-0'}"></span>
              </button>
            </div>

            <!-- Estado actual de la tasa BCV detectada en vivo -->
            ${livePreview ? `
              <div class="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-3.5 flex items-start justify-between">
                <div class="flex items-start space-x-3">
                  <img src="${currentCountry.flagUrl}" alt="${currentCountry.name}" class="w-6 h-6 rounded-full object-cover border border-emerald-500/40 mt-0.5">
                  <div>
                    <div class="flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <p class="text-[11px] font-extrabold text-white">Última Tasa Oficial BCV Detectada</p>
                    </div>
                    <p class="text-xs font-black text-emerald-400 mt-1">${livePreview.summaryLine}</p>
                    <p class="text-[10px] text-gray-300 font-semibold mt-0.5">${livePreview.fechaLine}</p>
                  </div>
                </div>
                <span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                  ${livePreview.isNextDay ? 'Pronóstico' : 'Vigente'}
                </span>
              </div>
            ` : ''}

            <!-- Log History Section -->
            <div>
              <div class="flex justify-between items-center mb-3">
                <div class="flex items-center gap-2">
                  <h4 class="text-xs font-bold uppercase tracking-wider text-gray-400">Historial de Alertas</h4>
                  <span class="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">${logs.length}</span>
                </div>
                ${logs.length > 0 ? `
                  <button id="clear-notif-btn" type="button" class="py-1 px-2.5 rounded-lg bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-gray-400 hover:text-red-400 text-[11px] font-bold transition-all flex items-center space-x-1 active:scale-95 cursor-pointer">
                    <i data-lucide="trash-2" class="w-3 h-3"></i>
                    <span>Limpiar Historial</span>
                  </button>
                ` : ''}
              </div>

              ${logs.length === 0 ? `
                <div class="text-center py-8 bg-black/20 rounded-2xl border border-white/5 space-y-2">
                  <i data-lucide="bell-ring" class="w-8 h-8 text-gray-600 mx-auto"></i>
                  <p class="text-xs text-gray-400 font-semibold">Sin alertas registradas aún</p>
                  <p class="text-[10px] text-gray-500 max-w-xs mx-auto">
                    Recibirás una alerta automática aquí y en la barra de tu dispositivo apenas el BCV publique una nueva actualización oficial.
                  </p>
                </div>
              ` : `
                <div class="space-y-2">
                  ${logs.map(log => `
                    <div class="glass-card rounded-xl p-3 flex items-start justify-between border border-white/10 hover:border-cyan-500/30 transition-all">
                      <div class="flex items-start space-x-3">
                        <img src="${log.flagUrl}" alt="${log.countryName}" class="w-6 h-6 rounded-full object-cover border border-white/10 mt-0.5">
                        <div>
                          <h5 class="text-xs font-extrabold text-white">${log.title || log.rateName}</h5>
                          <p class="text-[11px] font-bold text-emerald-400 mt-0.5">${log.summaryLine || log.formattedValue}</p>
                          <p class="text-[10px] text-gray-400 mt-0.5">${log.fechaLine || `Fecha: ${log.date}`} · ${log.time}</p>
                        </div>
                      </div>
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

      const event = new CustomEvent('dolarfy:notification_toggled');
      document.dispatchEvent(event);
    });

    const clearBtn = document.getElementById('clear-notif-btn');
    clearBtn?.addEventListener('click', () => {
      notificationService.clearLogs();
      this.render();
      if (window.lucide) window.lucide.createIcons();

      const event = new CustomEvent('dolarfy:notification_toggled');
      document.dispatchEvent(event);
    });
  }
}


  // --- js/components/countryModal.js ---
class CountryModal {
  constructor() {
    this.modalEl = null;
  }

  init() {
    let container = document.getElementById('country-modal-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'country-modal-container';
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
    const countries = [
      { id: 'VE', name: 'Venezuela', code: 'VES', flag: 'https://flagcdn.com/w40/ve.png', active: true, desc: 'BCV Oficial + Binance P2P En Vivo' },
      { id: 'CO', name: 'Colombia', code: 'COP', flag: 'https://flagcdn.com/w40/co.png', active: false, desc: 'TRM Oficial + Mercado Paralelo' },
      { id: 'AR', name: 'Argentina', code: 'ARS', flag: 'https://flagcdn.com/w40/ar.png', active: false, desc: 'Dólar Oficial, Blue & Cripto' },
      { id: 'MX', name: 'México', code: 'MXN', flag: 'https://flagcdn.com/w40/mx.png', active: false, desc: 'Banxico Oficial & Interbancario' },
      { id: 'PE', name: 'Perú', code: 'PEN', flag: 'https://flagcdn.com/w40/pe.png', active: false, desc: 'SUNAT & Mercado Paralelo' },
      { id: 'CL', name: 'Chile', code: 'CLP', flag: 'https://flagcdn.com/w40/cl.png', active: false, desc: 'Dólar Observado & Mercado' },
      { id: 'DO', name: 'Rep. Dominicana', code: 'DOP', flag: 'https://flagcdn.com/w40/do.png', active: false, desc: 'Banco Central & Mercado' }
    ];

    this.modalEl.innerHTML = `
      <div id="country-modal-backdrop" class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 animate-fade-in">
        <div class="w-full max-w-md bg-[#0F141C] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
          
          <!-- Header -->
          <div class="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
            <div class="flex items-center space-x-2">
              <i data-lucide="globe" class="w-5 h-5 text-cyan-400"></i>
              <h3 class="text-base font-extrabold text-white">Seleccionar País</h3>
            </div>
            <button id="close-country-modal-btn" type="button" class="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white transition-all active:scale-95 cursor-pointer">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <!-- Body -->
          <div class="p-4 overflow-y-auto space-y-3 custom-scroll">
            <div class="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-3 flex items-start space-x-3 text-xs">
              <i data-lucide="info" class="w-4 h-4 text-cyan-400 shrink-0 mt-0.5"></i>
              <p class="text-gray-300 text-[11px] leading-relaxed">
                Actualmente Dolarfy monitorea las tasas oficiales y de mercado para <strong class="text-cyan-300">Venezuela 🇻🇪</strong>. Pronto activaremos más países de la región.
              </p>
            </div>

            <div class="space-y-2 pt-1">
              ${countries.map(c => `
                <div class="glass-card rounded-2xl p-3.5 flex items-center justify-between transition-all border ${c.active ? 'border-cyan-500/50 bg-cyan-500/10 shadow-sm' : 'border-white/5 opacity-60'}">
                  <div class="flex items-center space-x-3">
                    <img src="${c.flag}" alt="${c.name}" class="w-7 h-7 rounded-full object-cover border border-white/10 shadow">
                    <div>
                      <h4 class="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>${c.name}</span>
                        <span class="text-[10px] text-cyan-400 font-extrabold">(${c.code})</span>
                      </h4>
                      <p class="text-[10px] text-gray-400 mt-0.5">${c.desc}</p>
                    </div>
                  </div>

                  <div>
                    ${c.active ? `
                      <span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <i data-lucide="check" class="w-3 h-3 text-emerald-400"></i> Activo
                      </span>
                    ` : `
                      <span class="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">
                        Próximamente
                      </span>
                    `}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    const backdrop = document.getElementById('country-modal-backdrop');
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    const closeBtn = document.getElementById('close-country-modal-btn');
    closeBtn?.addEventListener('click', () => this.close());
  }
}

const countryModal = new CountryModal();


  // --- js/components/aboutModal.js ---



class AboutModal {
  constructor() {
    this.modalEl = null;
  }

  init() {
    let container = document.getElementById('about-modal-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'about-modal-container';
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
    this.modalEl.innerHTML = `
      <div id="about-modal-backdrop" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
        <div class="w-full max-w-sm bg-[#111622] border border-cyan-500/20 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-up">
          
          <!-- Header -->
          <div class="p-5 pb-3 flex items-center space-x-3">
            <img src="assets/img/logo-sin-fondo.webp" alt="Dolarfy Logo" class="w-8 h-8 object-contain">
            <div>
              <h3 class="text-xl font-extrabold text-white tracking-tight">Acerca de la app</h3>
              <span class="text-[10px] text-gray-400 font-semibold">Dolarfy Mobile</span>
            </div>
          </div>

          <!-- Content -->
          <div class="px-5 space-y-4 text-xs">
            
            <!-- Desarrollador -->
            <div class="flex items-center space-x-3 border-b border-white/5 pb-3">
              <i data-lucide="code-2" class="w-5 h-5 text-white shrink-0"></i>
              <div>
                <span class="text-[11px] font-semibold text-gray-400 block">Desarrollador</span>
                <span class="text-xs font-extrabold text-white block mt-0.5">Adrian Bello</span>
              </div>
            </div>

            <!-- Fuente de datos -->
            <div class="flex items-center space-x-3 border-b border-white/5 pb-3">
              <i data-lucide="layers" class="w-5 h-5 text-white shrink-0"></i>
              <div>
                <span class="text-[11px] font-semibold text-gray-400 block">Fuente de datos</span>
                <a href="https://www.bcv.org.ve" target="_blank" rel="noopener noreferrer" class="text-xs font-extrabold text-cyan-400 hover:underline flex items-center gap-1 mt-0.5">
                  <span>Tasa oficial BCV</span>
                  <i data-lucide="external-link" class="w-3 h-3"></i>
                </a>
              </div>
            </div>

            <!-- Política de privacidad -->
            <div class="flex items-center space-x-3 border-b border-white/5 pb-3">
              <i data-lucide="shield-check" class="w-5 h-5 text-white shrink-0"></i>
              <div>
                <span class="text-[11px] font-semibold text-gray-400 block">Política de privacidad</span>
                <button id="about-privacy-btn" type="button" class="text-xs font-extrabold text-cyan-400 hover:underline mt-0.5 cursor-pointer">
                  Ver
                </button>
              </div>
            </div>

            <!-- Aviso legal -->
            <div class="space-y-1.5 bg-black/40 p-3.5 rounded-2xl border border-white/5">
              <h4 class="text-xs font-extrabold text-white">Aviso legal:</h4>
              <p class="text-[10px] text-gray-400 leading-relaxed">
                Esta aplicación NO representa a ninguna entidad gubernamental ni bancaria. No tenemos afiliación con el Banco Central de Venezuela. Los datos son obtenidos a través de una API que consulta la página oficial del BCV. El uso de la información es responsabilidad exclusiva del usuario.
              </p>
            </div>

            <!-- Licencias de código abierto -->
            <div class="text-center pt-1">
              <button id="about-open-source-btn" type="button" class="text-xs font-extrabold text-emerald-400 hover:underline flex items-center justify-center gap-1.5 mx-auto cursor-pointer">
                <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
                <span>Licencias de código abierto</span>
              </button>
              <p class="text-[10px] text-gray-500 font-semibold mt-2">Versión ${APP_VERSION}</p>
            </div>

          </div>

          <!-- Footer / Actions -->
          <div class="p-4 pt-2 text-right">
            <button id="close-about-modal-btn" type="button" class="text-xs font-extrabold text-cyan-400 hover:text-cyan-300 px-4 py-2 rounded-xl transition-all cursor-pointer active:scale-95">
              Cerrar
            </button>
          </div>

        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    const backdrop = document.getElementById('about-modal-backdrop');
    const closeBtn = document.getElementById('close-about-modal-btn');
    const privacyBtn = document.getElementById('about-privacy-btn');
    const openSourceBtn = document.getElementById('about-open-source-btn');

    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    closeBtn?.addEventListener('click', () => this.close());

    privacyBtn?.addEventListener('click', () => {
      showDialogModal({
        title: 'Política de Privacidad',
        body: 'Dolarfy no recopila, vende ni comparte datos personales de sus usuarios. Toda la configuración e historial se almacenan de forma totalmente local y privada en tu dispositivo.',
        icon: 'shield-check'
      });
    });

    openSourceBtn?.addEventListener('click', () => {
      showDialogModal({
        title: 'Licencias de Código Abierto',
        body: 'Dolarfy hace uso de librerías de código abierto incluyendo Lucide Icons, ApexCharts, TailwindCSS y bibliotecas de utilidades bajo licencia MIT.',
        icon: 'file-text'
      });
    });
  }
}

const aboutModal = new AboutModal();


  // --- js/components/dashboard.js ---



class DashboardView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.unsubscribe = null;
    this.selectedDay = 'hoy'; // 'hoy' | 'manana'
  }

  getNextDayLabel(rates) {
    return getNextBusinessDayName(rates || mockEngine.getRates());
  }

  hasNextDayRate(rates) {
    if (!rates) rates = mockEngine.getRates();
    if (!rates || typeof rates !== 'object') return false;

    // Solo considerar pronósticos cuya Fecha Valor corresponda realmente a un día futuro (VET)
    const now = new Date();
    const vetOffsetMs = -4 * 60 * 60 * 1000;
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const todayIso = new Date(utcMs + vetOffsetMs).toISOString().split('T')[0];

    return Object.values(rates).some(r =>
      r && r.nextDay && r.nextDay.published && typeof r.nextDay.value === 'number' && r.nextDay.value > 0 &&
      (!r.nextDay._iso || String(r.nextDay._iso) > todayIso)
    );
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
        return `<span class="text-[10px] text-cyan-400/80 font-semibold" title="Estableciendo conexión con las fuentes">Conectando...</span>`;
      case 'offline':
        return `<span class="text-[10px] text-red-400 font-semibold" title="Sin conexión activa">Sin conexión${time ? ` · ${time}` : ''}</span>`;
      default:
        return `<span class="text-[10px] text-emerald-400 font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block mr-1"></span>En Vivo</span>`;
    }
  }

  _computeBanner(rates) {
    const currentCountry = mockEngine.getCurrentCountry();
    const rateKeys = Object.keys(rates || {}).filter(k => k !== '_meta');
    const mainRate = rates[currentCountry.defaultRateId] || rates[rateKeys[0]] || { name: 'Dólar Oficial (BCV)', currency: 'VES', value: 0 };
    const secondRate = rateKeys.length > 1 ? rates[rateKeys[1]] : null;

    const isManana = this.selectedDay === 'manana' && this.hasNextDayRate(rates);
    const nextDayLabel = this.getNextDayLabel(rates);

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
      bannerSub = `Cotización oficial del Banco Central de Venezuela publicada para ${nextDayLabel}.`;
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

    return { bannerTag, bannerText, bannerSub, isManana, nextDayLabel };
  }

  render() {
    const currentCountry = mockEngine.getCurrentCountry();
    const rates = mockEngine.getRates();
    const rateKeys = Object.keys(rates).filter(k => k !== '_meta');

    const hasNextDay = this.hasNextDayRate(rates);
    this._lastHasNextDay = hasNextDay;
    const showRedDot = hasNextDay && !isPredictionRead(rates);

    const isNextDayDef = typeof localStorage !== 'undefined' && localStorage.getItem('dolarfy_next_day_default') === 'true';
    if (!this._userSelectedDay && isNextDayDef && hasNextDay) {
      this.selectedDay = 'manana';
    } else if (!hasNextDay && this.selectedDay === 'manana') {
      this.selectedDay = 'hoy';
    }

    const { bannerTag, bannerText, bannerSub, isManana, nextDayLabel } = this._computeBanner(rates);

    this.container.innerHTML = `
      <div class="space-y-5 pb-24 animate-fade-in">
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
            <span id="dash-banner-tag" class="bg-cyan-500/20 text-cyan-300 text-xs px-2.5 py-0.5 rounded-full font-semibold">${bannerTag}</span>
            <h3 id="dash-banner-text" class="text-lg font-bold text-white mt-2">${bannerText}</h3>
            <p id="dash-banner-sub" class="text-xs text-gray-300 mt-1">${bannerSub}</p>
          </div>
        </div>

        <!-- Encabezado de Tasas y Selector 'Hoy' / 'Mañana' -->
        <div>
          <div class="flex justify-between items-center mb-3">
            <div>
              <h2 class="text-xs font-bold uppercase tracking-wider text-gray-400">Tasas Principales ${currentCountry.name}</h2>
              <span class="text-xs font-bold text-cyan-400">${currentCountry.currency.code}</span>
            </div>

            <div class="bg-[#131924] border border-white/10 p-1 rounded-2xl flex items-center space-x-1 shadow-inner">
              <button type="button" data-day="hoy" class="dash-day-btn relative px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${this.selectedDay === 'hoy' ? 'bg-cyan-500/20 text-emerald-400 border border-cyan-500/40 shadow-sm' : 'text-gray-400 hover:text-white'}">
                Hoy
              </button>
              <button type="button" data-day="manana" ${!hasNextDay ? 'disabled="disabled"' : ''} class="dash-day-btn relative px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${!hasNextDay ? 'opacity-40 cursor-not-allowed text-gray-500 bg-transparent' : (this.selectedDay === 'manana' ? 'bg-cyan-500/20 text-emerald-400 border border-cyan-500/40 shadow-sm cursor-pointer' : 'text-gray-400 hover:text-white cursor-pointer')}">
                ${showRedDot ? `
                  <span id="dash-red-dot" class="relative flex h-2 w-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                ` : ''}
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
          <span id="src-${rate.id}" class="text-[10px] text-gray-500 font-medium">${this.getSourceLabel(rates)}</span>
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
              <p id="val-${rate.id}" class="text-2xl font-extrabold text-amber-400 tracking-tight">
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

    const badgeTag = hasOfficialNextDay
      ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><i data-lucide="check-circle" class="w-3 h-3 text-emerald-400"></i> Oficial BCV</span>'
      : '<span class="text-[10px] bg-amber-500/20 text-amber-300 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3 text-amber-400"></i> Pendiente BCV</span>';

    const dateSubtitle = hasOfficialNextDay
      ? escapeHtml(this.cleanText(nextDay.date)) || `Oficial ${nextDayLabel}`
      : `Pendiente por publicación del BCV`;

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
          ${hasOfficialNextDay ? `
            <span id="badge-next-${rate.id}" class="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeBg}">
              <i data-lucide="${trendIcon}" class="w-3.5 h-3.5"></i>
              <span>${formatPercentage(nextDay.change)}</span>
            </span>` : `
            <span class="inline-flex items-center space-x-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-white/5 text-gray-400 border-white/10">
              <span>Pendiente</span>
            </span>`}
        </div>

        <div class="mt-4 flex justify-between items-end">
          <div>
            <p id="val-${rate.id}" class="text-2xl font-extrabold text-emerald-400 tracking-tight">
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
    const rates = mockEngine.getRates();
    dayBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.hasAttribute('disabled') || btn.disabled) return;
        const day = btn.getAttribute('data-day');
        if (day) {
          this._userSelectedDay = true;
          if (day === 'manana') {
            markPredictionRead(rates);
          }
          if (day !== this.selectedDay) {
            this.selectedDay = day;
            this.render();
          }
        }
      });
    });
  }

  subscribeToUpdates() {
    if (this.unsubscribe) this.unsubscribe();

    this.unsubscribe = mockEngine.subscribe((rates, updatedId, action) => {
      if (action === 'rates_refreshed') {
        const hasNextDay = this.hasNextDayRate(rates);
        // Solo reconstruir el DOM cuando cambia la disponibilidad de la publicación del BCV.
        // En flujo normal ('hoy' o 'mañana') se actualizan los nodos en sitio (sin re-render).
        if (hasNextDay !== this._lastHasNextDay) {
          this._lastHasNextDay = hasNextDay;
          this.render();
        } else {
          this._patchRates(rates);
        }
      }
    });
  }

  _patchRates(rates) {
    if (!rates || typeof rates !== 'object') return;
    const rateKeys = Object.keys(rates).filter(k => k !== '_meta');
    const isManana = this.selectedDay === 'manana';
    let iconsChanged = false;

    for (const key of rateKeys) {
      const r = rates[key];
      if (!r || typeof r !== 'object') continue;

      // En modo 'Mañana' las tarjetas oficiales muestran la Fecha Valor publicada;
      // las tarjetas crypto (paralelo) siempre muestran el mercado en vivo.
      const isCrypto = r.id === 'paralelo' || r.type === 'crypto';
      const display = (isManana && !isCrypto && r.nextDay && r.nextDay.published)
        ? r.nextDay
        : r;

      const valEl = document.getElementById(`val-${key}`);
      if (valEl) {
        const val = typeof display.value === 'number' && !isNaN(display.value) ? display.value : null;
        const text = val !== null && val > 0
          ? formatCurrency(val, r.currency, val < 10 ? 4 : 2)
          : '— — —';
        if (valEl.dataset.last !== text) {
          valEl.dataset.last = text;
          valEl.textContent = text;
        }
      }

      const badgeEl = document.getElementById(isManana ? `badge-next-${key}` : `badge-${key}`);
      if (badgeEl) {
        const change = typeof display.change === 'number' ? display.change : 0;
        const isPositive = change >= 0;
        const pctText = formatPercentage(change);
        const txtEl = badgeEl.querySelector('span');
        if (txtEl && txtEl.textContent !== pctText) txtEl.textContent = pctText;

        const iconEl = badgeEl.querySelector('i');
        const nextIcon = isPositive ? 'trending-up' : 'trending-down';
        if (iconEl && iconEl.getAttribute('data-lucide') !== nextIcon) {
          iconEl.setAttribute('data-lucide', nextIcon);
          iconsChanged = true;
        }

        const targetClass = isPositive ? 'bg-emerald-500/10' : 'bg-red-500/10';
        if (badgeEl.className.includes('bg-emerald-500/10') !== isPositive ||
            badgeEl.className.includes('bg-red-500/10') !== !isPositive) {
          badgeEl.className = badgeEl.className
            .replace(/bg-(?:emerald|red)-500\/10\s+text-(?:emerald|red)-400\s+border-(?:emerald|red)-500\/20/,
              `${targetClass} text-${isPositive ? 'emerald' : 'red'}-400 border-${isPositive ? 'emerald' : 'red'}-500/20`);
        }
      }

      const srcEl = document.getElementById(`src-${key}`);
      if (srcEl) {
        const label = this.getSourceLabel(rates);
        if (srcEl.dataset.src !== label) {
          srcEl.dataset.src = label;
          srcEl.innerHTML = label;
        }
      }
    }

    // Banner
    const banner = this._computeBanner(rates);
    const tagEl = document.getElementById('dash-banner-tag');
    const textEl = document.getElementById('dash-banner-text');
    const subEl = document.getElementById('dash-banner-sub');
    if (tagEl && tagEl.textContent !== banner.bannerTag) tagEl.textContent = banner.bannerTag;
    if (textEl && textEl.textContent !== banner.bannerText) textEl.textContent = banner.bannerText;
    if (subEl && subEl.textContent !== banner.bannerSub) subEl.textContent = banner.bannerSub;

    if (iconsChanged && window.lucide) window.lucide.createIcons();
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
    return getNextBusinessDayName(rates || this.currentCountry?.rates);
  }

  hasNextDayRate(rates) {
    if (!rates) rates = this.currentCountry?.rates;
    if (!rates || typeof rates !== 'object') return false;
    return Object.values(rates).some(r =>
      r && r.nextDay && r.nextDay.published && typeof r.nextDay.value === 'number' && r.nextDay.value > 0
    );
  }

  getPillLabel(rateKey, rateObj) {
    if (!rateObj) return rateKey || '';
    if (rateKey === 'bcv') return 'BCV';
    if (rateKey === 'paralelo' || rateObj.id === 'paralelo') return 'USDT';
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
    // Usar tasa del día siguiente si está publicada; si no, usar la tasa de hoy como referencia
    if (this.selectedDay === 'prediccion') {
      if (rateObj.nextDay && rateObj.nextDay.published && rateObj.nextDay.value) {
        return rateObj.nextDay.value;
      }
      return rateObj.value || 1;
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
      case 'placeholder':
        return `<span class="text-[9px] text-cyan-400/80 font-bold">Conectando...</span>`;
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

    const hasNextDay = this.hasNextDayRate(rates);
    this._lastHasNextDay = hasNextDay;
    const isNextDayDef = typeof localStorage !== 'undefined' && localStorage.getItem('dolarfy_next_day_default') === 'true';
    if (!this._userSelectedDay && isNextDayDef && hasNextDay) {
      this.selectedDay = 'prediccion';
    } else if (!hasNextDay && this.selectedDay === 'prediccion') {
      this.selectedDay = 'hoy';
    }

    if (!rates[this.selectedRateId]) {
      this.selectedRateId = this.currentCountry.defaultRateId && rates[this.selectedRateId]
        ? this.currentCountry.defaultRateId
        : rateKeys[0];
    }

    const activeRateObj = rates[this.selectedRateId] || Object.values(rates)[0];
    const activeRate = this.getEffectiveRate(activeRateObj);
    this._lastActiveRate = activeRate;
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
    const nextDayLabel = this.getNextDayLabel(rates);
    const quickAmounts = this.fromCurrency === 'VES'
      ? [100, 500, 1000, 2000, 5000]
      : [1, 5, 10, 20, 50, 100];

    this.container.innerHTML = `
      <div class="space-y-3 pb-24 animate-fade-in max-w-md mx-auto">
        
        <!-- 1. Barra Superior: Tasas + Selector Hoy/Predicción -->
        <div class="w-full text-xs space-y-2">
          <!-- Píldoras de Tasas del País -->
          <div class="grid gap-1 bg-black/40 p-1 rounded-2xl border border-white/10 w-full items-center" style="grid-template-columns: repeat(${Math.min(rateKeys.length, 4)}, minmax(0, 1fr));" id="rate-pills-group">
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

          <!-- Selector Hoy / Predicción -->
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-gray-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">Calcular con tasa de: ${this.getSourceLabel(rates)}</span>
            <div class="bg-[#131924] border border-white/10 p-0.5 rounded-xl flex items-center space-x-0.5 shadow-inner" id="calc-day-toggle">
              <button type="button" data-calcday="hoy" class="calc-day-btn px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${this.selectedDay === 'hoy' ? 'bg-cyan-500/20 text-emerald-400 border border-cyan-500/40 shadow-sm' : 'text-gray-400 hover:text-white'}">
                Hoy
              </button>
              <button type="button" data-calcday="prediccion" ${!hasNextDay ? 'disabled="disabled"' : ''} class="calc-day-btn relative px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${!hasNextDay ? 'opacity-40 cursor-not-allowed text-gray-500 bg-transparent' : (this.selectedDay === 'prediccion' ? 'bg-cyan-500/20 text-emerald-400 border border-cyan-500/40 shadow-sm cursor-pointer' : 'text-gray-400 hover:text-white cursor-pointer')}">
                ${(hasNextDay && !isPredictionRead(rates)) ? `
                  <span id="calc-red-dot" class="relative flex h-2 w-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                ` : ''}
                <span>${nextDayLabel}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 2. Pantalla Digital de Conversión Integrada -->
        <div class="glass-card rounded-3xl p-4 relative space-y-3 shadow-2xl border border-white/10 bg-[#111622]/95">
          
          <!-- Top info bar inside card -->
          <div class="flex items-center justify-between">
            <span id="rate-badge-pill" class="bg-black/50 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
              ${this.selectedDay === 'prediccion' && hasNextDay
                ? `<i data-lucide="calendar-check" class="w-3 h-3 text-amber-400"></i><span class="text-amber-300">${nextDayLabel}:</span>`
                : `<i data-lucide="sun" class="w-3 h-3 text-emerald-400"></i>`
              }
              ${activeRate.toFixed(activeRate < 10 ? 4 : 2)}
            </span>
            <div class="flex items-center space-x-3 text-cyan-400">
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

        <!-- 2.5 Carga Rápida de Montos Predefinidos -->
        <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-0.5" id="calc-quick-amounts">
          <span class="text-[10px] text-gray-500 font-bold uppercase tracking-wider shrink-0 pl-1">Rápido:</span>
          ${quickAmounts.map(val => `
            <button data-quick-val="${val}" type="button" class="calc-quick-chip py-1 px-2.5 rounded-xl bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/30 text-gray-300 hover:text-cyan-300 text-xs font-bold transition-all active:scale-95 cursor-pointer shrink-0">
              ${fromSym} ${val}
            </button>
          `).join('')}
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
    const copyBtn = document.getElementById('copy-result-btn');
    const historyBtn = document.getElementById('calc-history-btn');
    const keypadKeys = document.querySelectorAll('#calc-keypad button');
    const quickChips = this.container.querySelectorAll('.calc-quick-chip');

    quickChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const val = chip.getAttribute('data-quick-val');
        if (val) {
          this.expression = val;
          const displayInput = document.getElementById('calc-display-input');
          const currentSym = this.getCurrencySymbol(this.fromCurrency);
          if (displayInput) {
            displayInput.textContent = `${this.expression} ${currentSym}`;
          }
          this.calculate();
        }
      });
    });

    // Selector Hoy / Predicción (Día Siguiente)
    const dayBtns = document.querySelectorAll('.calc-day-btn');
    const rates = this.currentCountry?.rates;
    dayBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.hasAttribute('disabled') || btn.disabled) return;
        const day = btn.getAttribute('data-calcday');
        if (day) {
          this._userSelectedDay = true;
          if (day === 'prediccion') {
            markPredictionRead(rates);
          }
          if (day !== this.selectedDay) {
            this.selectedDay = day;
            this.render();
          }
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

    copyBtn?.addEventListener('click', () => {
      const displayEl = document.getElementById('calc-equality-display');
      if (!displayEl) return;
      const fullText = displayEl.textContent.trim();
      
      // Extraer únicamente el resultado después del signo '=' (por ejemplo: "84.855,00 Bs.")
      let resultOnly = fullText;
      if (fullText.includes('=')) {
        resultOnly = fullText.split('=').pop().trim();
      }
      // Limpiar símbolos de moneda, letras y puntos/comas sobrantes al final (ej. "Bs." -> sin punto al final)
      resultOnly = resultOnly.replace(/[^\d.,]/g, '').replace(/[.,]+$/, '').trim();

      const performCopy = (text) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text);
        } else {
          const textArea = document.createElement('textarea');
          textArea.value = text;
          textArea.style.position = 'fixed';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          try {
            document.execCommand('copy');
            document.body.removeChild(textArea);
            return Promise.resolve();
          } catch (err) {
            document.body.removeChild(textArea);
            return Promise.reject(err);
          }
        }
      };

      performCopy(resultOnly).then(() => {
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
    } catch (e) {
      if (e.message && e.message.includes('cero')) {
        this.expression = '0';
      }
    }
  }

  saveToHistory() {
    const equalityEl = document.getElementById('calc-equality-display');
    if (!equalityEl) return;
    const resultText = equalityEl.textContent.trim();
    if (resultText.includes('Indefinido') || this.expression === '0') return;

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
      if (e.message && e.message.includes('cero')) {
        const equalityEl = document.getElementById('calc-equality-display');
        if (equalityEl) {
          equalityEl.textContent = 'Indefinido (÷ 0)';
        }
        return;
      }
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
        this._patchRates(rates);
      }
    });
  }

  _patchRates(rates) {
    if (!rates || typeof rates !== 'object') return;

    const hasNextDay = this.hasNextDayRate(rates);
    if (hasNextDay !== this._lastHasNextDay) {
      this._lastHasNextDay = hasNextDay;
      this.render();
      return;
    }

    const activeRateObj = (this.currentCountry.rates || rates)[this.selectedRateId];
    if (!activeRateObj) return;

    const newRate = this.getEffectiveRate(activeRateObj);
    if (this._lastActiveRate === newRate) return;
    this._lastActiveRate = newRate;

    const pillEl = document.getElementById('rate-badge-pill');
    if (pillEl) {
      pillEl.innerHTML = `${this.selectedDay === 'prediccion' && hasNextDay
        ? `<i data-lucide="calendar-check" class="w-3 h-3 text-amber-400"></i><span class="text-amber-300">${this.getNextDayLabel(rates)}:</span>`
        : `<i data-lucide="sun" class="w-3 h-3 text-emerald-400"></i>`} ${newRate.toFixed(newRate < 10 ? 4 : 2)}`;
      if (window.lucide) window.lucide.createIcons();
    }
    this.calculate();
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}


  // --- js/components/analytics.js ---





const HISTORICAL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
// Caché compartida entre instancias: sobrevive a los cambios de pestaña (evita re-descargar históricos)
const historicalCacheStore = {}; // { rateKey: { ts, data } }

class AnalyticsView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.chart = null;
    this.selectedPeriod = '1M'; // 1W, 1M, 3M, 1Y
    this.selectedRateFilter = 'all'; // 'all' o ID de tasa específica
    this.historicalCache = historicalCacheStore; // Cache de datos históricos reales
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
    if (rateKey === 'paralelo' || rateObj.id === 'paralelo') return 'USDT';
    return rateObj.name.split(' ')[0];
  }

  getDaysForPeriod(period) {
    switch (period) {
      case '1W': return 7;
      case '3M': return 90;
      case '1Y': return 365;
      default: return 30;
    }
  }

  async fetchHistoricalData(rateKey, days) {
    const endpointMap = {
      bcv: 'https://ve.dolarapi.com/v1/historicos/dolares/oficial',
      paralelo: 'https://ve.dolarapi.com/v1/historicos/dolares/paralelo',
      euro: 'https://ve.dolarapi.com/v1/historicos/euros'
    };
    const fuenteMap = { bcv: 'oficial', paralelo: 'paralelo', euro: 'oficial' };
    const url = endpointMap[rateKey];
    const fuente = fuenteMap[rateKey];
    if (!url || !fuente) return null;

    // Usar caché compartida si aún no caducó
    const cached = this.historicalCache[rateKey];
    if (cached && cached.data && (Date.now() - cached.ts) < HISTORICAL_CACHE_TTL_MS) {
      return this._filterHistorical(cached.data, days);
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

      this.historicalCache[rateKey] = { data: parsed, ts: Date.now() };
      return this._filterHistorical(parsed, days);
    } catch (e) {
      console.warn(`Error al cargar histórico para ${rateKey}:`, e);
    }

    return null;
  }

  _filterHistorical(series, days) {
    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - days);
    const fromStr = from.toISOString().split('T')[0];
    const toStr = today.toISOString().split('T')[0];
    return series.filter(d => d.date >= fromStr && d.date <= toStr);
  }

  processHistoricalForChart(historicalData, period) {
    if (!historicalData || historicalData.length === 0) return null;

    let data = [...historicalData];
    const maxPoints = { '1W': 7, '1M': 30, '3M': 45, '1Y': 52 };
    const targetPoints = maxPoints[period] || 30;

    if (data.length > targetPoints) {
      const step = Math.ceil(data.length / targetPoints);
      const sampled = [];
      for (let i = 0; i < data.length; i += step) {
        sampled.push(data[i]);
      }
      if (sampled[sampled.length - 1] !== data[data.length - 1]) {
        sampled.push(data[data.length - 1]);
      }
      data = sampled;
    }

    const points = data.map(d => ({
      x: new Date(d.date + 'T12:00:00').getTime(),
      y: d.value
    }));

    return { points, rawData: data };
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
        
        <!-- Header con indicador de país -->
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-lg font-extrabold text-white leading-tight flex items-center gap-2">
              <span>Tendencias de Mercado</span>
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
            </h2>
            <p class="text-xs text-gray-400 mt-0.5">Histórico y variaciones oficiales · ${currentCountry.name}</p>
          </div>

          <div class="bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold px-3 py-1.5 rounded-full flex items-center space-x-1.5 shadow-sm">
            <img src="${currentCountry.flagUrl}" alt="${currentCountry.name}" class="w-4 h-4 rounded-full object-cover">
            <span>${currentCountry.currency.code}</span>
          </div>
        </div>

        <!-- Tarjetas de Métricas Principales (Brecha, Mínimo, Máximo, Variación) -->
        <div class="grid grid-cols-3 gap-2">
          <!-- Brecha BCV vs Paralelo -->
          <div class="glass-card rounded-2xl p-3 text-center border border-white/10 hover:border-cyan-500/30 transition-all">
            <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Brecha Oficial/P2P</span>
            <p id="gap-value" class="text-lg font-black text-cyan-400 mt-0.5">${gapPercent > 0 ? `+${gapPercent.toFixed(2)}%` : '0.00%'}</p>
            <span class="text-[9px] text-gray-400 font-semibold block truncate">Diferencia BCV vs USDT</span>
          </div>

          <!-- Mínimo del Período -->
          <div class="glass-card rounded-2xl p-3 text-center border border-white/10 hover:border-emerald-500/30 transition-all">
            <span id="min-period-label" class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Piso (${periodDetails.short})</span>
            <p id="stat-min-value" class="text-sm font-black text-emerald-400 mt-1">— — —</p>
            <span class="text-[9px] text-gray-500 font-medium block">Valor mínimo</span>
          </div>

          <!-- Máximo del Período -->
          <div class="glass-card rounded-2xl p-3 text-center border border-white/10 hover:border-amber-500/30 transition-all">
            <span id="max-period-label" class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Techo (${periodDetails.short})</span>
            <p id="stat-max-value" class="text-sm font-black text-amber-400 mt-1">— — —</p>
            <span class="text-[9px] text-gray-500 font-medium block">Valor máximo</span>
          </div>
        </div>

        <!-- Tarjeta Principal del Gráfico ApexCharts -->
        <div class="glass-card rounded-3xl p-4 relative overflow-hidden space-y-3 border border-white/10 shadow-2xl bg-[#111622]/95">
          
          <!-- Filtros del Gráfico: Tasas y Períodos -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <i data-lucide="line-chart" class="w-3.5 h-3.5 text-cyan-400"></i> Comportamiento Histórico
              </span>
              <span id="period-info-text" class="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                ${periodDetails.text}
              </span>
            </div>

            <!-- Píldoras de Tasas -->
            <div class="grid grid-cols-${Math.min(rateKeys.length + 1, 4)} gap-1 bg-black/40 p-1 rounded-2xl border border-white/10 w-full items-center" id="analytics-rate-filter">
              <button data-rate="all" class="w-full py-1.5 px-1 text-[11px] font-bold rounded-xl transition-all text-center truncate cursor-pointer ${this.selectedRateFilter === 'all' ? 'bg-cyan-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                Todas
              </button>
              ${rateKeys.map(key => {
                const r = rates[key];
                const isSel = this.selectedRateFilter === key;
                const pillLabel = this.getPillLabel(key, r);
                return `
                  <button data-rate="${key}" class="w-full py-1.5 px-1 text-[11px] font-bold rounded-xl transition-all text-center truncate cursor-pointer ${isSel ? 'bg-cyan-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                    ${pillLabel}
                  </button>
                `;
              }).join('')}
            </div>

            <!-- Selector de Período Temporal -->
            <div class="bg-black/40 p-1 rounded-2xl border border-white/10 flex justify-between gap-1" id="period-selector">
              ${[
                { code: '1W', name: '7 Días' },
                { code: '1M', name: '30 Días' },
                { code: '3M', name: '90 Días' },
                { code: '1Y', name: '1 Año' }
              ].map(p => `
                <button data-period="${p.code}" title="${p.name}" class="flex-1 py-1.5 text-[11px] font-bold rounded-xl text-center transition-all cursor-pointer ${this.selectedPeriod === p.code ? 'bg-emerald-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                  ${p.code}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Contenedor del Gráfico -->
          <div id="apex-analytics-chart" class="w-full h-64 pt-1 relative">
            <div id="chart-loading-skeleton" class="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div class="w-8 h-8 border-2 border-cyan-500/40 border-t-cyan-400 rounded-full animate-spin"></div>
              <p class="text-[10px] text-gray-400 font-semibold">Cargando datos históricos del BCV...</p>
            </div>
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
    const colorMap = {
      bcv: '#06B6D4',      // Cyan para Dólar BCV
      paralelo: '#F59E0B', // Amarillo para Binance P2P
      euro: '#10B981'      // Esmeralda para Euro BCV
    };

    const seriesData = [];
    let categories = [];
    let hasRealData = false;
    let bcvHistoricalPoints = null;

    const rangeKey = this.selectedRateFilter !== 'all' && rates[this.selectedRateFilter]
      ? this.selectedRateFilter
      : 'bcv';
    let realMin = Infinity;
    let realMax = -Infinity;
    let hasRangeData = false;

    for (let index = 0; index < activeKeys.length; index++) {
      const key = activeKeys[index];
      const rateObj = rates[key];

      const historicalRaw = await this.fetchHistoricalData(key, days);
      let chartData = null;

      if (historicalRaw && historicalRaw.length > 0) {
        chartData = this.processHistoricalForChart(historicalRaw, this.selectedPeriod);
        hasRealData = true;
        if (key === 'bcv') bcvHistoricalPoints = historicalRaw;

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

      if (chartData && chartData.points.length > 0) {
        seriesData.push({
          name: rateObj.name,
          data: chartData.points,
          color: colorMap[key] || '#8B5CF6'
        });
      }
      // Sin datos históricos reales: la serie se omite (no se inventa ningún punto)
    }

    const skeleton = document.getElementById('chart-loading-skeleton');
    if (skeleton) skeleton.remove();

    if (!hasRealData || seriesData.every(s => s.data.length <= 1)) {
      chartContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full gap-2 py-8">
          <i data-lucide="wifi-off" class="w-8 h-8 text-gray-500"></i>
          <p class="text-[11px] text-gray-400 font-semibold text-center">Datos históricos no disponibles</p>
          <p class="text-[10px] text-gray-500 text-center">Conéctate a Internet para cargar el gráfico histórico oficial del BCV</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // Actualizar Mínimo y Máximo
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
        height: 230,
        toolbar: { show: false },
        background: 'transparent',
        sparkline: { enabled: false },
        animations: { enabled: true, speed: 450 }
      },
      colors: seriesData.map(s => s.color),
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.45,
          opacityTo: 0.05,
          stops: [0, 100]
        }
      },
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 2.5 },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeUTC: false,
          format: this.selectedPeriod === '1Y' ? 'MMM yy' : 'dd MMM',
          style: { colors: themeService.getTheme() === 'light' ? '#64748B' : '#9CA3AF', fontSize: '9px', fontWeight: 600 }
        },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: {
          style: { colors: themeService.getTheme() === 'light' ? '#64748B' : '#9CA3AF', fontSize: '9px', fontWeight: 600 },
          formatter: (val) => val ? val.toFixed(val < 10 ? 2 : 0) : ''
        }
      },
      grid: {
        borderColor: themeService.getTheme() === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.06)',
        strokeDashArray: 4
      },
      legend: {
        labels: { colors: themeService.getTheme() === 'light' ? '#0F172A' : '#E5E7EB' },
        fontSize: '10px',
        position: 'top',
        horizontalAlign: 'right',
        markers: { radius: 12 }
      },
      tooltip: {
        theme: themeService.getTheme() === 'light' ? 'light' : 'dark',
        x: { format: 'dd MMM yyyy' },
        y: {
          formatter: (val) => formatCurrency(val, currentCountry.currency.code, val < 10 ? 4 : 2)
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
          b.className = `flex-1 py-1.5 text-[11px] font-bold rounded-xl text-center transition-all cursor-pointer ${isSel ? 'bg-emerald-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}`;
        });

        const infoText = document.getElementById('period-info-text');
        if (infoText) infoText.textContent = details.text;

        const minLabel = document.getElementById('min-period-label');
        if (minLabel) minLabel.textContent = `Piso (${details.short})`;

        const maxLabel = document.getElementById('max-period-label');
        if (maxLabel) maxLabel.textContent = `Techo (${details.short})`;

        this.initChart();
      });
    });

    const rateFilterBtns = document.querySelectorAll('#analytics-rate-filter button');
    rateFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedRateFilter = btn.getAttribute('data-rate');
        rateFilterBtns.forEach(b => {
          const isSel = b.getAttribute('data-rate') === this.selectedRateFilter;
          b.className = `w-full py-1.5 px-1 text-[11px] font-bold rounded-xl transition-all text-center truncate cursor-pointer ${isSel ? 'bg-cyan-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}`;
        });
        this.initChart();
      });
    });
  }

  subscribeToUpdates() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = mockEngine.subscribe((rates, updatedId, action) => {
      if (action === 'rates_refreshed') {
        // No recrear el gráfico en cada refresco: solo actualizar métricas en vivo
        this._patchLiveMetrics(rates);
      }
    });
  }

  _patchLiveMetrics(rates) {
    if (!rates || typeof rates !== 'object') return;
    const bcvRate = rates.bcv;
    const paraleloRate = rates.paralelo;
    const gapEl = document.getElementById('gap-value');
    if (
      gapEl && bcvRate && paraleloRate &&
      typeof bcvRate.value === 'number' && typeof paraleloRate.value === 'number' &&
      bcvRate.value > 0 && paraleloRate.value > 0
    ) {
      const gap = ((paraleloRate.value / bcvRate.value) - 1) * 100;
      const text = gap > 0 ? `+${gap.toFixed(2)}%` : '0.00%';
      if (gapEl.textContent !== text) gapEl.textContent = text;
    }
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

  isNextDayDefault() {
    return localStorage.getItem('dolarfy_next_day_default') === 'true';
  }

  toggleNextDayDefault() {
    const val = !this.isNextDayDefault();
    localStorage.setItem('dolarfy_next_day_default', String(val));
    return val;
  }

  render() {
    const isNotifEnabled = notificationService.isEnabled();
    const isNextDayDef = this.isNextDayDefault();
    const isDarkTheme = themeService.getTheme() === 'dark';

    this.container.innerHTML = `
      <div class="space-y-4 pb-24 animate-fade-in max-w-md mx-auto">
        
        <!-- Header de Ajustes -->
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-extrabold text-white tracking-tight">Ajustes</h2>
            <p class="text-xs text-gray-400 mt-0.5">Configura tu experiencia en Dolarfy</p>
          </div>
          <div class="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <i data-lucide="sliders" class="w-5 h-5"></i>
          </div>
        </div>

        <!-- Tarjeta Promocional: ¡Conviértete en usuario PRO! -->
        <div class="glass-card rounded-3xl p-5 border border-white/10 shadow-xl space-y-3.5">
          
          <div class="flex items-center space-x-3">
            <i data-lucide="star" class="w-6 h-6 text-white shrink-0"></i>
            <div>
              <h3 class="text-base font-extrabold text-white">¡Conviértete en usuario PRO!</h3>
              <p class="text-[11px] text-gray-400 font-medium">Disfruta la versión definitiva de Dolarfy</p>
            </div>
          </div>

          <ul class="space-y-2.5 text-xs text-gray-300">
            <li class="flex items-start space-x-2.5">
              <i data-lucide="ban" class="w-4 h-4 text-white mt-0.5 shrink-0"></i>
              <div>
                <span class="font-bold text-white">Adiós a la publicidad:</span>
                <span class="text-gray-400"> Disfruta de una interfaz limpia y sin interrupciones.</span>
              </div>
            </li>
            <li class="flex items-start space-x-2.5">
              <i data-lucide="zap" class="w-4 h-4 text-white mt-0.5 shrink-0"></i>
              <div>
                <span class="font-bold text-white">Máxima velocidad:</span>
                <span class="text-gray-400"> Navegación más fluida.</span>
              </div>
            </li>
            <li class="flex items-start space-x-2.5">
              <i data-lucide="heart" class="w-4 h-4 text-white mt-0.5 shrink-0"></i>
              <div>
                <span class="font-bold text-white">Apoya el proyecto:</span>
                <span class="text-gray-400"> Ayúdanos a seguir mejorando la herramienta.</span>
              </div>
            </li>
          </ul>

          <button id="settings-pro-btn" type="button" class="w-full py-3 px-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs shadow-md flex items-center justify-center space-x-2 transition-all active:scale-[0.98] cursor-pointer">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
            <span>Obtener PRO - USD 1,99</span>
          </button>
        </div>

        <!-- Sección General -->
        <div class="space-y-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">General</h3>

          <!-- Tema Oscuro / Claro -->
          <div class="glass-card rounded-2xl p-4 flex items-center justify-between border border-white/10 hover:border-cyan-500/30 transition-all">
            <div class="flex items-center space-x-3 pr-2">
              <i data-lucide="${isDarkTheme ? 'moon' : 'sun'}" class="w-5 h-5 text-cyan-400 shrink-0"></i>
              <div>
                <h4 class="text-xs font-bold text-white">Tema de la Interfaz</h4>
                <p class="text-[10px] text-gray-400 mt-0.5">${isDarkTheme ? 'Modo Oscuro (Predeterminado)' : 'Modo Claro'}</p>
              </div>
            </div>

            <button id="settings-theme-toggle" type="button" aria-label="Cambiar Tema" class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isDarkTheme ? 'bg-cyan-500' : 'bg-gray-500'}">
              <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isDarkTheme ? 'translate-x-5' : 'translate-x-0'}"></span>
            </button>
          </div>

          <!-- Notificaciones -->
          <div class="glass-card rounded-2xl p-4 flex items-center justify-between border border-white/10 hover:border-cyan-500/30 transition-all">
            <div class="flex items-center space-x-3 pr-2">
              <i data-lucide="bell" class="w-5 h-5 text-white shrink-0"></i>
              <div>
                <h4 class="text-xs font-bold text-white">Notificaciones</h4>
                <p class="text-[10px] text-gray-400 mt-0.5">Avisar cuando salga nueva tasa</p>
              </div>
            </div>

            <button id="settings-notif-toggle" type="button" class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isNotifEnabled ? 'bg-cyan-500' : 'bg-gray-700'}">
              <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isNotifEnabled ? 'translate-x-5' : 'translate-x-0'}"></span>
            </button>
          </div>

          <!-- Siguiente tasa por defecto -->
          <div class="glass-card rounded-2xl p-4 flex items-center justify-between border border-white/10 hover:border-cyan-500/30 transition-all">
            <div class="flex items-center space-x-3 pr-2">
              <i data-lucide="trending-up" class="w-5 h-5 text-white shrink-0"></i>
              <div>
                <h4 class="text-xs font-bold text-white">Siguiente tasa por defecto</h4>
                <p class="text-[10px] text-gray-400 mt-0.5 leading-snug">Usar la tasa de mañana/siguiente día automáticamente cuando esté disponible.</p>
              </div>
            </div>

            <button id="settings-nextday-toggle" type="button" class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isNextDayDef ? 'bg-cyan-500' : 'bg-gray-700'}">
              <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isNextDayDef ? 'translate-x-5' : 'translate-x-0'}"></span>
            </button>
          </div>

          <!-- Idioma -->
          <button id="settings-language-btn" type="button" class="w-full glass-card rounded-2xl p-4 flex items-center justify-between border border-white/10 hover:border-cyan-500/30 transition-all text-left cursor-pointer group">
            <div class="flex items-center space-x-3">
              <i data-lucide="globe" class="w-5 h-5 text-white shrink-0"></i>
              <div>
                <h4 class="text-xs font-bold text-white">Idioma</h4>
                <p class="text-[10px] text-gray-400 mt-0.5">Predeterminado del sistema</p>
              </div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-all"></i>
          </button>
        </div>

        <!-- Sección Información -->
        <div class="space-y-2 pt-1">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Información</h3>

          <!-- Compartir app -->
          <button id="settings-share-btn" type="button" class="w-full glass-card rounded-2xl p-4 flex items-center justify-between border border-white/10 hover:border-cyan-500/30 transition-all text-left cursor-pointer group">
            <div class="flex items-center space-x-3">
              <i data-lucide="share-2" class="w-5 h-5 text-white shrink-0"></i>
              <div>
                <h4 class="text-xs font-bold text-white">Compartir app</h4>
                <p class="text-[10px] text-gray-400 mt-0.5">Recomienda esta aplicación a tus amigos</p>
              </div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-all"></i>
          </button>

          <!-- Calificar app -->
          <button id="settings-rate-btn" type="button" class="w-full glass-card rounded-2xl p-4 flex items-center justify-between border border-white/10 hover:border-cyan-500/30 transition-all text-left cursor-pointer group">
            <div class="flex items-center space-x-3">
              <i data-lucide="star" class="w-5 h-5 text-white shrink-0"></i>
              <div>
                <h4 class="text-xs font-bold text-white">Calificar app</h4>
                <p class="text-[10px] text-gray-400 mt-0.5">Apoya este proyecto con 5 estrellas</p>
              </div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-all"></i>
          </button>

          <!-- Acerca de la app -->
          <button id="settings-about-btn" type="button" class="w-full glass-card rounded-2xl p-4 flex items-center justify-between border border-white/10 hover:border-cyan-500/30 transition-all text-left cursor-pointer group">
            <div class="flex items-center space-x-3">
              <i data-lucide="info" class="w-5 h-5 text-white shrink-0"></i>
              <div>
                <h4 class="text-xs font-bold text-white">Acerca de la app</h4>
                <p class="text-[10px] text-gray-400 mt-0.5">Versión, desarrollador y licencias</p>
              </div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-all"></i>
          </button>
        </div>

      </div>
    `;

    this.attachEvents();
    this.subscribeToUpdates();
    if (window.lucide) window.lucide.createIcons();
  }

  subscribeToUpdates() {
    // La vista de Ajustes no muestra tasas: no necesita re-renderizar en cada refresco.
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = mockEngine.subscribe(() => {});
  }

  attachEvents() {
    const themeToggle = document.getElementById('settings-theme-toggle');
    const notifToggle = document.getElementById('settings-notif-toggle');
    const nextdayToggle = document.getElementById('settings-nextday-toggle');
    const proBtn = document.getElementById('settings-pro-btn');
    const langBtn = document.getElementById('settings-language-btn');
    const shareBtn = document.getElementById('settings-share-btn');
    const rateBtn = document.getElementById('settings-rate-btn');
    const aboutBtn = document.getElementById('settings-about-btn');

    themeToggle?.addEventListener('click', () => {
      themeService.toggleTheme();
      this.render();
      showToast(
        themeService.getTheme() === 'dark' ? 'Modo Oscuro activado' : 'Modo Claro activado',
        'Tema',
        themeService.getTheme() === 'dark' ? 'moon' : 'sun'
      );
    });

    notifToggle?.addEventListener('click', async () => {
      await notificationService.toggleNotifications();
      this.render();
      document.dispatchEvent(new CustomEvent('dolarfy:notification_toggled'));
    });

    nextdayToggle?.addEventListener('click', () => {
      this.toggleNextDayDefault();
      this.render();
    });

    proBtn?.addEventListener('click', () => {
      showDialogModal({
        title: 'Dolarfy PRO',
        body: 'Próximamente disponible la suscripción PRO en tiendas oficiales.',
        icon: 'sparkles'
      });
    });

    langBtn?.addEventListener('click', () => {
      showDialogModal({
        title: 'Idioma de la Aplicación',
        body: 'Actualmente configurado en Español (Predeterminado del sistema).',
        icon: 'globe'
      });
    });

    shareBtn?.addEventListener('click', async () => {
      const shareUrl = (window.location.protocol === 'http:' && window.location.hostname === 'localhost') || window.location.protocol === 'file:'
        ? 'https://github.com/adrianjesus1209-beep/dolarfy-app/releases/latest'
        : window.location.href;

      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Dolarfy - Cotizaciones en tiempo real',
            text: 'Calcula y consulta las tasas de cambio de Venezuela en tiempo real con Dolarfy.',
            url: shareUrl
          });
        } catch (e) {
          console.warn('Share cancelled or error:', e);
        }
      } else {
        try {
          await navigator.clipboard.writeText(shareUrl);
          showToast('¡Enlace de Dolarfy copiado al portapapeles!', 'Compartir', 'check-circle');
        } catch {
          showToast(`URL: ${shareUrl}`, 'Comparte Dolarfy', 'share-2');
        }
      }
    });

    rateBtn?.addEventListener('click', () => {
      showDialogModal({
        title: '¡Muchas gracias!',
        body: 'Tu calificación nos ayuda a seguir mejorando Dolarfy.',
        icon: 'star'
      });
    });

    aboutBtn?.addEventListener('click', () => {
      aboutModal.open();
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
    this.bindCountryButton();
    this.bindRefreshButton();
    this.updateHeaderBellUI();
    this.navigateTo(this.activeTab);

    // Programar recordatorio diario de la tasa BCV (17:00 VET) si las alertas están activas
    notificationService.scheduleDailyReminder();

    // Suscribir a cambios globales en mockEngine
    mockEngine.subscribe((rates, updatedRateId, action) => {
      if (action === 'rates_refreshed') {
        notificationService.checkDailyUpdate(mockEngine.getCurrentCountry(), rates);
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

    // Manejador global para cerrar modales abiertos con tecla Escape o botón Atrás de Android
    window.__dolarfyCloseTopModal = () => {
      const containers = [
        '#country-modal-container',
        '#notification-modal-container',
        '#about-modal-container',
        '#calc-history-modal-container',
        '#dialog-modal-container'
      ];
      for (const sel of containers) {
        const el = document.querySelector(sel);
        if (el && el.innerHTML.trim().length > 0) {
          el.innerHTML = '';
          return true;
        }
      }
      return false;
    };
    window.__handleAndroidBack = window.__dolarfyCloseTopModal;

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        window.__dolarfyCloseTopModal();
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

  bindCountryButton() {
    document.addEventListener('click', (e) => {
      const countryBtn = e.target.closest('#header-country-btn');
      if (countryBtn) {
        e.preventDefault();
        e.stopPropagation();
        countryModal.open();
      }
    });
  }

  bindRefreshButton() {
    document.addEventListener('click', async (e) => {
      const refreshBtn = e.target.closest('#header-refresh-btn');
      if (refreshBtn) {
        e.preventDefault();
        e.stopPropagation();
        const icon = refreshBtn.querySelector('i');
        if (icon) icon.classList.add('animate-spin');
        try {
          await mockEngine.syncRealRates(true);
          showToast('Tasas actualizadas en tiempo real', 'Sincronizado', 'check-circle');
        } catch (err) {
          showToast('No se pudo conectar a los servidores en vivo', 'Error de Conexión', 'alert-circle');
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
