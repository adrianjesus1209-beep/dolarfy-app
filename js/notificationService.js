/**
 * Servicio de Notificaciones Automáticas de Tasa BCV en Tiempo Real (Nativo Android + Web/PWA)
 */

import { formatCurrency, isoToShortDate } from './utils/formatters.js';
import { mockEngine } from './mockData.js';

const REMINDER_CHECK_INTERVAL_MS = 60 * 1000; // Verificación activa cada 60s

class NotificationService {
  constructor() {
    this.STORAGE_ENABLED = 'dolarfy_notifications_enabled';
    this.STORAGE_LAST_DATE = 'dolarfy_last_notified_date';
    this.STORAGE_LOGS = 'dolarfy_notification_logs';

    this.enabled = this.loadEnabledState();
    this.lastNotifiedDate = this._storageGet(this.STORAGE_LAST_DATE) || '';
    this.logs = this.loadLogs();
    this.notificationTimer = null;

    this._syncNativeState();
  }

  _storageGet(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  _storageSet(key, value) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  _syncNativeState() {
    try {
      if (typeof window !== 'undefined' && window.DolarfyNative) {
        if (typeof window.DolarfyNative.setNotificationsEnabled === 'function') {
          window.DolarfyNative.setNotificationsEnabled(Boolean(this.enabled));
        }
      }
    } catch (e) {}
  }

  loadEnabledState() {
    const saved = this._storageGet(this.STORAGE_ENABLED);
    return saved !== null ? saved === 'true' : true;
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
      localStorage.setItem(this.STORAGE_LOGS, JSON.stringify(this.logs.slice(0, 20)));
    } catch (e) {}
  }

  isEnabled() {
    return this.enabled;
  }

  getLogs() {
    return this.logs;
  }

