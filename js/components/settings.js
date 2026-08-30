import { mockEngine } from '../mockData.js';
import { notificationService } from '../notificationService.js';
import { calcHistoryService } from '../calcHistoryService.js';

export class SettingsView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render() {
    const countries = mockEngine.getCountries();
    const defaultCountryId = mockEngine.getDefaultCountryId();
    const isNotifEnabled = notificationService.isEnabled();

    this.container.innerHTML = `
      <div class="space-y-4 pb-24 animate-fade-in max-w-md mx-auto">
        
        <!-- Header de Ajustes -->
        <div class="flex items-center space-x-2">
          <div class="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <i data-lucide="settings" class="w-5 h-5"></i>
          </div>
          <div>
            <h2 class="text-lg font-extrabold text-white leading-tight">Ajustes y Preferencias</h2>
            <p class="text-xs text-gray-400 mt-0.5">Configuración general de Dolarfy Mobile</p>
          </div>
        </div>

        <!-- 1. Sección: Preferencias Principales -->
        <div class="space-y-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Preferencias del Sistema</h3>

          <!-- País Predeterminado -->
          <div class="glass-card rounded-2xl p-3.5 flex items-center justify-between border border-white/10">
            <div class="flex items-center space-x-3">
              <div class="p-2 rounded-xl bg-white/5 text-cyan-400">
                <i data-lucide="globe" class="w-4 h-4"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-gray-100">País Predeterminado</h4>
                <p class="text-[10px] text-gray-400">Se seleccionará automáticamente al abrir la app.</p>
              </div>
            </div>

            <select id="settings-default-country-select" class="bg-black/60 border border-cyan-500/30 rounded-xl px-2.5 py-1.5 text-xs font-bold text-cyan-300 outline-none cursor-pointer max-w-[120px]">
              ${countries.map(c => `
                <option value="${c.id}" class="bg-[#0F141C] text-white" ${c.id === defaultCountryId ? 'selected' : ''}>
                  ${c.name}
                </option>
              `).join('')}
            </select>
          </div>

          <!-- Alertas de Tasa Diaria -->
          <div class="glass-card rounded-2xl p-3.5 flex items-center justify-between border border-white/10">
            <div class="flex items-center space-x-3">
              <div class="p-2 rounded-xl bg-white/5 text-emerald-400">
                <i data-lucide="bell" class="w-4 h-4"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-gray-100">Alertas de Tasa Diaria</h4>
                <p class="text-[10px] text-gray-400">Notificar al emitirse la nueva tasa del Banco Central.</p>
              </div>
            </div>

            <button id="settings-notif-toggle" type="button" class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isNotifEnabled ? 'bg-cyan-500' : 'bg-gray-700'}">
              <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isNotifEnabled ? 'translate-x-5' : 'translate-x-0'}"></span>
            </button>
          </div>
        </div>

        <!-- 2. Sección: Almacenamiento y Datos -->
        <div class="space-y-2 pt-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Gestión de Datos</h3>

          <div class="glass-card rounded-2xl p-3.5 flex items-center justify-between border border-white/10">
            <div class="flex items-center space-x-3">
              <div class="p-2 rounded-xl bg-white/5 text-amber-400">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-gray-100">Historial de Conversiones</h4>
                <p class="text-[10px] text-gray-400">Eliminar registros guardados de la calculadora.</p>
              </div>
            </div>

            <button id="settings-clear-history-btn" type="button" class="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold transition-all active:scale-95">
              Limpiar
            </button>
          </div>
        </div>

        <!-- 3. Sección: Información de la Aplicación -->
        <div class="space-y-2 pt-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Información del Sistema</h3>

          <div class="glass-card rounded-2xl p-4 space-y-3 border border-white/10">
            <div class="flex items-center justify-between border-b border-white/5 pb-2.5">
              <span class="text-xs font-semibold text-gray-300">Versión</span>
              <span class="text-xs font-extrabold text-cyan-400">1.2.0 (Mobile Edition)</span>
            </div>

            <div class="flex items-center justify-between border-b border-white/5 pb-2.5">
              <span class="text-xs font-semibold text-gray-300">Estado de APIs Bancarias</span>
              <span class="text-xs font-bold text-emerald-400 flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Conectado
              </span>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-gray-300">Desarrollo</span>
              <span class="text-xs font-bold text-gray-400">Google DeepMind Pair Engine</span>
            </div>
          </div>
        </div>

      </div>
    `;

    this.attachEvents();
    if (window.lucide) window.lucide.createIcons();
  }

  attachEvents() {
    const countrySelect = document.getElementById('settings-default-country-select');
    const notifToggle = document.getElementById('settings-notif-toggle');
    const clearHistoryBtn = document.getElementById('settings-clear-history-btn');

    countrySelect?.addEventListener('change', (e) => {
      mockEngine.setDefaultCountry(e.target.value);
    });

    notifToggle?.addEventListener('click', () => {
      notificationService.toggleNotifications();
      this.render();
      document.dispatchEvent(new CustomEvent('dolarfy:notification_toggled'));
    });

    clearHistoryBtn?.addEventListener('click', () => {
      calcHistoryService.clearHistory();
      clearHistoryBtn.textContent = '¡Limpiado!';
      clearHistoryBtn.className = 'px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold transition-all';
      setTimeout(() => {
        clearHistoryBtn.textContent = 'Limpiar';
        clearHistoryBtn.className = 'px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold transition-all active:scale-95';
      }, 2000);
    });
  }

  destroy() {}
}
