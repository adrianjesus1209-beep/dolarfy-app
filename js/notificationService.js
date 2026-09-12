/**
 * Servicio de Notificaciones Automáticas de Tasa Diaria
 * - Notificaciones reales del sistema vía @capacitor/local-notifications
 * - Respaldado por toast/log in-app cuando se ejecuta en navegador (no-nativo)
 */

import { Capacitor } from '../assets/vendor/capacitor/core/dist/index.js';
import { LocalNotifications } from '../assets/vendor/capacitor/local-notifications/esm/index.js';
import { formatCurrency } from './utils/formatters.js';

class NotificationService {
  constructor() {
    this.STORAGE_ENABLED = 'dolarfy_notifications_enabled';
    this.STORAGE_LAST_DATE = 'dolarfy_last_notified_date';
    this.STORAGE_LOGS = 'dolarfy_notification_logs';
    this.STORAGE_CHANNEL = 'dolarfy_notification_channel';
    this.DAILY_NOTIFICATION_ID = 9001;
    this.CHANNEL_ID = 'dolarfy-daily-rate';

    this.isNative = typeof Capacitor !== 'undefined' && !!Capacitor.isNativePlatform();

    this.enabled = this.loadEnabledState();
    this.lastNotifiedDate = this._storageGet(this.STORAGE_LAST_DATE) || '';
    this.logs = this.loadLogs();

    if (this.isNative) {
      this.ensureChannel();
    }
  }

