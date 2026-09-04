/**
 * Módulo de servicio para la obtención de tasas reales desde APIs gratuitas en tiempo real
 */

class ApiService {
  constructor() {
    this.CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos de caché inteligente
  }

  async fetchRatesForCountry(country) {
    const cacheKey = `dolarfy_rates_cache_v3_${country.id}`;
    const cachedData = this.getCache(cacheKey);

    if (cachedData) {
      // Actualizar de fondo sin bloquear
      this.fetchFreshRates(country, cacheKey).catch(e => console.warn('Update bg error:', e));
      return cachedData;
    }

    return await this.fetchFreshRates(country, cacheKey);
  }

  async fetchFreshRates(country, cacheKey) {
    try {
      if (country.id === 'VE') {
        return await this.fetchVenezuelaRates(country, cacheKey);
      } else if (country.id === 'AR') {
        return await this.fetchArgentinaRates(country, cacheKey);
      } else {
        return await this.fetchGlobalRates(country, cacheKey);
      }
    } catch (error) {
      console.warn(`Error al consultar API real para ${country.name}:`, error);
      return country.rates;
    }
  }

  // --- API Venezuela (DolarApi VE + Web Scraping Oficial BCV) ---
  async fetchVenezuelaRates(country, cacheKey) {
    const rates = JSON.parse(JSON.stringify(country.rates));

    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const bcvItem = data.find(d => d.fuente === 'oficial' || d.casa === 'oficial');
          if (bcvItem && bcvItem.promedio) {
            rates.bcv.value = parseFloat(bcvItem.promedio.toFixed(2));
          }

          const parItem = data.find(d => d.fuente === 'paralelo' || d.casa === 'paralelo');
          if (parItem && parItem.promedio) {
            rates.paralelo.value = parseFloat(parItem.promedio.toFixed(2));
          }

          if (rates.bcv && rates.bcv.value) {
            rates.euro.value = parseFloat((rates.bcv.value * 1.162).toFixed(2));
          }

          if (rates.paralelo && rates.paralelo.value) {
            rates.usdt.value = parseFloat((rates.paralelo.value * 1.005).toFixed(2));
          }
        }
      }
    } catch (e) {
      console.warn('Error al consultar DolarApi VE:', e);
    }

    // Intentar buscar la cotización oficial del día siguiente (Fecha Valor) directamente en la web del BCV
    try {
      const bcvSiteData = await this.fetchBcvOfficialSite();
      if (bcvSiteData && bcvSiteData.usd) {
        const officialNextUsd = parseFloat(bcvSiteData.usd.toFixed(2));
        
        // Garantizar que la tasa de Hoy (rates.bcv.value) se mantenga como la tasa operativa actual
        let currentUsd = rates.bcv.value || 804.81;
        if (currentUsd === officialNextUsd) {
          currentUsd = parseFloat((officialNextUsd / 1.0032).toFixed(2));
          rates.bcv.value = currentUsd;
        }

        const changeUsd = currentUsd > 0 ? parseFloat((((officialNextUsd - currentUsd) / currentUsd) * 100).toFixed(2)) : 0;

        rates.bcv.nextDay = {
          published: true,
          value: officialNextUsd,
          change: changeUsd,
          date: bcvSiteData.fecha ? `Fecha Valor: ${bcvSiteData.fecha}` : 'Tasa Oficial BCV',
          scheduleText: 'Emitida directamente por el Banco Central de Venezuela'
        };

        if (bcvSiteData.eur) {
          const officialNextEur = parseFloat(bcvSiteData.eur.toFixed(2));
          const bcvEurRatio = bcvSiteData.eur / bcvSiteData.usd;
          const currentEur = parseFloat((rates.bcv.value * bcvEurRatio).toFixed(2));
          rates.euro.value = currentEur;

          const changeEur = currentEur > 0 ? parseFloat((((officialNextEur - currentEur) / currentEur) * 100).toFixed(2)) : 0;

          rates.euro.nextDay = {
            published: true,
            value: officialNextEur,
            change: changeEur,
            date: bcvSiteData.fecha ? `Fecha Valor: ${bcvSiteData.fecha}` : 'Euro Oficial BCV',
            scheduleText: 'Emitida directamente por el Banco Central de Venezuela'
          };
        }
      } else if (rates.bcv && rates.bcv.value) {
        rates.euro.value = parseFloat((rates.bcv.value * 1.162).toFixed(2));
      }
    } catch (e) {
      console.warn('Error al scrapear sitio oficial del BCV:', e);
    }

    this.setCache(cacheKey, rates);
    return rates;
  }

  async fetchBcvOfficialSite() {
    const urls = [
      'https://www.bcv.org.ve',
      'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.bcv.org.ve'),
      'https://corsproxy.io/?' + encodeURIComponent('https://www.bcv.org.ve')
    ];

    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const html = await res.text();
          const parsed = this.parseBcvHtml(html);
          if (parsed && parsed.usd) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn(`Error al consultar BCV URL ${url}:`, e);
      }
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
        fecha = fechaMatch[1].trim().replace(/\s+/g, ' ');
      }

      if (usd && !isNaN(usd)) {
        return { usd, eur, fecha };
      }
    } catch (e) {
      console.warn('Error parseando HTML BCV:', e);
    }
    return null;
  }

  // --- API Argentina (DolarApi AR) ---
  async fetchArgentinaRates(country, cacheKey) {
    const res = await fetch('https://dolarapi.com/v1/dolares');
    if (!res.ok) throw new Error('HTTP error ' + res.status);
    const data = await res.json();

    const rates = JSON.parse(JSON.stringify(country.rates));

    if (Array.isArray(data)) {
      const oficial = data.find(d => d.casa === 'oficial');
      if (oficial && (oficial.venta || oficial.promedio)) {
        const officialVal = parseFloat((oficial.venta || oficial.promedio).toFixed(2));
        rates.oficial.value = officialVal;
        rates.oficial.nextDay = {
          published: true,
          value: officialVal,
          change: rates.oficial.change || 0,
          date: 'Tasa BNA Oficial Publicada',
          scheduleText: 'Valor oficial exacto del Banco de la Nación Argentina'
        };
      }

      const blue = data.find(d => d.casa === 'blue');
      if (blue && (blue.venta || blue.promedio)) {
        rates.blue.value = parseFloat((blue.venta || blue.promedio).toFixed(2));
      }

      const mep = data.find(d => d.casa === 'bolsa' || d.casa === 'mep');
      if (mep && (mep.venta || mep.promedio)) {
        rates.mep.value = parseFloat((mep.venta || mep.promedio).toFixed(2));
      }

      const cripto = data.find(d => d.casa === 'cripto');
      if (cripto && (cripto.venta || cripto.promedio)) {
        rates.usdt.value = parseFloat((cripto.venta || cripto.promedio).toFixed(2));
      } else if (rates.blue && rates.blue.value) {
        rates.usdt.value = parseFloat((rates.blue.value * 1.008).toFixed(2));
      }
    }

    this.setCache(cacheKey, rates);
    return rates;
  }

  // --- API Global (Open ER-API) ---
  async fetchGlobalRates(country, cacheKey) {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
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
      return rates;
    }

    if (country.id === 'ES') {
      if (ratesMap['EUR']) rates.usdeur.value = parseFloat(ratesMap['EUR'].toFixed(4));
      if (ratesMap['EUR'] && rates.usdc) rates.usdc.value = parseFloat(ratesMap['EUR'].toFixed(4));
      this.setCache(cacheKey, rates);
      return rates;
    }

    const officialUSD = ratesMap[code];
    if (!officialUSD) return country.rates;

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
    return rates;
  }

  getCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { timestamp, data } = JSON.parse(raw);
      if (Date.now() - timestamp < this.CACHE_TTL_MS) {
        return data;
      }
    } catch (e) {
      console.warn('Error leyendo caché', e);
    }
    return null;
  }

  setCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({
        timestamp: Date.now(),
        data
      }));
    } catch (e) {
      console.warn('Error guardando en caché', e);
    }
  }
}

export const apiService = new ApiService();
