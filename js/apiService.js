/**
 * Servicio de tasas de cambio reales para Dolarfy
 * Fuente primaria: open.er-api.com (USD/VES y EUR/VES exactos del BCV)
 * Fuente secundaria: ve.dolarapi.com (Dólar Paralelo en tiempo real)
 */

import { RATES_CACHE_KEY_PREFIX } from './constants.js';

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

    // 1. FUENTE OFICIAL DE HOY Y PARALELO: ve.dolarapi.com
    //    Proporciona la tasa oficial vigente para el día de HOY y el dólar paralelo en tiempo real.
    try {
      const resUsd = await this._fetch('https://ve.dolarapi.com/v1/dolares');
      if (resUsd.ok) {
        const data = await resUsd.json();
        if (Array.isArray(data)) {
          const bcvItem = data.find(d => d.fuente === 'oficial' || d.casa === 'oficial');
          if (bcvItem?.promedio) {
            rates.bcv.value = parseFloat(bcvItem.promedio.toFixed(2));
          }
          const paraleloItem = data.find(d => d.fuente === 'paralelo' || d.casa === 'paralelo');
          if (paraleloItem?.promedio) {
            rates.paralelo.value = parseFloat(paraleloItem.promedio.toFixed(2));
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

export const apiService = new ApiService();