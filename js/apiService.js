/**
 * Módulo de servicio para la obtención de tasas reales desde APIs gratuitas
 */

class ApiService {
  constructor() {
    this.cache = {};
    this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos de caché
  }

  async fetchRatesForCountry(country) {
    const cacheKey = `dolarfy_rates_cache_${country.id}`;
    const cachedData = this.getCache(cacheKey);

    // Si hay caché válido, devolver de inmediato y actualizar en segundo plano
    if (cachedData) {
      this.fetchFreshRates(country, cacheKey).catch(e => console.warn('Background update warning:', e));
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
      console.warn(`Error al consultar API real para ${country.name}, usando tasas locales:`, error);
      return country.rates;
    }
  }

  // --- API Venezuela (DolarApi) ---
  async fetchVenezuelaRates(country, cacheKey) {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares');
    if (!res.ok) throw new Error('Falló DolarApi VE');
    const data = await res.json();

    // Data array: [{ casa: 'oficial', promedio: 785.07, ... }, { casa: 'paralelo', promedio: 917.5, ... }]
    const rates = { ...country.rates };

    const bcvItem = data.find(d => d.casa === 'oficial' || d.fuente === 'oficial');
    if (bcvItem && bcvItem.promedio) {
      rates.bcv.value = parseFloat(bcvItem.promedio);
      rates.bcv.updatedAt = new Date(bcvItem.fechaActualizacion || Date.now());
    }

    const parItem = data.find(d => d.casa === 'paralelo' || d.fuente === 'paralelo');
    if (parItem && parItem.promedio) {
      rates.paralelo.value = parseFloat(parItem.promedio);
      rates.paralelo.updatedAt = new Date(parItem.fechaActualizacion || Date.now());
    }

    // Intentar obtener Euro si está en la lista o estimar
    const euroItem = data.find(d => d.casa === 'euro' || d.moneda === 'EUR');
    if (euroItem && euroItem.promedio) {
      rates.euro.value = parseFloat(euroItem.promedio);
    } else if (bcvItem && bcvItem.promedio) {
      rates.euro.value = parseFloat((bcvItem.promedio * 1.088).toFixed(2));
    }

    // USDT P2P estimado respecto al paralelo
    if (parItem && parItem.promedio) {
      rates.usdt.value = parseFloat((parItem.promedio * 1.005).toFixed(2));
    }

    this.setCache(cacheKey, rates);
    return rates;
  }

  // --- API Argentina (DolarApi) ---
  async fetchArgentinaRates(country, cacheKey) {
    const res = await fetch('https://dolarapi.com/v1/dolares');
    if (!res.ok) throw new Error('Falló DolarApi AR');
    const data = await res.json();

    const rates = { ...country.rates };

    const oficial = data.find(d => d.casa === 'oficial');
    if (oficial && oficial.venta) {
      rates.oficial.value = parseFloat(oficial.venta);
    }

    const blue = data.find(d => d.casa === 'blue');
    if (blue && blue.venta) {
      rates.blue.value = parseFloat(blue.venta);
    }

    const mep = data.find(d => d.casa === 'bolsa' || d.casa === 'mep');
    if (mep && mep.venta) {
      rates.mep.value = parseFloat(mep.venta);
    }

    const cripto = data.find(d => d.casa === 'cripto');
    if (cripto && cripto.venta) {
      rates.usdt.value = parseFloat(cripto.venta);
    } else if (blue && blue.venta) {
      rates.usdt.value = parseFloat((blue.venta * 1.008).toFixed(2));
    }

    this.setCache(cacheKey, rates);
    return rates;
  }

  // --- API Global (ExchangeRate-API Open) ---
  async fetchGlobalRates(country, cacheKey) {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error('Falló ExchangeRate API Global');
    const data = await res.json();
    const ratesMap = data.rates || {};

    const code = country.currency.code;
    const officialUSD = ratesMap[code];

    if (!officialUSD) return country.rates;

    const rates = { ...country.rates };
    const eurRate = ratesMap['EUR'] || 0.919;

    // Actualizar las tasas locales basadas en la tasa oficial real del Banco Central
    const rateKeys = Object.keys(rates);
    rateKeys.forEach(key => {
      const r = rates[key];
      if (r.type === 'official' && r.code.startsWith('USD')) {
        r.value = parseFloat(officialUSD.toFixed(officialUSD < 10 ? 4 : 2));
      } else if (r.type === 'parallel' || r.type === 'market') {
        // Estimación de mercado libre (~1.2% por encima del oficial)
        r.value = parseFloat((officialUSD * 1.016).toFixed(officialUSD < 10 ? 4 : 2));
      } else if (r.code.startsWith('EUR')) {
        // Tasa EUR respecto a moneda local (1 USD = X Local, 1 EUR = X Local / eurRate)
        const eurVal = officialUSD / eurRate;
        r.value = parseFloat(eurVal.toFixed(eurVal < 10 ? 4 : 2));
      } else if (r.type === 'crypto') {
        r.value = parseFloat((officialUSD * 1.008).toFixed(officialUSD < 10 ? 4 : 2));
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
      console.warn('Error leyendo caché localStorage', e);
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
      console.warn('Error guardando en caché localStorage', e);
    }
  }
}

export const apiService = new ApiService();