  getTodayString() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
    } catch (e) {
      return new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().split('T')[0];
    }
  }

  async hasPermission() {
    if (typeof window !== 'undefined' && window.DolarfyNative) return true;
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    return Notification.permission === 'granted';
  }

  async requestPermission() {
    try {
      if (typeof window !== 'undefined' && window.DolarfyNative && typeof window.DolarfyNative.requestNotificationPermission === 'function') {
        window.DolarfyNative.requestNotificationPermission();
        return true;
      }
    } catch (e) {}

    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    try {
      const result = await Notification.requestPermission();
      return result === 'granted';
    } catch (e) {
      return false;
    }
  }

  /**
   * Envía la notificación al sistema operativo:
   * 1. Android APK Nativo (NotificationManager con formato idéntico a la bandeja de Android)
   * 2. ServiceWorker Registration (estándar PWA móvil sin error de constructor ilegal)
   * 3. Notification API de escritorio (fallback)
   */
  async sendLocalNotification(entry, dedupKey = '') {
    if (!this.enabled) return;

    const title = entry.title || '📢 Nueva Tasa BCV Disponible';
    const body = entry.body || `${entry.summaryLine || `${entry.rateName}: ${entry.formattedValue}`}${entry.fechaLine ? `\n${entry.fechaLine}` : ''}`;

    // 1. Puente Nativo Android (APK)
    try {
      if (typeof window !== 'undefined' && window.DolarfyNative && typeof window.DolarfyNative.showNotification === 'function') {
        window.DolarfyNative.showNotification(title, body, dedupKey || '');
        return;
      }
    } catch (e) {
      console.warn('Error en notificación nativa Android:', e);
    }

    // 2. Navegador Web / PWA
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        await this.requestPermission();
      }
      if (Notification.permission === 'granted') {
        try {
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg && typeof reg.showNotification === 'function') {
              await reg.showNotification(title, {
                body,
                icon: 'assets/img/logo-sin-fondo.webp',
                badge: 'assets/img/logo-sin-fondo.webp',
                vibrate: [200, 100, 200],
                tag: dedupKey || 'dolarfy-bcv-rate'
              });
              return;
            }
          }
        } catch (swErr) {}

        try {
          new Notification(title, {
            body,
            icon: 'assets/img/logo-sin-fondo.webp'
          });
        } catch (e) {}
      }
    }
  }

  // ==========================================================================
  //  Toggle
  // ==========================================================================

  async toggleNotifications(forceState = null) {
    this.enabled = forceState !== null ? forceState : !this.enabled;
    this._storageSet(this.STORAGE_ENABLED, this.enabled.toString());
    this._syncNativeState();

    if (this.enabled) {
      await this.requestPermission();
      await this.scheduleDailyReminder();
      await this.checkDailyUpdate(mockEngine.getCurrentCountry(), mockEngine.getRates());
    } else {
      await this.cancelDailyReminder();
    }
    return this.enabled;
  }

  // ==========================================================================
  //  Monitoreo periódico activo
  // ==========================================================================

  async scheduleDailyReminder() {
    this.cancelDailyReminder();
    if (typeof setInterval === 'undefined') return;
    this.notificationTimer = setInterval(async () => {
      try {
        await mockEngine.syncRealRates(false);
        const country = mockEngine.getCurrentCountry();
        const rates = mockEngine.getRates();
        await this.checkDailyUpdate(country, rates);
      } catch (e) {}
    }, REMINDER_CHECK_INTERVAL_MS);
  }

  async cancelDailyReminder() {
    if (this.notificationTimer) {
      clearInterval(this.notificationTimer);
      this.notificationTimer = null;
    }
  }

  getLiveRateSummary(country, rates) {
    if (!country || !rates || !rates.bcv) return null;
    return this._buildBcvNotificationPayload(country, rates);
  }

  /**
   * Construye los datos de notificación BCV (USD + EUR + Fecha DD/MM/YYYY)
   * priorizando la Fecha Valor futura (pronóstico) apenas es publicada por el BCV.
   */
  _buildBcvNotificationPayload(country, rates) {
    const bcv = rates?.bcv || {};
    const euro = rates?.euro || {};

    const hasNextDay = Boolean(bcv.nextDay && bcv.nextDay.published && typeof bcv.nextDay.value === 'number' && bcv.nextDay.value > 0);

    const currentCountryRates = mockEngine?.getCurrentCountry?.()?.rates;
    const fallbackUsd = currentCountryRates?.bcv?.value || 0;
    const fallbackEur = currentCountryRates?.euro?.value || 0;

    const usdVal = hasNextDay
      ? bcv.nextDay.value
      : (typeof bcv.value === 'number' && bcv.value > 0 ? bcv.value : fallbackUsd);

    const eurVal = (hasNextDay && euro.nextDay && typeof euro.nextDay.value === 'number' && euro.nextDay.value > 0)
      ? euro.nextDay.value
      : (typeof euro.value === 'number' && euro.value > 0 ? euro.value : fallbackEur);

    const isoDate = (hasNextDay && bcv.nextDay._iso)
      ? bcv.nextDay._iso
      : (bcv._iso || this.getTodayString());

    const shortDate = (hasNextDay && bcv.nextDay.shortDate)
      ? bcv.nextDay.shortDate
      : (bcv.effectiveDate || isoToShortDate(isoDate));

    const usdText = usdVal.toFixed(2);
    const eurText = eurVal.toFixed(2);

    const title = '📢 Nueva Tasa BCV Disponible';
    const summaryLine = `USD = Bs. ${usdText} | EUR = Bs. ${eurText}`;
    const fechaLine = `Fecha: ${shortDate}`;
    const body = `${summaryLine}\n${fechaLine}`;
    const dedupKey = `${country.id}_${isoDate}_${usdText}_${eurText}`;

    return {
      id: Date.now(),
      countryId: country.id,
      countryName: country.name,
      flagUrl: country.flagUrl,
      title,
      rateName: title,
      summaryLine,
      fechaLine,
      shortDate,
      isoDate,
      body,
      value: usdVal,
      eurValue: eurVal,
      currency: bcv.currency || 'VES',
      formattedValue: `Bs. ${usdText}`,
      time: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true }),
      date: shortDate,
      dedupKey,
      isNextDay: hasNextDay,
      type: 'live'
    };
  }

  // ==========================================================================
  //  Detección de nueva tasa BCV publicada (Hoy o Fecha Valor siguiente)
  // ==========================================================================

  async checkDailyUpdate(country, rates) {
    if (!this.enabled || !rates || !rates.bcv) return;

    // No disparar sobre datos placeholder antes de la primera sincronización real
    if (rates._meta?.placeholder) return;

    const payload = this._buildBcvNotificationPayload(country, rates);
    if (!payload || !payload.value) return;

    // Si ya notificamos exactamente esta misma Fecha Valor + tasa, omitir
    if (this.lastNotifiedDate === payload.dedupKey) return;

    // Verificar si el servicio en segundo plano de Android ya lanzó la notificación en la barra de estado
    let alreadyNotifiedByNative = false;
    try {
      if (typeof window !== 'undefined' && window.DolarfyNative && typeof window.DolarfyNative.getLastNotifiedKey === 'function') {
        const nativeKey = window.DolarfyNative.getLastNotifiedKey();
        if (nativeKey && nativeKey === payload.dedupKey) {
          alreadyNotifiedByNative = true;
        }
      }
    } catch (e) {}

    this.lastNotifiedDate = payload.dedupKey;
    this._storageSet(this.STORAGE_LAST_DATE, payload.dedupKey);

    this.logs.unshift(payload);
    this.saveLogs();

    if (!alreadyNotifiedByNative) {
      await this.sendLocalNotification(payload, payload.dedupKey);
    }
    this.showToast(payload);
  }

  clearLogs() {
    this.logs = [];
    this.saveLogs();
  }

  // ==========================================================================
  //  Toast in-app con diseño de Alerta Oficial BCV
  // ==========================================================================

  showToast(logEntry) {
    let toastContainer = document.getElementById('dolarfy-toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'dolarfy-toast-container';
      toastContainer.className = 'fixed top-16 left-1/2 -translate-x-1/2 z-[150] w-full max-w-sm px-4 pointer-events-none';
      document.body.appendChild(toastContainer);
    }

    const toastEl = document.createElement('div');
    toastEl.className = 'pointer-events-auto bg-[#161B22] border border-cyan-500/40 rounded-2xl p-4 shadow-2xl glow-cyan flex items-start space-x-3 animate-fade-in transition-all duration-300 mb-2';
    toastEl.innerHTML = `
      <img src="assets/img/logo-sin-fondo.webp" alt="Dolarfy" class="w-8 h-8 rounded-xl object-contain bg-cyan-500/10 p-1 border border-cyan-500/30 mt-0.5">
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Dolarfy · Ahora
          </span>
          <span class="text-[9px] text-gray-400">${logEntry.time}</span>
        </div>
        <h4 class="text-xs font-extrabold text-white mt-1">${logEntry.title || logEntry.rateName}</h4>
        <p class="text-xs font-bold text-emerald-400 mt-0.5">${logEntry.summaryLine || logEntry.formattedValue}</p>
        ${logEntry.fechaLine ? `<p class="text-[11px] text-gray-300 font-semibold mt-0.5">${logEntry.fechaLine}</p>` : ''}
      </div>
      <button class="toast-close-btn text-gray-400 hover:text-white p-1 text-xs cursor-pointer">✕</button>
    `;

    const closeBtn = toastEl.querySelector('.toast-close-btn');
    closeBtn?.addEventListener('click', () => {
      toastEl.remove();
    });

    toastContainer.appendChild(toastEl);

    setTimeout(() => {
      if (toastEl.parentNode) {
        toastEl.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => toastEl.remove(), 300);
      }
    }, 7000);
  }
}

export const notificationService = new NotificationService();
