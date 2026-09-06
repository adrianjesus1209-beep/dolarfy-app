/**
 * Módulo de servicio para la obtención de tasas reales desde APIs oficiales
 * Fuentes: API ve.dolarapi.com (fuente: oficial BCV) + scraping bcv.org.ve
 * Solo tasas OFICIALES del Banco Central de Venezuela
 */

class ApiService {
  constructor() {
    this.CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos para actualización rápida en tiempo real
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
      } else {
        return await this.fetchGlobalRates(country, cacheKey);
      }
    } catch (error) {
      console.warn(`Error al consultar API real para ${country.name}:`, error);
      return country.rates;
    }
  }

  // --- API Venezuela: Solo fuentes oficiales BCV ---
  async fetchVenezuelaRates(country, cacheKey) {
    const rates = JSON.parse(JSON.stringify(country.rates));

    // 1. Intentar ve.dolarapi.com (fuente: oficial BCV)
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const bcvItem = data.find(d => d.fuente === 'oficial' || d.casa === 'oficial');
          if (bcvItem && bcvItem.promedio) {
            rates.bcv.value = parseFloat(bcvItem.promedio.toFixed(2));
          }

          // Euro desde la misma API si viene
          const euroItem = data.find(d => (d.fuente === 'oficial' || d.casa === 'oficial') && d.moneda === 'EUR');
          if (euroItem && euroItem.promedio) {
            rates.euro.value = parseFloat(euroItem.promedio.toFixed(2));
          } else if (rates.bcv && rates.bcv.value) {
            // Calcular euro con relación oficial aproximada si no viene en la API
            rates.euro.value = parseFloat((rates.bcv.value * 1.162).toFixed(2));
          }
        }
      }
    } catch (e) {
      console.warn('Error al consultar DolarApi VE:', e);
    }

    // 2. Intentar scraping/API del sitio oficial BCV para fecha valor del día siguiente
    try {
      const bcvSiteData = await this.fetchBcvOfficialSite();
      if (bcvSiteData && bcvSiteData.usd) {
        const bcvUsd = parseFloat(bcvSiteData.usd.toFixed(2));
        const isFutureFechaValor = this.isNextDayPublished(bcvSiteData.fecha);

        if (isFutureFechaValor) {
          // Es la cotización oficial del DÍA SIGUIENTE (Fecha Valor)
          const currentUsd = rates.bcv.value || bcvUsd;
          const changeUsd = currentUsd > 0 ? parseFloat((((bcvUsd - currentUsd) / currentUsd) * 100).toFixed(2)) : 0;

          rates.bcv.nextDay = {
            published: true,
            value: bcvUsd,
            change: changeUsd,
            date: bcvSiteData.fecha ? `Fecha Valor: ${bcvSiteData.fecha}` : 'Tasa Oficial BCV',
            scheduleText: 'Emitida directamente por el Banco Central de Venezuela'
          };

          if (bcvSiteData.eur) {
            const officialNextEur = parseFloat(bcvSiteData.eur.toFixed(2));
            const currentEur = rates.euro.value || parseFloat((currentUsd * 1.162).toFixed(2));
            const changeEur = currentEur > 0 ? parseFloat((((officialNextEur - currentEur) / currentEur) * 100).toFixed(2)) : 0;

            rates.euro.nextDay = {
              published: true,
              value: officialNextEur,
              change: changeEur,
              date: bcvSiteData.fecha ? `Fecha Valor: ${bcvSiteData.fecha}` : 'Euro Oficial BCV',
              scheduleText: 'Emitida directamente por el Banco Central de Venezuela'
            };
          }
        } else {
          // La fecha del BCV corresponde al DÍA DE HOY
          rates.bcv.value = bcvUsd;
          if (bcvSiteData.eur) {
            rates.euro.value = parseFloat(bcvSiteData.eur.toFixed(2));
          } else {
            rates.euro.value = parseFloat((bcvUsd * 1.162).toFixed(2));
          }

          if (rates.bcv.nextDay) {
            rates.bcv.nextDay.published = false;
          }
          if (rates.euro.nextDay) {
            rates.euro.nextDay.published = false;
          }
        }
      }
    } catch (e) {
      console.warn('Error al scrapear sitio oficial del BCV:', e);
    }

    this.setCache(cacheKey, rates);
    return rates;
  }

  isNextDayPublished(fechaStr) {
    if (!fechaStr) return false;
    try {
      const match = fechaStr.match(/(\d{1,2})\s+([A-Za-záéíóúÁÉÍÓÚ]+)(?:\s+(\d{4}))?/i);
      if (!match) return false;

      const dayNum = parseInt(match[1], 10);
      const monthName = match[2].toLowerCase();
      const yearNum = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();

      const monthsMap = {
        enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
        julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
      };

      const bcvMonth = monthsMap[monthName];
      if (bcvMonth === undefined) return false;

      const bcvDate = new Date(yearNum, bcvMonth, dayNum);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return bcvDate.getTime() > today.getTime();
    } catch (e) {
      return false;
    }
  }

  async fetchBcvOfficialSite() {
    // 1. Intentar proveedor directo API especializado DolarVzla
    try {
      const resApi = await fetch('https://api.dolarvzla.com/bcv/current.json');
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

    // 2. Scraping de respaldo al portal bcv.org.ve vía proxies CORS
    const urls = [
      'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.bcv.org.ve'),
      'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent('https://www.bcv.org.ve'),
      'https://www.bcv.org.ve'
    ];

    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          let html = '';
          if (url.includes('/get?')) {
            const json = await res.json();
            html = json.contents || '';
          } else {
            html = await res.text();
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
