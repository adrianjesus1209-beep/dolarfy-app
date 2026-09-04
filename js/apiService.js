/**
 * Módulo de servicio para la obtención de tasas reales desde APIs gratuitas en tiempo real
 */

class ApiService {
  constructor() {
    this.CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos de caché inteligente
    this.FORECAST_CACHE_KEY = 'dolarfy_forecast_cache';
    this.FORECAST_CACHE_TTL = 10 * 60 * 1000; // 10 minutos
  }

  async fetchRatesForCountry(country) {
    const cacheKey = `dolarfy_rates_cache_${country.id}`;
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

  // --- API Venezuela (DolarApi VE) ---
  async fetchVenezuelaRates(country, cacheKey) {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares');
    if (!res.ok) throw new Error('HTTP error ' + res.status);
    const data = await res.json();

    const rates = JSON.parse(JSON.stringify(country.rates));

    if (Array.isArray(data)) {
      const bcvItem = data.find(d => d.fuente === 'oficial' || d.casa === 'oficial');
      if (bcvItem && bcvItem.promedio) {
        rates.bcv.value = parseFloat(bcvItem.promedio.toFixed(2));
        rates.bcv.publishedAt = bcvItem.fechaActualizacion || null;
      }

      const parItem = data.find(d => d.fuente === 'paralelo' || d.casa === 'paralelo');
      if (parItem && parItem.promedio) {
        rates.paralelo.value = parseFloat(parItem.promedio.toFixed(2));
        rates.paralelo.publishedAt = parItem.fechaActualizacion || null;
      }

      if (rates.bcv && rates.bcv.value) {
        // Tasa Euro oficial ajustada al estándar BCV
        rates.euro.value = parseFloat((rates.bcv.value * 1.088).toFixed(2));
        rates.euro.publishedAt = rates.bcv.publishedAt || null;
      }

      if (rates.paralelo && rates.paralelo.value) {
        // USDT P2P mercado Binance promedio
        rates.usdt.value = parseFloat((rates.paralelo.value * 1.005).toFixed(2));
        rates.usdt.publishedAt = rates.paralelo.publishedAt || null;
      }
    }

    this.setCache(cacheKey, rates);
    return rates;
  }

  /**
   * Obtiene datos de pronóstico Hoy/Mañana para Venezuela
   * La tasa publicada después de las 5 PM VET es la tasa vigente para el día siguiente
   */
  async fetchForecastData(country) {
    const cacheKey = `${this.FORECAST_CACHE_KEY}_${country.id}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      if (country.id === 'VE') {
        return await this._fetchVEForecast(country, cacheKey);
      } else if (country.id === 'AR') {
        return await this._fetchARForecast(country, cacheKey);
      }
      return null; // No forecast for other countries
    } catch (e) {
      console.warn('Error cargando pronóstico:', e);
      return null;
    }
  }

  async _fetchVEForecast(country, cacheKey) {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares');
    if (!res.ok) throw new Error('HTTP error ' + res.status);
    const data = await res.json();

    if (!Array.isArray(data)) return null;

    const bcvItem = data.find(d => d.fuente === 'oficial' || d.casa === 'oficial');
    if (!bcvItem || !bcvItem.promedio) return null;

    const publishedAt = bcvItem.fechaActualizacion ? new Date(bcvItem.fechaActualizacion) : null;
    const nowVET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Caracas' }));
    const pubVET = publishedAt ? new Date(publishedAt.toLocaleString('en-US', { timeZone: 'America/Caracas' })) : null;

    // BCV publica a las 5 PM VET. Si la publicación fue hoy después de las 4 PM,
    // esa tasa aplica para el día bancario siguiente.
    const sameDay = pubVET && pubVET.getDate() === nowVET.getDate() &&
      pubVET.getMonth() === nowVET.getMonth() && pubVET.getFullYear() === nowVET.getFullYear();

    const pubHour = pubVET ? pubVET.getHours() : 0;
    const tomorrowRateAvailable = sameDay && pubHour >= 16; // 4 PM o después

    const bcvRate = parseFloat(bcvItem.promedio.toFixed(2));
    const parItem = data.find(d => d.fuente === 'paralelo' || d.casa === 'paralelo');
    const parallelRate = parItem ? parseFloat(parItem.promedio.toFixed(2)) : null;

    const forecast = {
      countryId: 'VE',
      mainRateLabel: 'Dólar BCV',
      mainRateCode: 'USD/VES',
      currency: 'VES',
      today: {
        value: bcvRate,
        label: 'Hoy',
        publishedAt: publishedAt ? publishedAt.toISOString() : null,
        parallel: parallelRate
      },
      tomorrow: tomorrowRateAvailable ? {
        value: bcvRate,  // El valor publicado hoy tarde ES el de mañana
        label: 'Mañana',
        publishedAt: publishedAt ? publishedAt.toISOString() : null,
        parallel: parallelRate,
        isNextDay: true
      } : null,
      publishedAt: publishedAt ? publishedAt.toISOString() : null,
      tomorrowAvailable: tomorrowRateAvailable,
      publicationTime: '5:00 PM VET'
    };

    this.setCache(cacheKey, forecast);
    return forecast;
  }

  async _fetchARForecast(country, cacheKey) {
    const res = await fetch('https://dolarapi.com/v1/dolares');
    if (!res.ok) throw new Error('HTTP error ' + res.status);
    const data = await res.json();

    if (!Array.isArray(data)) return null;

    const oficial = data.find(d => d.casa === 'oficial');
    if (!oficial) return null;

    const bcvRate = parseFloat((oficial.venta || oficial.promedio || 0).toFixed(2));
    const publishedAt = oficial.fechaActualizacion ? new Date(oficial.fechaActualizacion) : null;
    const nowAR = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const pubAR = publishedAt ? new Date(publishedAt.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })) : null;

    const sameDay = pubAR && pubAR.getDate() === nowAR.getDate() &&
      pubAR.getMonth() === nowAR.getMonth() && pubAR.getFullYear() === nowAR.getFullYear();
    const pubHour = pubAR ? pubAR.getHours() : 0;
    const tomorrowRateAvailable = sameDay && pubHour >= 15;

    const blue = data.find(d => d.casa === 'blue');
    const blueRate = blue ? parseFloat((blue.venta || blue.promedio || 0).toFixed(2)) : null;

    const forecast = {
      countryId: 'AR',
      mainRateLabel: 'Dólar Oficial',
      mainRateCode: 'USD/ARS',
      currency: 'ARS',
      today: {
        value: bcvRate,
        label: 'Hoy',
        publishedAt: publishedAt ? publishedAt.toISOString() : null,
        parallel: blueRate
      },
      tomorrow: tomorrowRateAvailable ? {
        value: bcvRate,
        label: 'Mañana',
        publishedAt: publishedAt ? publishedAt.toISOString() : null,
        parallel: blueRate,
        isNextDay: true
      } : null,
      publishedAt: publishedAt ? publishedAt.toISOString() : null,
      tomorrowAvailable: tomorrowRateAvailable,
      publicationTime: '3:00 PM ART'
    };

    this.setCache(cacheKey, forecast);
    return forecast;
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
        rates.oficial.value = parseFloat((oficial.venta || oficial.promedio).toFixed(2));
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
