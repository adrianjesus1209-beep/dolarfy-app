/**
 * Servicio de Historial de Conversiones de la Calculadora
 */

class CalcHistoryService {
  constructor() {
    this.STORAGE_KEY = 'dolarfy_calc_history';
    this.history = this.loadHistory();
  }

  loadHistory() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('Error al cargar historial de calculadora', e);
      return [];
    }
  }

  saveHistory() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.history.slice(0, 20)));
    } catch (e) {
      console.warn('Error al guardar historial de calculadora', e);
    }
  }

  addEntry(entry) {
    // Evitar duplicados inmediatos idénticos
    if (this.history.length > 0) {
      const last = this.history[0];
      if (last.expression === entry.expression && last.rateId === entry.rateId && last.countryId === entry.countryId) {
        return;
      }
    }

    const newEntry = {
      id: Date.now(),
      expression: entry.expression,
      resultText: entry.resultText,
      countryId: entry.countryId,
      countryName: entry.countryName,
      flagUrl: entry.flagUrl,
      rateName: entry.rateName,
      rateId: entry.rateId,
      rateValue: entry.rateValue,
      fromCurrency: entry.fromCurrency,
      toCurrency: entry.toCurrency,
      timestamp: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true })
    };

    this.history.unshift(newEntry);
    this.saveHistory();
  }

  getHistory() {
    return this.history;
  }

  clearHistory() {
    this.history = [];
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

export const calcHistoryService = new CalcHistoryService();
