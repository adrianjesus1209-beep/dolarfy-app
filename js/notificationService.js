/**
 * Servicio de Notificaciones Automáticas de Tasa Diaria
 */

import { formatCurrency } from './utils/formatters.js';

class NotificationService {
  constructor() {
    this.STORAGE_ENABLED = 'dolarfy_notifications_enabled';
    this.STORAGE_LAST_DATE = 'dolarfy_last_notified_date';
    this.STORAGE_LOGS = 'dolarfy_notification_logs';

    this.enabled = this.loadEnabledState();
    this.lastNotifiedDate = localStorage.getItem(this.STORAGE_LAST_DATE) || '';
    this.logs = this.loadLogs();
  }

  loadEnabledState() {
    const saved = localStorage.getItem(this.STORAGE_ENABLED);
    return saved !== null ? saved === 'true' : true; // Por defecto activadas
  }

  loadLogs() {
    try {
      const raw = localStorage.getItem(this.STORAGE_LOGS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  saveLogs() {
    try {
      localStorage.setItem(this.STORAGE_LOGS, JSON.stringify(this.logs.slice(0, 15)));
    } catch (e) {
      console.warn('Error al guardar historial de notificaciones', e);
    }
  }

  isEnabled() {
    return this.enabled;
  }

  toggleNotifications(forceState = null) {
    this.enabled = forceState !== null ? forceState : !this.enabled;
    localStorage.setItem(this.STORAGE_ENABLED, this.enabled.toString());
    return this.enabled;
  }

  getLogs() {
    return this.logs;
  }

  getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  }

  checkDailyUpdate(country, rates) {
    if (!this.enabled || !rates) return;

    const rateKeys = Object.keys(rates);
    if (rateKeys.length === 0) return;

    const mainRate = rates[country.defaultRateId] || rates[rateKeys[0]];
    if (!mainRate || !mainRate.value) return;

    const todayStr = this.getTodayString();
    const lastKey = `${country.id}_${todayStr}_${mainRate.value.toFixed(2)}`;

    // Si ya notificamos esta misma tasa para la fecha de hoy, omitir
    if (this.lastNotifiedDate === lastKey) return;

    this.lastNotifiedDate = lastKey;
    localStorage.setItem(this.STORAGE_LAST_DATE, lastKey);

    const logEntry = {
      id: Date.now(),
      countryId: country.id,
      countryName: country.name,
      flagUrl: country.flagUrl,
      rateName: mainRate.name,
      value: mainRate.value,
      currency: mainRate.currency,
      formattedValue: formatCurrency(mainRate.value, mainRate.currency, mainRate.value < 10 ? 4 : 2),
      time: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true }),
      date: new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })
    };

    this.logs.unshift(logEntry);
    this.saveLogs();

    this.showToast(logEntry);
  }

  showToast(logEntry) {
    let toastContainer = document.getElementById('dolarfy-toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'dolarfy-toast-container';
      toastContainer.className = 'fixed top-16 left-1/2 -translate-x-1/2 z-[150] w-full max-w-sm px-4 pointer-events-none';
      document.body.appendChild(toastContainer);
    }

    const toastEl = document.createElement('div');
    toastEl.className = 'pointer-events-auto bg-[#0F141C] border border-cyan-500/40 rounded-2xl p-4 shadow-2xl glow-cyan flex items-start space-x-3 animate-fade-in transition-all duration-300';
    toastEl.innerHTML = `
      <img src="${logEntry.flagUrl}" alt="${logEntry.countryName}" class="w-8 h-8 rounded-full object-cover border border-cyan-500/30 mt-0.5">
      <div class="flex-1">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Nueva Tasa del Día
          </span>
          <span class="text-[9px] text-gray-400">${logEntry.time}</span>
        </div>
        <h4 class="text-xs font-bold text-white mt-0.5">${logEntry.rateName}</h4>
        <p class="text-sm font-extrabold text-emerald-400">${logEntry.formattedValue}</p>
      </div>
      <button class="toast-close-btn text-gray-400 hover:text-white p-1 text-xs">✕</button>
    `;

    const closeBtn = toastEl.querySelector('.toast-close-btn');
    closeBtn?.addEventListener('click', () => {
      toastEl.remove();
    });

    toastContainer.appendChild(toastEl);

    // Auto eliminar después de 6 segundos
    setTimeout(() => {
      if (toastEl.parentNode) {
        toastEl.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => toastEl.remove(), 300);
      }
    }, 6000);
  }
}

export const notificationService = new NotificationService();
