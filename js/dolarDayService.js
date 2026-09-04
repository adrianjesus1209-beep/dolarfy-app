/**
 * Servicio para obtener el precio del dólar BCV de hoy y mañana.
 * El BCV publica la tasa del día siguiente usualmente después de las 5PM (VET).
 * Si la `fechaActualizacion` devuelta por la API corresponde a mañana, mostramos el valor.
 */

class DolarDayService {
  constructor() {
    this.CACHE_KEY = 'dolarfy_day_rates_cache';
    this.CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
  }

  /**
   * Retorna { today: { value, change, date }, tomorrow: { value, change, date } | null }
   * Si la tasa de mañana no está publicada, tomorrow = null.
   */
  async fetchVenezuelaRates() {
    const cached = this._getCache();
    if (cached) return cached;

    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares');
      if (!res.ok) throw new Error('HTTP error ' + res.status);
      const data = await res.json();

      const result = this._processRates(data);
      this._setCache(result);
      return result;
    } catch (e) {
      console.warn('[DolarDayService] Error al obtener tasas:', e);
      return { today: null, tomorrow: null };
    }
  }

  _processRates(data) {
    if (!Array.isArray(data)) return { today: null, tomorrow: null };

    // Tomamos el tipo oficial (BCV)
    const bcv = data.find(d => d.fuente === 'oficial' || d.casa === 'oficial');
    const paralelo = data.find(d => d.fuente === 'paralelo' || d.casa === 'paralelo');

    const today = this._getLocalDateStr(0);
    const tomorrow = this._getLocalDateStr(1);

    const result = { today: null, tomorrow: null };

    if (bcv) {
      const apiDate = this._normalizeDate(bcv.fechaActualizacion);
      const prevBcv = data.find(d => (d.fuente === 'oficial' || d.casa === 'oficial') && d._prev);

      const value = parseFloat((bcv.promedio || bcv.venta || 0).toFixed(2));
      // Calculamos el cambio porcentual si tenemos histórico en el objeto
      const prevValue = bcv.anterior ? parseFloat(bcv.anterior.toFixed(2)) : null;
      const change = prevValue ? parseFloat((((value - prevValue) / prevValue) * 100).toFixed(2)) : null;

      const rateEntry = { value, change, date: apiDate, label: 'BCV Oficial', currency: 'VES' };

      if (apiDate === tomorrow) {
        // Ya publicaron mañana
        result.tomorrow = rateEntry;
        // Necesitamos la tasa de hoy del histórico → usamos el campo anterior si existe
        if (prevValue) {
          result.today = { value: prevValue, change: null, date: today, label: 'BCV Oficial', currency: 'VES' };
        } else {
          result.today = { ...rateEntry, date: today };
        }
      } else {
        // La tasa publicada es de hoy (o anterior)
        result.today = rateEntry;
        result.tomorrow = null; // Aún no publicaron
      }
    }

    // También incluimos paralelo como dato adicional
    if (paralelo) {
      const parValue = parseFloat((paralelo.promedio || paralelo.venta || 0).toFixed(2));
      const parChange = paralelo.anterior
        ? parseFloat((((parValue - paralelo.anterior) / paralelo.anterior) * 100).toFixed(2))
        : null;

      if (result.today) result.today.paralelo = { value: parValue, change: parChange };
      if (result.tomorrow) result.tomorrow.paralelo = { value: parValue, change: parChange };
    }

    return result;
  }

  /** Fecha en formato YYYY-MM-DD en hora local Venezuela (UTC-4) */
  _getLocalDateStr(offsetDays = 0) {
    const now = new Date();
    // Venezuela es UTC-4 fijo (sin cambio de horario)
    const vetOffset = -4 * 60; // minutos
    const localMs = now.getTime() + (now.getTimezoneOffset() + vetOffset) * 60 * 1000;
    const d = new Date(localMs + offsetDays * 86400000);
    return d.toISOString().slice(0, 10);
  }

  _normalizeDate(dateStr) {
    if (!dateStr) return null;
    // La API puede devolver "2026-09-01T17:00:00.000Z" o "2026-09-01"
    return dateStr.slice(0, 10);
  }

  _getCache() {
    try {
      const raw = localStorage.getItem(this.CACHE_KEY);
      if (!raw) return null;
      const { timestamp, data } = JSON.parse(raw);
      if (Date.now() - timestamp < this.CACHE_TTL_MS) return data;
    } catch (e) { /* ignore */ }
    return null;
  }

  _setCache(data) {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
    } catch (e) { /* ignore */ }
  }
}

export const dolarDayService = new DolarDayService();
