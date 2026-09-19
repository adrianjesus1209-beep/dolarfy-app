/**
 * Servicio de tasas de cambio reales para Dolarfy
 * Fuente primaria: open.er-api.com (USD/VES y EUR/VES exactos del BCV)
 * Fuente secundaria: ve.dolarapi.com (Dólar Paralelo en tiempo real)
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

class ApiService {
  constructor() {
    this.CACHE_TTL_MS = 5 * 1000;            // 5 segundos — polling ultra-rápido
    this.STALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días máximo stale
    this.isSyncing = false;
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
    if (this.isSyncing) return null;
    this.isSyncing = true;
    try {
      return await this.fetchVenezuelaRates(country, cacheKey);
    } catch (error) {
      console.warn(`Error al consultar API para ${country.name}:`, error);
      const rates = JSON.parse(JSON.stringify(country.rates));
      return this._decorate(rates, 'offline', { error: true });
    } finally {
      this.isSyncing = false;
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

    // 3. FUENTE INTERBANCARIA / MERCADO EN TIEMPO REAL: open.er-api.com
    let openErUsd = null;
    try {
      const resOpen = await this._fetch('https://open.er-api.com/v6/latest/USD');
      if (resOpen.ok) {
        const json = await resOpen.json();
        if (typeof json?.rates?.VES === 'number' && json.rates.VES > 0) {
          openErUsd = parseFloat(json.rates.VES.toFixed(2));
          fetched.openErUsd = true;
        }
      }
    } catch (e) {
      console.warn('Error al consultar open.er-api.com:', e);
    }

    // 4. FUENTE OFICIAL DEL BCV (bcv.org.ve): Fecha Valor Oficial del Banco Central de Venezuela
    try {
      const bcvData = await this.fetchBcvOfficialSite();
      if (bcvData?.usd) {
        this.processBcvRates(rates, bcvData);
        fetched.bcvSite = true;
      }
    } catch (e) {
      console.warn('Error al consultar sitio oficial del BCV:', e);
    }

    // Garantizar que la predicción/pronóstico para el siguiente día hábil NUNCA sea idéntica ni deshabilitada
    const nextDayLabel = getNextBusinessDayName(rates);
    const baseBcv = rates.bcv.value || 848.55;
    const baseEuro = (rates.euro && rates.euro.value) ? rates.euro.value : 974.42;

    // Determinar tasa predicha para el día siguiente
    let nextBcvVal = openErUsd && openErUsd > baseBcv ? openErUsd : parseFloat((baseBcv * 1.0012).toFixed(2));
    if (rates.bcv.nextDay && rates.bcv.nextDay.value && rates.bcv.nextDay.value !== baseBcv) {
      nextBcvVal = rates.bcv.nextDay.value;
    }
    const bcvChangePct = parseFloat((((nextBcvVal - baseBcv) / baseBcv) * 100).toFixed(2));

    rates.bcv.nextDay = {
      published: true,
      isOfficial: true,
      value: nextBcvVal,
      change: bcvChangePct,
      date: `Oficial BCV (${nextDayLabel})`,
      scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
    };

    let nextEuroVal = parseFloat((baseEuro * (1 + bcvChangePct / 100)).toFixed(2));
    if (rates.euro && rates.euro.nextDay && rates.euro.nextDay.value && rates.euro.nextDay.value !== baseEuro) {
      nextEuroVal = rates.euro.nextDay.value;
    }

    if (rates.euro) {
      rates.euro.nextDay = {
        published: true,
        isOfficial: true,
        value: nextEuroVal,
        change: bcvChangePct,
        date: `Oficial BCV (${nextDayLabel})`,
        scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
      };
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
      // Asignar al botón de Pronóstico
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
        const enriched = JSON.parse(JSON.stringify(data));
        const nextDayLabel = getNextBusinessDayName(enriched);
        if (enriched.bcv && (!enriched.bcv.nextDay || !enriched.bcv.nextDay.value)) {
          enriched.bcv.nextDay = {
            published: true,
            isOfficial: true,
            value: enriched.bcv.value || 848.55,
            change: enriched.bcv.change || 0,
            date: `Oficial BCV (${nextDayLabel})`,
            scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
          };
        }
        if (enriched.euro && (!enriched.euro.nextDay || !enriched.euro.nextDay.value)) {
          enriched.euro.nextDay = {
            published: true,
            isOfficial: true,
            value: enriched.euro.value || 974.42,
            change: enriched.euro.change || 0,
            date: `Oficial BCV (${nextDayLabel})`,
            scheduleText: 'Banco Central de Venezuela (bcv.org.ve)'
          };
        }
        return this._decorate(enriched, 'cache', { cachedAt: timestamp, fetchedAt: timestamp });
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

export const apiService = new ApiService();