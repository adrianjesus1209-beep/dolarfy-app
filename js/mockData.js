import { COUNTRIES_DATA } from './countriesData.js';
import { apiService } from './apiService.js';

class MockDataEngine {
  constructor() {
    this.countries = COUNTRIES_DATA;
    this.STORAGE_KEY_DEFAULT = 'dolarfy_default_country';
    this.STORAGE_KEY_SELECTED = 'dolarfy_selected_country';

    // Inicializar país predeterminado y seleccionado
    this.defaultCountryId = this.loadDefaultCountry();
    this.currentCountryId = this.loadSelectedCountry() || this.defaultCountryId;

    this.listeners = [];
    this.hydrateCacheSync();
    this.syncRealRates();
    this.startScheduleCheck();
  }

  hydrateCacheSync() {
    try {
      const current = this.getCurrentCountry();
      const cacheKey = `dolarfy_rates_cache_v3_${current.id}`;
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const data = parsed.data || parsed;
        // Invalidar caché si contiene el dólar paralelo/USDT (ya eliminado del sistema)
        if (data && data.usdt) {
          localStorage.removeItem(cacheKey);
          console.info('Caché antigua con dólar paralelo eliminada. Se consultará la API oficial.');
          return;
        }
        if (data && typeof data === 'object' && data.bcv && data.bcv.value) {
          current.rates = data;
        }
      }
    } catch (e) {
      console.warn('Error al cargar caché síncrono inicial:', e);
    }
  }

  loadDefaultCountry() {
    return 'VE'; // Exclusivo Venezuela
  }

  loadSelectedCountry() {
    return 'VE';
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

  getCountries() {
    return this.countries;
  }

  getCurrentCountry() {
    return this.countries.find(c => c.id === this.currentCountryId) || this.countries[0];
  }

  getDefaultCountryId() {
    return this.defaultCountryId;
  }

  setSelectedCountry(countryId) {
    if (!this.countries.some(c => c.id === countryId)) return;

    this.currentCountryId = countryId;
    try {
      localStorage.setItem(this.STORAGE_KEY_SELECTED, countryId);
    } catch (e) {
      console.warn('LocalStorage no disponible', e);
    }

    this.notifyListeners(null, 'country_change');
    this.syncRealRates();
  }

  setDefaultCountry(countryId) {
    if (!this.countries.some(c => c.id === countryId)) return;

    this.defaultCountryId = countryId;
    try {
      localStorage.setItem(this.STORAGE_KEY_DEFAULT, countryId);
    } catch (e) {
      console.warn('LocalStorage no disponible', e);
    }

    this.notifyListeners(null, 'default_country_change');
  }

  getRates() {
    const current = this.getCurrentCountry();
    return { ...current.rates };
  }

  getRate(id) {
    const current = this.getCurrentCountry();
    if (current.rates[id]) return current.rates[id];

    const firstKey = Object.keys(current.rates)[0];
    return current.rates[firstKey];
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
