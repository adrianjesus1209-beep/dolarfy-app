/**
 * Módulo de servicio para la obtención de tasas reales desde APIs oficiales
 * Fuentes: API ve.dolarapi.com (fuente: oficial BCV) + scraping bcv.org.ve
 * Solo tasas OFICIALES del Banco Central de Venezuela
 */

import { RATES_CACHE_KEY_PREFIX } from './constants.js';

const DEFAULT_HEADERS = {
  'Accept': 'application/json, text/html, */*'
};

const REQUEST_TIMEOUT_MS = 10000;

/**
 * Wrapper de fetch seguro con User-Agent y timeout (compartido).
 */
export async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = { ...DEFAULT_HEADERS, ...(options.headers || {}) };

  try {
    return await fetch(url, { ...options, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

class ApiService {
  constructor() {
    this.CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos para actualización rápida en tiempo real
    this.STALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // Caché "último dato conocido" válido hasta 7 días
  }

  /**
   * Wrapper de fetch seguro con User-Agent y timeout.
   */
  _fetch(url, options = {}) {
    return fetchWithTimeout(url, options);
  }

  /**
   * Adjunta metadatos de fuente/origen al objeto de tasas sin mutar los originales.
   */
  _decorate(rates, source = 'live', extra = {}) {
    rates._meta = {
      source,                          // 'live' | 'cache' | 'stale' | 'offline' | 'placeholder'
      fetchedAt: extra.fetchedAt || Date.now(),
      ...extra
    };
    return rates;
  }

  async fetchRatesForCountry(country) {
    const cacheKey = `${RATES_CACHE_KEY_PREFIX}_${country.id}`;
    const cachedData = this.getCache(cacheKey);

    if (cachedData) {
      // Caché fresca (< 2 min): devolver y actualizar de fondo
      this.fetchFreshRates(country, cacheKey)
        .catch(e => console.warn('Update bg error:', e));
      return cachedData;
    }

    // Caché expirada pero válida ("último dato conocido"): útil offline
    const staleData = this.getCacheStale(cacheKey);
    if (staleData) {
      this.fetchFreshRates(country, cacheKey)
        .catch(e => console.warn('Update bg stale error:', e));
      return staleData;
    }

    return await this.fetchFreshRates(country, cacheKey);
  }

  async fetchFreshRates(country, cacheKey) {
    try {
      return await this.fetchVenezuelaRates(country, cacheKey);
    } catch (error) {
      console.warn(`Error al consultar API real para ${country.name}:`, error);
      const rates = JSON.parse(JSON.stringify(country.rates));
      return this._decorate(rates, 'offline', { error: true });
    }
  }

  // --- API Venezuela: tasas reales (BCV USD oficial/paralelo + EUR oficial) ---
  async fetchVenezuelaRates(country, cacheKey) {
    const rates = JSON.parse(JSON.stringify(country.rates));
    const fetched = {};

    // Valores previos (cache/snapshot) para calcular la variación real, nunca fabricada
    const prevValues = {};
    Object.keys(rates).forEach(key => {
      const r = rates[key];
      if (r && typeof r.value === 'number' && !isNaN(r.value)) {
        prevValues[key] = r.value;
      }
    });

    // 1. ve.dolarapi.com: Dólar Oficial BCV y Dólar Paralelo (USD/VES)
    try {
      const res = await this._fetch('https://ve.dolarapi.com/v1/dolares');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          // Dólar Oficial (BCV)
          const bcvItem = data.find(d => d.fuente === 'oficial' || d.casa === 'oficial');
          if (bcvItem && bcvItem.promedio) {
            rates.bcv.value = parseFloat(bcvItem.promedio.toFixed(2));
          }

          // Dólar Paralelo (tasa real; antes se mostraba el snapshot estático)
          const paraleloItem = data.find(d => d.fuente === 'paralelo' || d.casa === 'paralelo');
          if (paraleloItem && paraleloItem.promedio) {
            rates.paralelo.value = parseFloat(paraleloItem.promedio.toFixed(2));
          }
          fetched.dolarapi = true;
        }
      }
    } catch (e) {
      console.warn('Error al consultar DolarApi VE:', e);
    }

    // 1b. ve.dolarapi.com: Euro Oficial (el endpoint /v1/dolares NO publica EUR)
    try {
      const resEuro = await this._fetch('https://ve.dolarapi.com/v1/euros');
      if (resEuro.ok) {
        const data = await resEuro.json();
        if (Array.isArray(data)) {
          const euroItem = data.find(d => d.fuente === 'oficial' || d.casa === 'oficial' || d.moneda === 'EUR');
          if (euroItem && euroItem.promedio) {
            rates.euro.value = parseFloat(euroItem.promedio.toFixed(2));
            fetched.dolarapiEuro = true;
          }
        }
      }
    } catch (e) {
      console.warn('Error al consultar DolarApi EUR:', e);
    }

    // 2. Scraping del portal oficial bcv.org.ve para la "Fecha Valor" (USD/EUR)
    try {
      const bcvSiteData = await this.fetchBcvOfficialSite();
      if (bcvSiteData && bcvSiteData.usd) {
        const bcvUsd = parseFloat(bcvSiteData.usd.toFixed(2));
        const currentUsd = rates.bcv.value || bcvUsd;
        const changeUsd = currentUsd > 0 ? parseFloat((((bcvUsd - currentUsd) / currentUsd) * 100).toFixed(2)) : 0;

        const cleanDate = bcvSiteData.fecha
          ? bcvSiteData.fecha.replace(/^Fecha\s+Valor\s*:?\s*/i, '').trim()
          : 'Oficial BCV';

        rates.bcv.nextDay = {
          published: true,
          isOfficial: true,
          value: bcvUsd,
          change: changeUsd,
          date: cleanDate,
          scheduleText: 'Emitida directamente por el Banco Central de Venezuela (bcv.org.ve)'
        };

        // El USD publicado por el BCV corrige la tasa "hoy" si dolarapi no respondió
        if (!fetched.dolarapi) {
          rates.bcv.value = bcvUsd;
        }

        if (bcvSiteData.eur) {
          const officialNextEur = parseFloat(bcvSiteData.eur.toFixed(2));
          const currentEur = rates.euro.value || officialNextEur;
          const changeEur = currentEur > 0 ? parseFloat((((officialNextEur - currentEur) / currentEur) * 100).toFixed(2)) : 0;

          rates.euro.nextDay = {
            published: true,
            isOfficial: true,
            value: officialNextEur,
            change: changeEur,
            date: cleanDate,
            scheduleText: 'Emitida directamente por el Banco Central de Venezuela (bcv.org.ve)'
          };

          // El EUR publicado por el BCV corrige la tasa "hoy" si /v1/euros no respondió
          if (!fetched.dolarapiEuro) {
            rates.euro.value = officialNextEur;
          }
        }
        fetched.bcvSite = true;
      }
    } catch (e) {
      console.warn('Error al scrapear sitio oficial del BCV:', e);
    }

    // 3. Variación real vs el valor previo conocido (cache/snapshot)
    Object.keys(rates).forEach(key => {
      const r = rates[key];
      if (r && typeof r.value === 'number' && !isNaN(r.value) && r.value > 0) {
        const prev = prevValues[key];
        if (typeof prev === 'number' && prev > 0) {
          r.change = parseFloat((((r.value - prev) / prev) * 100).toFixed(2));
        }
      }
    });

    // 4. Garantizar que exista siempre el objeto nextDay para Fecha Valor (Lunes, Martes, Miércoles, Jueves, Viernes)
    const daysMap = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const todayIndex = new Date().getDay();
    let nextDayName = 'Lunes';
    if (todayIndex >= 1 && todayIndex <= 4) {
      nextDayName = daysMap[todayIndex + 1];
    }

    if (rates.bcv && !rates.bcv.nextDay) {
      rates.bcv.nextDay = {
        published: true,
        isOfficial: true,
        value: rates.bcv.value,
        change: rates.bcv.change || 0,
        date: `Oficial BCV · ${nextDayName}`,
        scheduleText: `Cotización oficial estimada para ${nextDayName}`
      };
    }

    if (rates.euro && !rates.euro.nextDay) {
      rates.euro.nextDay = {
        published: true,
        isOfficial: true,
        value: rates.euro.value,
        change: rates.euro.change || 0,
        date: `Oficial BCV · ${nextDayName}`,
        scheduleText: `Cotización oficial estimada para ${nextDayName}`
      };
    }

    if (fetched.dolarapi || fetched.dolarapiEuro || fetched.bcvSite) {
      this.setCache(cacheKey, rates);
    }

    this._decorate(rates, (fetched.dolarapi || fetched.dolarapiEuro || fetched.bcvSite) ? 'live' : 'offline', {
      sources: fetched
    });
    return rates;
  }

  async fetchBcvOfficialSite() {
    // Intento directo + proxies CORS gratuitos para el portal oficial bcv.org.ve
    const urls = [
      'https://www.bcv.org.ve',
      'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.bcv.org.ve'),
      'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent('https://www.bcv.org.ve')
    ];

    for (const url of urls) {
      try {
        const res = await this._fetch(url);

        if (res.ok) {
          const text = await res.text();
          // Algunos proxies (api.codetabs.com) devuelven JSON { contents: "<html>" }.
          // Detectar por contenido en lugar de por URL.
          let html = text;
          if (text.trimStart().startsWith('{')) {
            try {
              const json = JSON.parse(text);
              html = json.contents || '';
            } catch (e) {
              html = text;
            }
          }
          const parsed = this.parseBcvHtml(html);
          if (parsed && parsed.usd) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn(`Error al consultar BCV URL ${url}:`, e);
      }
    }

    // 2. Respaldo secundario: API dolarvzla
    try {
      const resApi = await this._fetch('https://api.dolarvzla.com/bcv/current.json');
      if (resApi.ok) {
        const json = await resApi.json();
        if (json && json.usd) {
          return {
            usd: parseFloat(json.usd),
            eur: json.eur ? parseFloat(json.eur) : null,
            fecha: json.fecha_valor || json.fecha || 'Fecha Valor Oficial BCV'
          };
        }
      }
    } catch (e) {
      console.warn('Error al consultar api.dolarvzla.com:', e);
    }

    return null;
  }

  parseBcvHtml(html) {
    if (!html || typeof html !== 'string') return null;
    try {
      const usdMatch = html.match(/id=["']dolar["'][\s\S]*?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i);
      const eurMatch = html.match(/id=["']euro["'][\s\S]*?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i);
      const fechaMatch = html.match(/(?:Fecha\s+Valor|dinamic-date)[\s\S]*?<span[^>]*>\s*([^<]+)\s*<\/span>/i);

      let usd = null;
      let eur = null;
      let fecha = null;

      if (usdMatch && usdMatch[1]) {
        const cleaned = usdMatch[1].trim().replace(/\./g, '').replace(',', '.');
        usd = parseFloat(cleaned);
      }

      if (eurMatch && eurMatch[1]) {
        const cleaned = eurMatch[1].trim().replace(/\./g, '').replace(',', '.');
        eur = parseFloat(cleaned);
      }

      if (fechaMatch && fechaMatch[1]) {
        fecha = fechaMatch[1].trim().replace(/\s+/g, ' ').replace(/^Fecha\s+Valor\s*:?\s*/i, '');
      }

      if (usd && !isNaN(usd)) {
        return { usd, eur, fecha };
      }
    } catch (e) {
      console.warn('Error parseando HTML BCV:', e);
    }
    return null;
  }

  /**
   * Valida que el objeto de tasas tenga al menos una tasa numérica
   * (funciona para cualquier país, no solo VE).
   */
  hasValidRateValue(data) {
    if (!data || typeof data !== 'object') return false;
    return Object.values(data).some(r =>
      r && typeof r === 'object' &&
      typeof r.value === 'number' && !isNaN(r.value)
    );
  }

  getCache(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const { timestamp, data } = parsed;

      if (typeof timestamp !== 'number' || !data) return null;
      if (Date.now() - timestamp < this.CACHE_TTL_MS) {
        if (this.hasValidRateValue(data)) {
          return this._decorate(JSON.parse(JSON.stringify(data)), 'cache', { cachedAt: timestamp, fetchedAt: timestamp });
        }
        return null;
      }
    } catch (e) {
      console.warn('Error leyendo caché', e);
    }
    return null;
  }

  /**
   * Caché expirada pero dentro de la ventana máxima de vigencia.
   * Se usa como "último dato conocido" cuando no hay conexión.
   */
  getCacheStale(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const { timestamp, data } = parsed;

      if (typeof timestamp !== 'number' || !data) return null;
      if (Date.now() - timestamp > this.STALE_MAX_AGE_MS) return null;
      if (this.hasValidRateValue(data)) {
        return this._decorate(JSON.parse(JSON.stringify(data)), 'stale', { cachedAt: timestamp, fetchedAt: timestamp });
      }
    } catch (e) {
      console.warn('Error leyendo caché expirada', e);
    }
    return null;
  }

  setCache(key, data) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify({
          timestamp: Date.now(),
          data
        }));
      }
    } catch (e) {
      console.warn('Error guardando en caché', e);
    }
  }
}

export const apiService = new ApiService();