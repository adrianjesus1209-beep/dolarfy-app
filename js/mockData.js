/**
 * Motor de tasas de cambio de Dolarfy
 * Gestiona el ciclo de vida de los datos: caché, sincronización y suscripciones.
 */

import { COUNTRIES_DATA } from './countriesData.js';
import { apiService } from './apiService.js';
import { RATES_CACHE_KEY_PREFIX } from './constants.js';

const POLL_INTERVAL_MS = 15 * 1000; // Base de polling; cada fuente gestiona su propia cadencia/TTL

class RatesEngine {
  constructor() {
    this.countries = COUNTRIES_DATA;
    this.listeners = [];
    this._timer = null;
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

      // Fecha de hoy en VET (UTC-4)
      const now = new Date();
      const vetOffsetMs = -4 * 60 * 60 * 1000;
      const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
      const todayIso = new Date(utcMs + vetOffsetMs).toISOString().split('T')[0];

      // Preservar datos válidos de nextDay y sanitizar cotizaciones USDT desactualizadas
      Object.keys(data).forEach(k => {
        const item = data[k];
        if (item && typeof item === 'object') {
          if (item.nextDay && (!item.nextDay.value || item.nextDay.value <= 0)) {
            item.nextDay = null;
          }
          // Descartar nextDay fabricados por versiones antiguas (publicación falsa con la tasa de hoy)
          if (item.nextDay && /^Oficial BCV \((Lunes|Martes|Mi[ée]rcoles|Jueves|Viernes)\)$/i.test(String(item.nextDay.date || ''))) {
            item.nextDay = null;
          }
          // Descartar pronósticos cuya Fecha Valor ya pasó o corresponde al día actual
          if (item.nextDay && item.nextDay._iso && String(item.nextDay._iso) <= todayIso) {
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

  hasRatesChanged(oldRates, newRates) {
    if (!oldRates || !newRates) return true;
    const keys = ['bcv', 'paralelo', 'euro'];
    for (const k of keys) {
      const o = oldRates[k];
      const n = newRates[k];
      if (!o || !n) return true;
      if (o.value !== n.value) return true;
      const oNext = o.nextDay ? o.nextDay.value : null;
      const nNext = n.nextDay ? n.nextDay.value : null;
      if (oNext !== nNext) return true;
    }
    return false;
  }

  async syncRealRates(force = false) {
    const current = this.getCurrentCountry();
    try {
      const oldRates = JSON.parse(JSON.stringify(current.rates));
      const rates = await apiService.fetchRatesForCountry(current, force);
      if (rates) {
        const changed = this.hasRatesChanged(oldRates, rates);
        current.rates = rates;
        if (changed || force) {
          this._notify(null, 'rates_refreshed');
        }
      }
    } catch (e) {
      console.warn('Error al sincronizar tasas:', e);
    }
  }

  _startPolling() {
    // Polling en segundo plano; la cadencia real por fuente la controla ApiService
    this._startPollTimer();

    // Pausar mientras la app esté en segundo plano y reanudar al volver
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this._startPollTimer();
          this.syncRealRates(true);
        } else {
          this._stopPollTimer();
        }
      });
    }
  }

  _startPollTimer() {
    if (this._timer) return;
    this._timer = setInterval(() => this.syncRealRates(true), POLL_INTERVAL_MS);
  }

  _stopPollTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
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


  // Alias público para compatibilidad interna
  notifyListeners(updatedRateId, action = 'update') {
    this._notify(updatedRateId, action);
  }
}

export const ratesEngine = new RatesEngine();

// Alias de compatibilidad — todos los componentes usan mockEngine
export const mockEngine = ratesEngine;
