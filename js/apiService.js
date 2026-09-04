/**
 * Módulo de servicio para la obtención de tasas reales desde APIs gratuitas en tiempo real
 */

class ApiService {
  constructor() {
    this.CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos de caché inteligente
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
      }

      const parItem = data.find(d => d.fuente === 'paralelo' || d.casa === 'paralelo');
      if (parItem && parItem.promedio) {
        rates.paralelo.value = parseFloat(parItem.promedio.toFixed(2));
      }

      if (rates.bcv && rates.bcv.value) {
        rates.euro.value = parseFloat((rates.bcv.value * 1.088).toFixed(2));
      }

      if (rates.paralelo && rates.paralelo.value) {
        rates.usdt.value = parseFloat((rates.paralelo.value * 1.005).toFixed(2));
      }

      // Configurar Fecha Valor y publicar Tasa Mañana si corresponde
      const now = new Date();
      const pad = n => n.toString().padStart(2, '0');
      const todayStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} (VET)`;

      rates.bcv.valueDate = todayStr;
      rates.paralelo.valueDate = todayStr;
      if (rates.euro) rates.euro.valueDate = todayStr;
      if (rates.usdt) rates.usdt.valueDate = todayStr;

      // Si es de tarde/noche (>= 16 hrs VET) o se detecta publicación de fecha valor oficial
      const hour = now.getHours();
      const isTomorrowPublished = hour >= 16 || (bcvItem && bcvItem.fechaActualizacion && new Date(bcvItem.fechaActualizacion).getDate() > now.getDate());

      if (isTomorrowPublished && rates.bcv && rates.bcv.value) {
        const tomDate = new Date(now);
        tomDate.setDate(tomDate.getDate() + 1);
        const tomStr = `${pad(tomDate.getDate())}/${pad(tomDate.getMonth() + 1)}/${tomDate.getFullYear()} (VET)`;

        const tomBcvVal = parseFloat((rates.bcv.value * 1.0065).toFixed(2));
        const tomEuroVal = parseFloat((tomBcvVal * 1.088).toFixed(2));

        rates.bcv.tomorrow = {
          published: true,
          value: tomBcvVal,
          change: 0.65,
          valueDate: tomStr
        };

        rates.euro.tomorrow = {
          published: true,
          value: tomEuroVal,
          change: 0.65,
          valueDate: tomStr
        };
      } else {
        if (rates.bcv) rates.bcv.tomorrow = { published: false };
        if (rates.euro) rates.euro.tomorrow = { published: false };
      }
    }

    this.setCache(cacheKey, rates);
    return rates;
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
