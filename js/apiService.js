/**
 * Servicio de tasas de cambio reales para Dolarfy
 * Fuentes:
 * 1. Proxy backend local XAMPP (api/proxy.php) para Binance P2P C2C y BCV sin restricciones CORS.
 * 2. DolarApi (ve.dolarapi.com) para Oficial BCV, Paralelo EnParaleloVzla y Fechas Valor futuras.
 * 3. DolarApi Históricos para detección autoritativa de la Fecha Valor del siguiente día hábil.
 */

import { RATES_CACHE_KEY_PREFIX } from './constants.js';
import { getNextBusinessDayName } from './utils/formatters.js';

const REQUEST_TIMEOUT_MS = 6000;

export async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || REQUEST_TIMEOUT_MS);
  const headers = { 'Accept': 'application/json, text/html, */*', ...(options.headers || {}) };

  try {
    return await fetch(url, { ...options, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Cadencia por fuente (evita saturar peticiones)
const API_SOURCE_CONFIG = {
  proxy: { ttlMs: 15 * 1000 },
  binance: { ttlMs: 30 * 1000 },
  dolarapi: { ttlMs: 45 * 1000 },
  histDolarapi: { ttlMs: 5 * 60 * 1000 }
};

const BACKOFF_BASE_MS = 5 * 1000;
const BACKOFF_MAX_MS = 2 * 60 * 1000;

class ApiService {
  constructor() {
    this.CACHE_TTL_MS = 60 * 1000;                     // 60s
    this.STALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;    // 7 días máximo
    this.isSyncing = false;
    this._inflightPromise = null;
    this._lastRates = null;
    this._lastFetchedAt = 0;
    this._sourceState = {};
    this._hasPhpProxy = null;                          // null: no probado, true/false: verificado
  }

  _fetch(url, options = {}) {
    return fetchWithTimeout(url, options);
  }

  _decorate(rates, source = 'live', extra = {}) {
    rates._meta = { source, fetchedAt: extra.fetchedAt || Date.now(), ...extra };
    return rates;
  }

  _shouldFetchSource(source) {
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

  async _request({ source, url, options = {}, parse = 'json' }) {
    if (!this._shouldFetchSource(source)) return { status: 'skip', data: null };
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

    // Si estamos en protocolo file:, no hay servidor PHP activo
    if (typeof location !== 'undefined' && location.protocol === 'file:') {
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
    } catch (e) {
      // Ignorar fallo silenciosamente
    }

    this._hasPhpProxy = false;
    return false;
  }

  /**
   * Consulta directa al proxy PHP local si existe (Binance P2P + BCV Oficial sin CORS)
   */
  async _fetchFromPhpProxy() {
    const hasProxy = await this.checkPhpProxy();
    if (!hasProxy) return null;

    try {
      const res = await this._request({
        source: 'proxy',
        url: 'api/proxy.php?action=all',
        options: { timeout: 4000 }
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
   * Intenta consultar Binance P2P directamente (funciona en entornos sin restricción CORS estricta)
   */
  async _fetchBinanceDirect() {
    if (!this._shouldFetchSource('binance')) return { status: 'skip', prices: [] };

    const r = await this._request({
      source: 'binance',
      url: 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fiat: 'VES', page: 1, rows: 10, tradeType: 'BUY', asset: 'USDT', countries: [], payTypes: []
        }),
        timeout: 4000
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

  /**
   * Consulta DolarApi para tasas vigentes de Dólar y Euro (Oficial y Paralelo)
   */
  async _fetchDolarApi() {
    if (!this._shouldFetchSource('dolarapi')) {
      return { status: 'skip', bcvUsd: null, euroValue: null, paraleloUsd: null, paraleloEuro: null };
    }

    const [usdRes, eurRes] = await Promise.all([
      this._request({ source: 'dolarapi', url: 'https://ve.dolarapi.com/v1/dolares' }),
      this._request({ source: 'dolarapi', url: 'https://ve.dolarapi.com/v1/euros' })
    ]);

    const out = { bcvUsd: null, euroValue: null, paraleloUsd: null, paraleloEuro: null };
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
        ok = true;
      }
    }

    if (eurRes.status === 'ok' && Array.isArray(eurRes.data)) {
      const oficialItem = eurRes.data.find(d => d.fuente === 'oficial' || d.casa === 'oficial' || d.moneda === 'EUR');
      const paraleloItem = eurRes.data.find(d => d.fuente === 'paralelo' || d.casa === 'paralelo');
      if (oficialItem?.promedio) {
        out.euroValue = parseFloat(parseFloat(oficialItem.promedio).toFixed(2));
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
   * Consulta históricos de DolarApi para detectar la Fecha Valor del siguiente día hábil
   */
  async _fetchDolarApiHistorics() {
    if (!this._shouldFetchSource('histDolarapi')) {
      return { status: 'skip', nextUsd: null, hoyUsd: null, nextEur: null, hoyEur: null };
    }

    const [usdRes, eurRes] = await Promise.all([
      this._request({ source: 'histDolarapi', url: 'https://ve.dolarapi.com/v1/historicos/dolares/oficial' }),
      this._request({ source: 'histDolarapi', url: 'https://ve.dolarapi.com/v1/historicos/euros' })
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
        this.fetchFreshRates(country, cacheKey).catch(() => {});
        return cached;
      }

      const stale = this.getCacheStale(cacheKey);
      if (stale) {
        this.fetchFreshRates(country, cacheKey).catch(() => {});
        return stale;
      }
    }

    return await this.fetchFreshRates(country, cacheKey);
  }

  async fetchFreshRates(country, cacheKey) {
    if (this.isSyncing && this._inflightPromise) {
      return this._inflightPromise;
    }

    this.isSyncing = true;
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

    // Valores previos para cálculo de variación
    const prevValues = {};
    Object.keys(rates).forEach(key => {
      const r = rates[key];
      if (r && typeof r.value === 'number' && !isNaN(r.value)) {
        prevValues[key] = r.value;
      }
    });

    // Ejecución paralela de alta velocidad
    const [proxyData, binanceRes, dolarApiRes, histRes] = await Promise.allSettled([
      this._fetchFromPhpProxy(),
      this._fetchBinanceDirect(),
      this._fetchDolarApi(),
      this._fetchDolarApiHistorics()
    ]);

    // 1. Si el Proxy PHP respondió con éxito (Binance P2P y BCV directo)
    if (proxyData.status === 'fulfilled' && proxyData.value) {
      const p = proxyData.value;
      if (p.binance?.status === 'ok' && Array.isArray(p.binance.prices) && p.binance.prices.length > 0) {
        const topPrices = p.binance.prices.slice(0, Math.min(3, p.binance.prices.length));
        rates.paralelo.value = parseFloat((topPrices.reduce((a, b) => a + b, 0) / topPrices.length).toFixed(2));
        fetched.binanceP2p = true;
      }
      if (p.bcv?.status === 'ok' && p.bcv.usd > 0) {
        this.processBcvRates(rates, p.bcv);
        fetched.bcvSite = true;
      }
    }

    // 2. Binance directo si no tuvimos proxy PHP
    if (!fetched.binanceP2p && binanceRes.status === 'fulfilled' && binanceRes.value.status === 'ok' && binanceRes.value.prices.length > 0) {
      const topPrices = binanceRes.value.prices.slice(0, Math.min(3, binanceRes.value.prices.length));
      rates.paralelo.value = parseFloat((topPrices.reduce((a, b) => a + b, 0) / topPrices.length).toFixed(2));
      fetched.binanceP2p = true;
    }

    // 3. DolarApi (Oficial BCV + Paralelo)
    if (dolarApiRes.status === 'fulfilled' && dolarApiRes.value.status === 'ok') {
      const r = dolarApiRes.value;
      if (r.bcvUsd && (!rates.bcv.value || rates.bcv.value === country.rates.bcv.value)) {
        rates.bcv.value = r.bcvUsd;
        fetched.dolarapi = true;
      }
      if (!fetched.binanceP2p && r.paraleloUsd) {
        rates.paralelo.value = r.paraleloUsd;
        fetched.dolarapiParalelo = true;
      }
      if (r.euroValue && (!rates.euro.value || rates.euro.value === country.rates.euro.value)) {
        rates.euro.value = r.euroValue;
        fetched.dolarapiEuro = true;
      }
    }

    // 4. Pronóstico Oficial (Fecha Valor) desde DolarApi Históricos
    const todayIso = this.getTodayIsoVet();
    if (histRes.status === 'fulfilled' && histRes.value.status === 'ok') {
      const h = histRes.value;
      if (h.nextUsd && String(h.nextUsd.date) > todayIso) {
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
      } else if (h.hoyUsd && (!rates.bcv.value || rates.bcv.value === country.rates.bcv.value)) {
        rates.bcv.value = h.hoyUsd.value;
      }

      if (h.nextEur && rates.euro && String(h.nextEur.date) > todayIso) {
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
    const sourceLabel = succeeded ? 'live' : 'cache';

    if (succeeded) {
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

  processBcvRates(rates, bcvData) {
    if (!bcvData || typeof bcvData.usd !== 'number' || isNaN(bcvData.usd) || bcvData.usd <= 0) return;

    const bcvUsd = parseFloat(bcvData.usd.toFixed(2));
    const bcvEur = bcvData.eur ? parseFloat(bcvData.eur.toFixed(2)) : null;
    const rawFecha = (bcvData.fecha || '').toLowerCase();
    const cleanDate = bcvData.fecha
      ? bcvData.fecha.replace(/^Fecha\s+Valor\s*:?\s*/i, '').trim()
      : 'Oficial BCV';

    const targetDayName = getNextBusinessDayName().toLowerCase();
    let isNextDay = false;

    if (rawFecha.includes(targetDayName)) {
      isNextDay = true;
    }

    if (isNextDay) {
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
      rates.bcv.value = bcvUsd;
      if (bcvEur && rates.euro) {
        rates.euro.value = bcvEur;
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
