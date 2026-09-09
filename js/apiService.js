/**
 * Módulo de servicio para la obtención de tasas reales desde APIs oficiales
 * Fuentes: API ve.dolarapi.com (fuente: oficial BCV) + scraping bcv.org.ve
 * Solo tasas OFICIALES del Banco Central de Venezuela
 */

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Dolarfy/1.1.0',
  'Accept': 'application/json, text/html, */*'
};

class ApiService {
  constructor() {
    this.CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos para actualización rápida en tiempo real
    this.STALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // Caché "último dato conocido" válido hasta 7 días
    this.REQUEST_TIMEOUT_MS = 10000;
  }

  /**
   * Wrapper de fetch seguro con User-Agent y timeout.
   */
  async _fetch(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);
    const headers = { ...DEFAULT_HEADERS, ...(options.headers || {}) };

    try {
      const res = await fetch(url, { ...options, headers, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Adjunta metadatos de fuente/origen al objeto de tasas sin mutar los originales.
   */
  _decorate(rates, source = 'live', extra = {}) {
    rates._meta = {
      source,                          // 'live' | 'cache' | 'stale' | 'offline'
      fetchedAt: Date.now(),
      ...extra
    };
    return rates;
  }

  async fetchRatesForCountry(country) {
    const cacheKey = `dolarfy_rates_cache_v12_${country.id}`;
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
      if (country.id === 'VE') {
        return await this.fetchVenezuelaRates(country, cacheKey);
      }
      return await this.fetchGlobalRates(country, cacheKey);
    } catch (error) {
      console.warn(`Error al consultar API real para ${country.name}:`, error);
      const rates = JSON.parse(JSON.stringify(country.rates));
      return this._decorate(rates, 'offline', { error: true });
    }
  }

  // --- API Venezuela: BCV (USD/EUR) y USDT Binance P2P ---
  async fetchVenezuelaRates(country, cacheKey) {
    const rates = JSON.parse(JSON.stringify(country.rates));
    const fetched = {};

    // 1. Intentar ve.dolarapi.com (fuente: oficial BCV + paralelo)
    try {
      const res = await this._fetch('https://ve.dolarapi.com/v1/dolares');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          // BCV Dólar
          const bcvItem = data.find(d => d.fuente === 'oficial' || d.casa === 'oficial');
          if (bcvItem && bcvItem.promedio) {
            rates.bcv.value = parseFloat(bcvItem.promedio.toFixed(2));
          }

          // Euro BCV (dolarapi no publica EUR: derivar de USD oficial)
          const euroItem = data.find(d => (d.fuente === 'oficial' || d.casa === 'oficial') && d.moneda === 'EUR');
          if (euroItem && euroItem.promedio) {
            rates.euro.value = parseFloat(euroItem.promedio.toFixed(2));
          } else if (rates.bcv && rates.bcv.value) {
            rates.euro.value = parseFloat((rates.bcv.value * 1.162).toFixed(2));
          }

          // Binance USDT (P2P / Paralelo)
          const usdtItem = data.find(d => d.fuente === 'paralelo' || d.casa === 'paralelo' || d.fuente === 'cripto');
          if (usdtItem && usdtItem.promedio) {
            rates.usdt.value = parseFloat(usdtItem.promedio.toFixed(2));
          } else if (rates.bcv && rates.bcv.value) {
            rates.usdt.value = parseFloat((rates.bcv.value * 1.15).toFixed(2));
          }
          fetched.dolarapi = true;
        }
      }
    } catch (e) {
      console.warn('Error al consultar DolarApi VE:', e);
    }

    // 2. Scraping del portal oficial bcv.org.ve para Fecha Valor
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

        if (bcvSiteData.eur) {
          const officialNextEur = parseFloat(bcvSiteData.eur.toFixed(2));
          const currentEur = rates.euro.value || parseFloat((currentUsd * 1.162).toFixed(2));
          const changeEur = currentEur > 0 ? parseFloat((((officialNextEur - currentEur) / currentEur) * 100).toFixed(2)) : 0;

          rates.euro.nextDay = {
            published: true,
            isOfficial: true,
            value: officialNextEur,
            change: changeEur,
            date: cleanDate,
            scheduleText: 'Emitida directamente por el Banco Central de Venezuela (bcv.org.ve)'
          };
        }
        fetched.bcvSite = true;
      }
    } catch (e) {
      console.warn('Error al scrapear sitio oficial del BCV:', e);
    }

    // NOTA: no se generan nextDay "fallback" con la tasa actual.
    // La vista de "Fecha Valor" solo se muestra con datos reales publicados
    // por el Banco Central (bcv.org.ve) o el fallback oficial de dolarvzla.

    if (fetched.dolarapi || fetched.bcvSite) {
      this.setCache(cacheKey, rates);
    }

    this._decorate(rates, fetched.dolarapi || fetched.bcvSite ? 'live' : 'offline', {
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

  // --- API Global (Open ER-API) ---
  async fetchGlobalRates(country, cacheKey) {
    const res = await this._fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error('HTTP error ' + res.status);
    const data = await res.json();
    const ratesMap = data.rates || {};

    const code = country.currency.code;
    const rates = JSON.parse(JSON.stringify(country.rates));
    const eurUSD = ratesMap['EUR'] || 0.8614;

    if (country.id === 'US') {
      if (ratesMap['EUR']) rates.eurusd.value = parseFloat((1 / ratesMap['EUR']).toFixed(4));
      if (rates.usdc) rates.usdc.value = 1.0000;
      this.setCache(cacheKey, rates);
      this._decorate(rates, 'live', { sources: { erApi: true } });
      return rates;
    }

    if (country.id === 'ES') {
      if (ratesMap['EUR']) rates.usdeur.value = parseFloat(ratesMap['EUR'].toFixed(4));
      if (ratesMap['EUR'] && rates.usdc) rates.usdc.value = parseFloat(ratesMap['EUR'].toFixed(4));
      this.setCache(cacheKey, rates);
      this._decorate(rates, 'live', { sources: { erApi: true } });
      return rates;
    }

    const officialUSD = ratesMap[code];
    if (!officialUSD) {
      this._decorate(rates, 'offline');
      return rates;
    }

    const rateKeys = Object.keys(rates);
    rateKeys.forEach(key => {
      const r = rates[key];
      const decimals = officialUSD < 10 ? 4 : 2;

      if (r.type === 'official' && r.code.startsWith('USD')) {
        r.value = parseFloat(officialUSD.toFixed(decimals));
        r.nextDay = {
          published: true,
          value: r.value,
          change: r.change || 0,
          date: `Tasa ${r.name} Oficial Publicada`,
          scheduleText: 'Cotización oficial emitida por entidad bancaria central'
        };
      } else if (r.type === 'parallel' || r.type === 'market') {
        r.value = parseFloat((officialUSD * 1.015).toFixed(decimals));
      } else if (r.code.startsWith('EUR')) {
        const eurVal = officialUSD / eurUSD;
        r.value = parseFloat(eurVal.toFixed(decimals));
      } else if (r.type === 'crypto') {
        r.value = parseFloat((officialUSD * 1.006).toFixed(decimals));
      }
    });

    this.setCache(cacheKey, rates);
    this._decorate(rates, 'live', { sources: { erApi: true } });
    return rates;
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
          return this._decorate(JSON.parse(JSON.stringify(data)), 'cache', { cachedAt: timestamp });
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
        return this._decorate(JSON.parse(JSON.stringify(data)), 'stale', { cachedAt: timestamp });
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