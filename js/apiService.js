/**
 * Servicio de tasas de cambio reales para Dolarfy
 * Fuente oficial BCV: portal oficial bcv.org.ve (con proxies) + ve.dolarapi.com + api.dolarvzla.com (respaldo)
 * Fuente mercado USDT/VES: Binance P2P C2C en tiempo real
 */

import { RATES_CACHE_KEY_PREFIX } from './constants.js';
import { getNextBusinessDayName } from './utils/formatters.js';

const REQUEST_TIMEOUT_MS = 10000;

export async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = { 'Accept': 'application/json, text/html, */*', ...(options.headers || {}) };

  try {
    return await fetch(url, { ...options, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Cadencia por fuente (evita golpear APIs innecesariamente y agotar cuotas gratuitas)
const API_SOURCE_CONFIG = {
  binance: { ttlMs: 30 * 1000 },      // Binance P2P: alta volatilidad (30s óptimo PQ exacta)
  dolarapi: { ttlMs: 60 * 1000 },      // DolarApi: cambios moderados
  histDolarapi: { ttlMs: 15 * 60 * 1000 }, // DolarApi históricos: la Fecha Valor cambia 1 vez/día hábil
  bcvSite: { ttlMs: 15 * 60 * 1000 },  // Scraping BCV: 1 publicación/día hábil
  dolarvzla: { ttlMs: 15 * 60 * 1000 } // Respaldo BCV
};

const BACKOFF_BASE_MS = 5 * 1000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;

class ApiService {
  constructor() {
    this.CACHE_TTL_MS = 60 * 1000;            // 60s — sirve caché y refresca en segundo plano
    this.STALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días máximo stale
    this.isSyncing = false;
    this._inflightPromise = null;
    this._lastRates = null;      // Última tasa válida conocida (memoria)
    this._lastFetchedAt = 0;
    this._attempts = 0;
    this._sourceState = {};      // Circuit breaker por fuente
  }

  _fetch(url, options = {}) {
    return fetchWithTimeout(url, options);
  }

  _decorate(rates, source = 'live', extra = {}) {
    rates._meta = { source, fetchedAt: extra.fetchedAt || Date.now(), ...extra };
    return rates;
  }

  // --------------------------------------------------------------------------
  // Control de cadencia / circuit breaker por fuente
  // --------------------------------------------------------------------------

  _shouldFetchSource(source) {
    const cfg = API_SOURCE_CONFIG[source];
    if (!cfg) return true;
    const state = this._sourceState[source];
    if (!state) return true;
    return !state.nextAllowedAt || Date.now() >= state.nextAllowedAt;
  }

  _markSource(source, ok) {
    const cfg = API_SOURCE_CONFIG[source];
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

  async _request({ source, url, options = {}, parse = 'json' }) {
    if (!this._shouldFetchSource(source)) return { status: 'skip', data: null };
    this._attempts++;
    try {
      const res = await this._fetch(url, options);
      if (!res.ok) return { status: 'fail', data: null };
      const data = parse === 'json' ? await res.json() : await res.text();
      return { status: 'ok', data };
    } catch (e) {
      console.warn(`Error HTTP ${source}:`, e);
      return { status: 'fail', data: null };
    }
  }

  // --------------------------------------------------------------------------
  // Fuentes individuales (retornan datos sin mutar tasas)
  // --------------------------------------------------------------------------

  async _fetchBinance() {
    if (!this._shouldFetchSource('binance')) return { status: 'skip', prices: [] };

    const r = await this._request({
      source: 'binance',
      url: 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fiat: 'VES', page: 1, rows: 10, tradeType: 'BUY', asset: 'USDT', countries: [], payTypes: []
        })
      }
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

  async _fetchDolarApi() {
    if (!this._shouldFetchSource('dolarapi')) {
      return { status: 'skip', bcvUsd: null, euroValue: null, paraleloUsd: null };
    }

    const [usdRes, eurRes] = await Promise.all([
      this._request({ source: 'dolarapi', url: 'https://ve.dolarapi.com/v1/dolares' }),
      this._request({ source: 'dolarapi', url: 'https://ve.dolarapi.com/v1/euros' })
    ]);

    const out = { bcvUsd: null, euroValue: null, paraleloUsd: null };
    let ok = false;

    if (usdRes.status === 'ok' && Array.isArray(usdRes.data)) {
      const bcvItem = usdRes.data.find(d => d.fuente === 'oficial' || d.casa === 'oficial');
      const paraleloItem = usdRes.data.find(d => d.fuente === 'paralelo' || d.casa === 'paralelo');
      if (bcvItem?.promedio) {
        out.bcvUsd = parseFloat(parseFloat(bcvItem.promedio).toFixed(2));
        ok = true;
      }
      if (paraleloItem?.promedio) {
        out.paraleloUsd = parseFloat(parseFloat(paraleloItem.promedio).toFixed(2));
      }
    }

    if (eurRes.status === 'ok' && Array.isArray(eurRes.data)) {
      const item = eurRes.data.find(d => d.fuente === 'oficial' || d.casa === 'oficial' || d.moneda === 'EUR');
      if (item?.promedio) {
        out.euroValue = parseFloat(parseFloat(item.promedio).toFixed(2));
        ok = true;
      }
    }

    this._markSource('dolarapi', ok);
    return { status: ok ? 'ok' : 'fail', ...out };
  }

  // Fecha de hoy en zona VET (UTC-4) como ISO yyyy-mm-dd
  getTodayIsoVet() {
    const now = new Date();
    const vetOffsetMs = -4 * 60 * 60 * 1000;
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utcMs + vetOffsetMs).toISOString().split('T')[0];
  }

  _formatFechaValor(isoDate) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    try {
      const d = new Date(String(isoDate).slice(0, 10) + 'T12:00:00');
      if (isNaN(d.getTime())) return isoDate;
      return `Fecha Valor ${days[d.getDay()]} ${d.getDate()} de ${d.toLocaleDateString('es-VE', { month: 'long' })} ${d.getFullYear()}`;
    } catch (e) {
      return isoDate;
    }
  }

  // Fuente confiable: DolarApi históricos ya contiene la Fecha Valor futura publicada por el BCV.
  // Devuelve el último registro con fecha > hoy (pronóstico) y el último con fecha <= hoy (tasa vigente).
  async _fetchDolarApiHistorics() {
    if (!this._shouldFetchSource('histDolarapi')) {
      return { status: 'skip', nextUsd: null, hoyUsd: null, nextEur: null, hoyEur: null };
    }

    const [usdRes, eurRes] = await Promise.all([
      this._request({ source: 'histDolarapi', url: 'https://ve.dolarapi.com/v1/historicos/dolares/oficial' }),
      this._request({ source: 'histDolarapi', url: 'https://ve.dolarapi.com/v1/historicos/euros' })
    ]);

    const today = this.getTodayIsoVet();
    const pick = (series) => {
      if (!Array.isArray(series)) return { next: null, hoy: null };
      let hoy = null;
      let next = null;
      for (const rec of series) {
        if (!rec || !rec.fecha) continue;
        const value = parseFloat(parseFloat(rec.promedio).toFixed(2));
        if (!isNaN(value) && value > 0) {
          if (String(rec.fecha) <= today) hoy = { value, date: String(rec.fecha) };
          else next = { value, date: String(rec.fecha) };
        }
      }
      return { next, hoy };
    };

    const usdSeries = Array.isArray(usdRes.data)
      ? usdRes.data.filter(d => d && (d.fuente === 'oficial' || d.casa === 'oficial'))
      : null;
    const eurSeries = Array.isArray(eurRes.data)
      ? eurRes.data.filter(d => d && (d.fuente === 'oficial' || d.casa === 'oficial'))
      : null;

    const usdPick = pick(usdSeries);
    const eurPick = pick(eurSeries);

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

  async _fetchBcvSite() {
    if (!this._shouldFetchSource('bcvSite')) return null;

    const proxies = [
      'https://www.bcv.org.ve',
      'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.bcv.org.ve'),
      'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent('https://www.bcv.org.ve')
    ];

    for (const url of proxies) {
      const r = await this._request({ source: 'bcvSite', url, parse: 'text' });
      if (r.status !== 'ok') continue;

      let html = r.data;
      if (html.trimStart().startsWith('{')) {
        try { html = JSON.parse(html).contents || ''; } catch { html = r.data; }
      }
      const parsed = this.parseBcvHtml(html);
      if (parsed && typeof parsed.usd === 'number') {
        this._markSource('bcvSite', true);
        return parsed;
      }
    }

    // Respaldo: api.dolarvzla.com
    const dv = await this._request({ source: 'dolarvzla', url: 'https://api.dolarvzla.com/bcv/current.json' });
    if (dv.status === 'ok' && dv.data?.usd && !isNaN(parseFloat(dv.data.usd))) {
      this._markSource('dolarvzla', true);
      return {
        usd: parseFloat(dv.data.usd),
        eur: dv.data.eur ? parseFloat(dv.data.eur) : null,
        fecha: dv.data.fecha_valor || dv.data.fecha || 'Fecha Valor Oficial BCV'
      };
    }

    this._markSource('bcvSite', false);
    if (dv.status === 'fail') this._markSource('dolarvzla', false);
    return null;
  }

  // --------------------------------------------------------------------------
  // Flujo principal
  // --------------------------------------------------------------------------

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
    // Coalescer: si hay una sincronización en curso, compartir su resultado
    if (this.isSyncing && this._inflightPromise) {
      return this._inflightPromise;
    }

    this.isSyncing = true;
    this._attempts = 0;
    this._inflightPromise = this.fetchVenezuelaRates(country, cacheKey)
      .then(rates => {
        if (rates && rates._meta) {
          this._lastRates = JSON.parse(JSON.stringify(rates));
          delete this._lastRates._meta;
          this._lastFetchedAt = rates._meta.fetchedAt || Date.now();
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

    // FUENTES EN PARALELO: Binance P2P + DolarApi (dólares y euros) + DolarApi históricos (Fecha Valor)
    const [binanceRes, dolarApiRes, histRes] = await Promise.allSettled([
      this._fetchBinance(),
      this._fetchDolarApi(),
      this._fetchDolarApiHistorics()
    ]);

    // 1. USDT/VES Binance P2P (prioridad sobre el paralelo de DolarApi)
    if (binanceRes.status === 'fulfilled' && binanceRes.value.status === 'ok' && binanceRes.value.prices.length > 0) {
      const topPrices = binanceRes.value.prices.slice(0, Math.min(3, binanceRes.value.prices.length));
      rates.paralelo.value = parseFloat((topPrices.reduce((a, b) => a + b, 0) / topPrices.length).toFixed(2));
      fetched.binanceP2p = true;
    }

    // 2. Oficial BCV + paralelo de DolarApi
    if (dolarApiRes.status === 'fulfilled' && dolarApiRes.value.status === 'ok') {
      const r = dolarApiRes.value;
      if (r.bcvUsd) {
        rates.bcv.value = r.bcvUsd;
        fetched.dolarapi = true;
        if (!fetched.binanceP2p && r.paraleloUsd) {
          rates.paralelo.value = r.paraleloUsd;
        }
      }
      if (r.euroValue) {
        rates.euro.value = r.euroValue;
        fetched.dolarapiEuro = true;
      }
    }

    // 2.5 Pronóstico oficial (Fecha Valor) desde DolarApi históricos — fuente fiable y confirmada.
    // Si el scraping del sitio BCV llega a responder, será aplicado después y sobreescribirá este valor.
    if (histRes.status === 'fulfilled' && histRes.value.status === 'ok') {
      const h = histRes.value;
      if (h.nextUsd && !(rates.bcv.nextDay && rates.bcv.nextDay.published)) {
        const curUsd = (typeof rates.bcv.value === 'number' && rates.bcv.value > 0)
          ? rates.bcv.value
          : (h.hoyUsd ? h.hoyUsd.value : h.nextUsd.value);
        const changeUsd = curUsd > 0
          ? parseFloat((((h.nextUsd.value - curUsd) / curUsd) * 100).toFixed(2))
          : 0;
        rates.bcv.nextDay = {
          published: true, isOfficial: true, value: h.nextUsd.value, change: changeUsd,
          date: this._formatFechaValor(h.nextUsd.date), _iso: h.nextUsd.date,
          scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
        };
        fetched.dolarapiHist = true;
      }
      if (h.nextEur && rates.euro && !(rates.euro.nextDay && rates.euro.nextDay.published)) {
        const curEur = (typeof rates.euro.value === 'number' && rates.euro.value > 0)
          ? rates.euro.value
          : (h.hoyEur ? h.hoyEur.value : h.nextEur.value);
        const changeEur = curEur > 0
          ? parseFloat((((h.nextEur.value - curEur) / curEur) * 100).toFixed(2))
          : 0;
        rates.euro.nextDay = {
          published: true, isOfficial: true, value: h.nextEur.value, change: changeEur,
          date: this._formatFechaValor(h.nextEur.date), _iso: h.nextEur.date,
          scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
        };
        fetched.dolarapiHistEuro = true;
      }
      // Si la Fecha Valor vigente ya es la más reciente (sin fecha futura), sincronizar la tasa del día
      if (!rates.bcv.nextDay && h.hoyUsd) {
        rates.bcv.value = h.hoyUsd.value;
      }
    }

    // 3. Sitio oficial BCV (autoritativo, se aplica al final / después de DolarApi)
    try {
      const bcvData = await this._fetchBcvSite();
      if (bcvData && typeof bcvData.usd === 'number' && !isNaN(bcvData.usd)) {
        this.processBcvRates(rates, bcvData);
        fetched.bcvSite = true;
      }
    } catch (e) {
      console.warn('Error al procesar sitio oficial del BCV:', e);
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

    const succeeded = Object.values(fetched).some(Boolean);
    let sourceLabel;
    if (succeeded) {
      sourceLabel = 'live';
    } else if (this._attempts > 0) {
      sourceLabel = 'offline';
    } else {
      // Ninguna fuente estaba lista (dentro de su TTL): devolver el snapshot previo, que es reciente
      const snapshot = this._getCachedSnapshot(cacheKey, rates);
      return this._decorate(snapshot, 'live', { reused: true, sources: fetched, fetchedAt: this._lastFetchedAt || Date.now() });
    }

    if (sourceLabel === 'live') {
      if (rates._meta) { const stored = JSON.parse(JSON.stringify(rates)); delete stored._meta; this.setCache(cacheKey, stored); }
      else this.setCache(cacheKey, rates);
    } else if (sourceLabel === 'offline') {
      // Fallback: última tasa válida conocida, nunca placeholders null
      return this._getLastKnownRates(country, { sources: fetched });
    }

    return this._decorate(rates, sourceLabel, {
      sources: fetched,
      fetchedAt: this._lastFetchedAt || Date.now()
    });
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
    const targetDayName = getNextBusinessDayName().toLowerCase();

    let isNextDay = false;
    if (targetDay && targetDay === targetDayName) {
      isNextDay = true;
    } else if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
      if (targetDay === 'lunes') isNextDay = true;
    } else {
      const nextDayMap = { 1: 'martes', 2: 'miércoles', 3: 'jueves', 4: 'viernes' };
      if (targetDay === nextDayMap[dayOfWeek]) {
        isNextDay = true;
      }
    }

    if (isNextDay) {
      // Asignar al botón de Pronóstico (Fecha Valor) — SOLO publicación real del BCV
      const currentUsd = rates.bcv.value || bcvUsd;
      const changeUsd = currentUsd > 0 ? parseFloat((((bcvUsd - currentUsd) / currentUsd) * 100).toFixed(2)) : 0;
      rates.bcv.nextDay = {
        published: true, isOfficial: true, value: bcvUsd, change: changeUsd,
        date: cleanDate, scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
      };

      if (bcvEur && rates.euro) {
        const currentEur = rates.euro.value || bcvEur;
        const changeEur = currentEur > 0 ? parseFloat((((bcvEur - currentEur) / currentEur) * 100).toFixed(2)) : 0;
        rates.euro.value = bcvEur; // Sincronizar tasa base del Euro oficial con BCV
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

  // --------------------------------------------------------------------------
  // Caché
  // --------------------------------------------------------------------------

  _getCachedSnapshot(cacheKey, fallbackRates) {
    try {
      if (typeof localStorage === 'undefined') return JSON.parse(JSON.stringify(fallbackRates));
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return JSON.parse(JSON.stringify(fallbackRates));
      const { data } = JSON.parse(raw);
      if (data && this.hasValidRateValue(data)) return JSON.parse(JSON.stringify(data));
    } catch (e) { /* ignore */ }
    return JSON.parse(JSON.stringify(fallbackRates));
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
    } catch (e) {
      console.warn('Error en fallback offline:', e);
    }
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
        const enriched = JSON.parse(JSON.stringify(data));
        return this._decorate(enriched, 'stale', { cachedAt: timestamp, fetchedAt: this._lastFetchedAt || timestamp });
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

export const apiService = new ApiService();