  _storageGet(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('Error leyendo almacenamiento', e);
      return null;
    }
  }

  _storageSet(key, value) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('Error escribiendo almacenamiento', e);
    }
  }

  loadEnabledState() {
    const saved = this._storageGet(this.STORAGE_ENABLED);
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

  getLogs() {
    return this.logs;
  }

  getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  }

  // ==========================================================================
  //  Capacitor Local Notifications (Nativo)
  // ==========================================================================

  async ensureChannel() {
    try {
      const created = await LocalNotifications.isChannelCreated({ id: this.CHANNEL_ID });
      if (!created.value) {
        await LocalNotifications.createChannel({
          id: this.CHANNEL_ID,
          name: 'Tasas del Día',
          description: 'Alertas diarias de la tasa oficial del Banco Central de Venezuela (BCV).',
          importance: 5,
          visibility: 1,
          sound: 'default'
        });
        this._storageSet(this.STORAGE_CHANNEL, 'created');
      }
    } catch (e) {
      console.warn('Error creando canal de notificaciones:', e);
    }
  }

  async hasPermission() {
    if (!this.isNative) return false;
    try {
      const perm = await LocalNotifications.checkPermissions();
      return perm.display === 'granted';
    } catch (e) {
      console.warn('Error comprobando permisos:', e);
      return false;
    }
  }

  async requestPermission() {
    if (!this.isNative) return false;
    try {
      const perm = await LocalNotifications.requestPermissions();
      return perm.display === 'granted';
    } catch (e) {
      console.warn('Error solicitando permisos:', e);
      return false;
    }
  }

  /**
   * Hora local a la que 17:00 VET (hora de cierre BCV, UTC-4) ocurre en el
   * dispositivo. VET no usa horario de verano, por lo que es fijo = 21:00 UTC.
   * getTimezoneOffset() devuelve UTC - local (positivo al Oeste), p. ej.
   * +240 en Venezuela (UTC-4), -120 en España (UTC+2).
   */
  getLocalHourForVETClose() {
    const localOffsetHours = -new Date().getTimezoneOffset() / 60;
    const hour = (21 + localOffsetHours) % 24;
    return Math.floor(hour);
  }

  async scheduleDailyReminder() {
    if (!this.isNative || !this.enabled) return null;

    const granted = await this.hasPermission();
    if (!granted) {
      const grantedAfterPrompt = await this.requestPermission();
      if (!grantedAfterPrompt) return null;
    }

    const hour = this.getLocalHourForVETClose();
    try {
      await LocalNotifications.cancel({ notifications: [{ id: this.DAILY_NOTIFICATION_ID }] });
      await LocalNotifications.schedule({
        notifications: [{
          id: this.DAILY_NOTIFICATION_ID,
          title: 'Hora del BCV · Tasa del día',
          body: 'El Banco Central publica la tasa oficial (Fecha Valor). Abre Dolarfy para verla.',
          schedule: {
            on: { hour, minute: 5 },
            allowWhileIdle: true
          },
          channelId: this.CHANNEL_ID,
          smallIcon: 'ic_stat_dollar',
          iconColor: '#06B6D4',
          sound: 'default'
        }]
      });
    } catch (e) {
      console.warn('Error programando recordatorio diario:', e);
    }
    return null;
  }

  async cancelDailyReminder() {
    if (!this.isNative) return;
    try {
      await LocalNotifications.cancel({ notifications: [{ id: this.DAILY_NOTIFICATION_ID }] });
    } catch (e) {
      console.warn('Error cancelando recordatorio diario:', e);
    }
  }

  async sendLocalNotification(entry) {
    if (!this.isNative || !this.enabled) return;

    const granted = await this.hasPermission();
    if (!granted) {
      const grantedAfterPrompt = await this.requestPermission();
      if (!grantedAfterPrompt) return;
    }

    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: entry.id,
          title: 'Nueva Tasa del Día',
          body: `${entry.rateName}: ${entry.formattedValue}`,
          channelId: this.CHANNEL_ID,
          smallIcon: 'ic_stat_dollar',
          iconColor: '#06B6D4',
          sound: 'default'
        }]
      });
    } catch (e) {
      console.warn('Error enviando notificación local:', e);
    }
  }

  // ==========================================================================
  //  Toggle
  // ==========================================================================

  async toggleNotifications(forceState = null) {
    this.enabled = forceState !== null ? forceState : !this.enabled;
    this._storageSet(this.STORAGE_ENABLED, this.enabled.toString());

    if (this.enabled) {
      await this.scheduleDailyReminder();
    } else {
      await this.cancelDailyReminder();
    }
    return this.enabled;
  }

  // ==========================================================================
  //  Detección de nueva tasa diaria
  // ==========================================================================

  async checkDailyUpdate(country, rates) {
    if (!this.enabled || !rates) return;

    const rateKeys = Object.keys(rates);
    if (rateKeys.length === 0) return;

    const mainRate = rates[country.defaultRateId] || rates[rateKeys[0]];
    if (!mainRate || !mainRate.value) return;

    // Con tasa activa de "predicción" si está publicada, sino hoy
    const notifiedValue = (mainRate.nextDay && mainRate.nextDay.value)
      ? mainRate.nextDay.value
      : mainRate.value;

    const todayStr = this.getTodayString();
    const lastKey = `${country.id}_${todayStr}_${notifiedValue.toFixed(2)}`;

    // Si ya notificamos esta misma tasa para la fecha de hoy, omitir
    if (this.lastNotifiedDate === lastKey) return;

    this.lastNotifiedDate = lastKey;
    this._storageSet(this.STORAGE_LAST_DATE, lastKey);

    const logEntry = {
      id: Date.now(),
      countryId: country.id,
      countryName: country.name,
      flagUrl: country.flagUrl,
      rateName: mainRate.name,
      value: notifiedValue,
      currency: mainRate.currency,
      formattedValue: formatCurrency(notifiedValue, mainRate.currency, notifiedValue < 10 ? 4 : 2),
      time: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true }),
      date: new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })
    };

    this.logs.unshift(logEntry);
    this.saveLogs();

    // Notificación real del sistema (nativo) + toast in-app (siempre)
    await this.sendLocalNotification(logEntry);
    this.showToast(logEntry);
  }

  // ==========================================================================
  //  Toast in-app (fallback / navegador)
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