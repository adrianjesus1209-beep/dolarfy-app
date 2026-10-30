/**
 * Servicio de tasas de cambio reales para Dolarfy
 * Fuentes en Tiempo Real:
 * 1. Puente Nativo Android (window.DolarfyNative) para conexión directa a bcv.org.ve y Binance P2P sin CORS ni bloqueos SSL.
 * 2. Lector directo BCV (bcv.org.ve vía Jina/Proxy PHP) para detectar al instante la Fecha Valor apenas se publica (~4:20 PM VET).
 * 3. DolarApi (ve.dolarapi.com) y DolarApi Históricos para tasa vigente del día e historial oficial.
 */

import { RATES_CACHE_KEY_PREFIX } from './constants.js';
import { getNextBusinessDayName, parseSpanishDateToIso, isoToShortDate } from './utils/formatters.js';

const REQUEST_TIMEOUT_MS = 7000;

export async function fetchWithTimeout(url, options = {}) {
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
export function parseBcvPayload(rawText) {
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
    const now = new Date();
    const vetOffsetMs = -4 * 60 * 60 * 1000;
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utcMs + vetOffsetMs).toISOString().split('T')[0];
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

export const apiService = new ApiService();
