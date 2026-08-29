import { notificationService } from '../notificationService.js';
import { mockEngine } from '../mockData.js';

export class NotificationModal {
  constructor() {
    this.modalEl = null;
  }

  init() {
    let container = document.getElementById('notification-modal-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-modal-container';
      document.body.appendChild(container);
    }
    this.modalEl = container;
  }

  open() {
    this.init();
    this.render();
    if (window.lucide) window.lucide.createIcons();
  }

  close() {
    if (this.modalEl) {
      this.modalEl.innerHTML = '';
    }
  }

  render() {
    const isEnabled = notificationService.isEnabled();
    const logs = notificationService.getLogs();
    const currentCountry = mockEngine.getCurrentCountry();

    this.modalEl.innerHTML = `
      <div id="notification-modal-backdrop" class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 animate-fade-in">
        <div class="w-full max-w-md bg-[#0F141C] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
          
          <!-- Modal Header -->
          <div class="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
            <div class="flex items-center space-x-2">
              <i data-lucide="bell" class="w-5 h-5 text-cyan-400"></i>
              <h3 class="text-base font-extrabold text-white">Alertas de Tasa Diaria</h3>
            </div>
            <button id="close-notif-modal-btn" type="button" class="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white transition-all active:scale-95">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <!-- Content Body -->
          <div class="p-4 overflow-y-auto space-y-4 max-h-[70vh] custom-scroll">
            
            <!-- Toggle Switch Card -->
            <div class="glass-card rounded-2xl p-4 flex items-center justify-between border border-cyan-500/30">
              <div class="pr-3">
                <h4 class="text-xs font-extrabold text-white flex items-center gap-1.5">
                  <span>Notificar Tasa del Día</span>
                  ${isEnabled ? `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>` : ''}
                </h4>
                <p class="text-[11px] text-gray-400 mt-1 leading-snug">
                  Te avisará automáticamente apenas cambie la tasa oficial del día sin necesidad de adivinar la hora.
                </p>
              </div>

              <button id="toggle-notif-switch" type="button" class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isEnabled ? 'bg-cyan-500' : 'bg-gray-700'}">
                <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isEnabled ? 'translate-x-5' : 'translate-x-0'}"></span>
              </button>
            </div>

            <!-- Current Country Info Tip -->
            <div class="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center space-x-3 text-xs">
              <img src="${currentCountry.flagUrl}" alt="${currentCountry.name}" class="w-6 h-6 rounded-full object-cover">
              <div>
                <p class="font-bold text-gray-200">Monitoreando: ${currentCountry.name}</p>
                <p class="text-[10px] text-gray-400">Recibirás alertas cuando el Banco Central publica la tasa oficial.</p>
              </div>
            </div>

            <!-- Log History Section -->
            <div>
              <div class="flex justify-between items-center mb-3">
                <h4 class="text-xs font-bold uppercase tracking-wider text-gray-400">Historial de Alertas</h4>
                <span class="text-[10px] text-gray-500">${logs.length} registros</span>
              </div>

              ${logs.length === 0 ? `
                <div class="text-center py-8 bg-black/20 rounded-2xl border border-white/5 space-y-2">
                  <i data-lucide="bell-off" class="w-8 h-8 text-gray-600 mx-auto"></i>
                  <p class="text-xs text-gray-400 font-semibold">Sin alertas recientes</p>
                  <p class="text-[10px] text-gray-500 max-w-xs mx-auto">
                    Tan pronto como la API detecte una actualización en la tasa del día, aparecerá aquí.
                  </p>
                </div>
              ` : `
                <div class="space-y-2">
                  ${logs.map(log => `
                    <div class="glass-card rounded-xl p-3 flex items-center justify-between border border-white/5">
                      <div class="flex items-center space-x-3">
                        <img src="${log.flagUrl}" alt="${log.countryName}" class="w-6 h-6 rounded-full object-cover">
                        <div>
                          <h5 class="text-xs font-bold text-white">${log.rateName}</h5>
                          <p class="text-[10px] text-gray-400">${log.date} a las ${log.time}</p>
                        </div>
                      </div>
                      <span class="text-sm font-extrabold text-emerald-400">${log.formattedValue}</span>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

          </div>

        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    const backdrop = document.getElementById('notification-modal-backdrop');
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    const closeBtn = document.getElementById('close-notif-modal-btn');
    closeBtn?.addEventListener('click', () => this.close());

    const toggleSwitch = document.getElementById('toggle-notif-switch');
    toggleSwitch?.addEventListener('click', () => {
      notificationService.toggleNotifications();
      this.render();
      if (window.lucide) window.lucide.createIcons();

      // Notificar a la app para actualizar el icono de la campana en el header
      const event = new CustomEvent('dolarfy:notification_toggled');
      document.dispatchEvent(event);
    });
  }
}
