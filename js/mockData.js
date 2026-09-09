import { COUNTRIES_DATA } from './countriesData.js';
import { apiService } from './apiService.js';

class MockDataEngine {
  constructor() {
    this.countries = COUNTRIES_DATA;

    // Dolarfy es una app 100% Venezuela
    this.listeners = [];
    this.hydrateCacheSync();
    this.syncRealRates();
    this.startScheduleCheck();
  }

  hydrateCacheSync() {
    try {
      if (typeof localStorage === 'undefined') return;
      const current = this.getCurrentCountry();

      // Limpieza de versiones anteriores del caché de tasas en localStorage
      const cacheKey = `dolarfy_rates_cache_v12_${current.id}`;
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('dolarfy_rates_cache_') && key !== cacheKey) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
      });

      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const data = parsed.data || parsed;
        const hasValidRates = data && typeof data === 'object' &&
          Object.values(data).some(r => r && typeof r === 'object' &&
            typeof r.value === 'number' && !isNaN(r.value));
        if (hasValidRates) {
          // Descartar caché demasiado antigua (> 7 días) para no mostrar datos sin vigencia
          const cachedAt = typeof parsed.timestamp === 'number' ? parsed.timestamp : 0;
          const isTooOld = cachedAt > 0 && (Date.now() - cachedAt) > 7 * 24 * 60 * 60 * 1000;
          if (isTooOld) {
            localStorage.removeItem(cacheKey);
          } else {
            current.rates = data;
          }
        }
      }
    } catch (e) {
      console.warn('Error al cargar caché síncrono inicial:', e);
    }
  }

  async syncRealRates() {
    const current = this.getCurrentCountry();
    try {
      const realRates = await apiService.fetchRatesForCountry(current);
      if (realRates) {
        current.rates = realRates;
        this.notifyListeners(null, 'rates_refreshed');
      }
    } catch (e) {
      console.warn('Error al sincronizar tasas reales:', e);
    }
  }

  getCurrentCountry() {
    return this.countries[0];
  }

  getRates() {
    const current = this.getCurrentCountry();
    return { ...current.rates };
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notifyListeners(updatedRateId, action = 'update') {
    this.listeners.forEach(listener => listener(this.getRates(), updatedRateId, action));
  }

  startScheduleCheck() {
    // Comprobar la API oficial cada 30 minutos para ahorrar batería y tráfico de red
    setInterval(() => {
      this.syncRealRates();
    }, 30 * 60 * 1000);
  }
}

export const mockEngine = new MockDataEngine();
