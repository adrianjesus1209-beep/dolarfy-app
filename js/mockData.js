import { COUNTRIES_DATA } from './countriesData.js';

class MockDataEngine {
  constructor() {
    this.countries = COUNTRIES_DATA;
    this.STORAGE_KEY_DEFAULT = 'dolarfy_default_country';
    this.STORAGE_KEY_SELECTED = 'dolarfy_selected_country';

    // Inicializar país predeterminado y seleccionado
    this.defaultCountryId = this.loadDefaultCountry();
    this.currentCountryId = this.loadSelectedCountry() || this.defaultCountryId;

    this.listeners = [];
    this.startLiveFluctuations();
  }

  loadDefaultCountry() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY_DEFAULT);
      if (saved && this.countries.some(c => c.id === saved)) {
        return saved;
      }
    } catch (e) {
      console.warn('LocalStorage no disponible', e);
    }
    return 'VE'; // Por defecto Venezuela
  }

  loadSelectedCountry() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY_SELECTED);
      if (saved && this.countries.some(c => c.id === saved)) {
        return saved;
      }
    } catch (e) {
      console.warn('LocalStorage no disponible', e);
    }
    return null;
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

  startLiveFluctuations() {
    // Simulación ligera de fluctuación en vivo cada 25 segundos para el país activo
    setInterval(() => {
      const current = this.getCurrentCountry();
      const rateKeys = Object.keys(current.rates);
      if (rateKeys.length === 0) return;

      const randomKey = rateKeys[Math.floor(Math.random() * rateKeys.length)];
      const targetRate = current.rates[randomKey];

      // Variación pequeña entre -0.10% y +0.10%
      const deltaPercent = (Math.random() * 0.2 - 0.10);
      const factor = 1 + (deltaPercent / 100);
      const precision = targetRate.value < 10 ? 4 : 2;
      const newValue = parseFloat((targetRate.value * factor).toFixed(precision));

      targetRate.value = newValue;
      targetRate.change = parseFloat((targetRate.change + deltaPercent).toFixed(2));

      this.notifyListeners(randomKey, 'update');
    }, 25000);
  }
}

export const mockEngine = new MockDataEngine();
