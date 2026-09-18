/**
 * Motor de tasas de cambio de Dolarfy
 * Gestiona el ciclo de vida de los datos: caché, sincronización y suscripciones.
 */

import { COUNTRIES_DATA } from './countriesData.js';
import { apiService } from './apiService.js';
import { RATES_CACHE_KEY_PREFIX } from './constants.js';

class RatesEngine {
  constructor() {
    this.countries = COUNTRIES_DATA;
    this.listeners = [];
    this._hydrateCacheSync();
    this.syncRealRates();
    this._startPolling();
  }

  _hydrateCacheSync() {
    const current = this.getCurrentCountry();
    try {
      if (typeof localStorage === 'undefined') return;

      const cacheKey = `${RATES_CACHE_KEY_PREFIX}_${current.id}`;

      // Limpiar entradas de versiones anteriores del caché
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('dolarfy_rates_cache_') && key !== cacheKey) {
          toRemove.push(key);
        }
      }
      toRemove.forEach(k => { try { localStorage.removeItem(k); } catch {} });

      const raw = localStorage.getItem(cacheKey);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const data = parsed.data || parsed;
      const hasValidRates = data && typeof data === 'object' &&
        Object.values(data).some(r => r && typeof r === 'object' &&
          typeof r.value === 'number' && !isNaN(r.value));

      if (!hasValidRates) return;

      // Descartar caché de más de 7 días
      const cachedAt = typeof parsed.timestamp === 'number' ? parsed.timestamp : 0;
      if (cachedAt > 0 && Date.now() - cachedAt > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(cacheKey);
        return;
      }

      // Limpiar datos obsoletos de nextDay al hidratar la caché
      Object.keys(data).forEach(k => {
        const item = data[k];
        if (item && typeof item === 'object' && item.nextDay) {
          if (!item.value || Math.abs(item.nextDay.value - item.value) < 0.01 || item.nextDay.value <= item.value) {
            item.nextDay = null;
          }
        }
      });

      current.rates = { ...this.countries[0].rates, ...data };
    } catch (e) {
      console.warn('Error al cargar caché inicial:', e);
    } finally {
      if (!current.rates._meta) {
        current.rates._meta = { source: 'placeholder', placeholder: true, fetchedAt: 0 };
      }
    }
  }

  async syncRealRates(force = false) {
    const current = this.getCurrentCountry();
    try {
      const rates = await apiService.fetchRatesForCountry(current, force);
      if (rates) {
        current.rates = rates;
        this._notify(null, 'rates_refreshed');
      }
    } catch (e) {
      console.warn('Error al sincronizar tasas:', e);
    }
  }

  _startPolling() {
    // Polling cada 15 segundos
    setInterval(() => this.syncRealRates(true), 15 * 1000);

    // Refrescar al volver a la app
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.syncRealRates(true);
      });
    }
  }

  getCurrentCountry() {
    return this.countries[0];
  }

  getRates() {
    return { ...this.getCurrentCountry().rates };
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  _notify(updatedRateId, action = 'update') {
    this.listeners.forEach(l => l(this.getRates(), updatedRateId, action));
  }

  toggleSimulationNextDay() {
    const rates = this.getCurrentCountry().rates;
    const daysCycle = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    
    const currentIndex = typeof this._simulatedDayIndex === 'number' ? this._simulatedDayIndex : -1;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= daysCycle.length) {
      if (rates.bcv) rates.bcv.nextDay = null;
      if (rates.euro) rates.euro.nextDay = null;
      this._simulatedDayIndex = -1;
    } else {
      const targetDay = daysCycle[nextIndex];
      this._simulatedDayIndex = nextIndex;

      const bcvVal = rates.bcv?.value || 848.55;
      const eurVal = rates.euro?.value || 974.42;

      if (rates.bcv) {
        rates.bcv.nextDay = {
          published: true,
          isOfficial: true,
          value: parseFloat((bcvVal + (nextIndex + 1) * 1.25).toFixed(2)),
          change: parseFloat((0.40 + nextIndex * 0.1).toFixed(2)),
          date: `Fecha Valor: ${targetDay}`,
          scheduleText: `Simulación de prueba (${targetDay})`
        };
      }
      if (rates.euro) {
        rates.euro.nextDay = {
          published: true,
          isOfficial: true,
          value: parseFloat((eurVal + (nextIndex + 1) * 1.50).toFixed(2)),
          change: parseFloat((0.45 + nextIndex * 0.1).toFixed(2)),
          date: `Fecha Valor: ${targetDay}`,
          scheduleText: `Simulación de prueba (${targetDay})`
        };
      }
    }

    this._notify(null, 'rates_refreshed');
    return this._simulatedDayIndex >= 0 ? daysCycle[this._simulatedDayIndex] : null;
  }

  // Alias público para compatibilidad interna
  notifyListeners(updatedRateId, action = 'update') {
    this._notify(updatedRateId, action);
  }
}

export const ratesEngine = new RatesEngine();

// Alias de compatibilidad — todos los componentes usan mockEngine
export const mockEngine = ratesEngine;
