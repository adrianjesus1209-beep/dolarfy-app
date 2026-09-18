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
              <div class="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <i data-lucide="bell" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="text-base font-extrabold text-white leading-tight">Centro de Alertas</h3>
                <p class="text-[10px] text-cyan-400 font-semibold">Notificaciones Financieras en Tiempo Real</p>
              </div>
            </div>
            <button id="close-notif-modal-btn" type="button" class="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white transition-all active:scale-95 cursor-pointer">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <!-- Content Body -->
          <div class="p-4 overflow-y-auto space-y-4 max-h-[70vh] custom-scroll">
            
            <!-- Toggle Switch Card -->
            <div class="glass-card rounded-2xl p-4 flex items-center justify-between border border-cyan-500/30 bg-gradient-to-r from-cyan-950/20 to-blue-950/20">
              <div class="pr-3">
                <h4 class="text-xs font-extrabold text-white flex items-center gap-1.5">
                  <span>Alertas Automáticas de Tasa</span>
                  ${isEnabled ? `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>` : ''}
                </h4>
                <p class="text-[11px] text-gray-400 mt-1 leading-snug">
                  Recibe avisos inmediatos en tu dispositivo apenas el BCV o Binance actualicen sus tasas oficiales.
                </p>
              </div>

              <button id="toggle-notif-switch" type="button" class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isEnabled ? 'bg-cyan-500' : 'bg-gray-700'}">
                <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isEnabled ? 'translate-x-5' : 'translate-x-0'}"></span>
              </button>
            </div>

            <!-- Action Bar Buttons (Test & Clear) -->
            <div class="grid grid-cols-2 gap-2">
              <button id="test-notif-btn" type="button" class="py-2.5 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-bold transition-all flex items-center justify-center space-x-1.5 active:scale-95 cursor-pointer">
                <i data-lucide="send" class="w-3.5 h-3.5"></i>
                <span>Probar Notificación</span>
              </button>

              <button id="clear-notif-btn" type="button" class="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-red-400 text-xs font-bold transition-all flex items-center justify-center space-x-1.5 active:scale-95 cursor-pointer">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                <span>Limpiar Historial</span>
              </button>
            </div>

            <!-- Current Country Info Tip -->
            <div class="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center space-x-3 text-xs">
              <img src="${currentCountry.flagUrl}" alt="${currentCountry.name}" class="w-6 h-6 rounded-full object-cover border border-cyan-500/30">
              <div>
                <p class="font-bold text-gray-200">País Activo: ${currentCountry.name}</p>
                <p class="text-[10px] text-gray-400">Monitoreando aperturas y cierres bancarios del BCV.</p>
              </div>
            </div>

            <!-- Log History Section -->
            <div>
              <div class="flex justify-between items-center mb-3">
                <h4 class="text-xs font-bold uppercase tracking-wider text-gray-400">Historial Reciente</h4>
                <span class="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">${logs.length} registros</span>
              </div>

              ${logs.length === 0 ? `
                <div class="text-center py-8 bg-black/20 rounded-2xl border border-white/5 space-y-2">
                  <i data-lucide="bell-off" class="w-8 h-8 text-gray-600 mx-auto"></i>
                  <p class="text-xs text-gray-400 font-semibold">Sin alertas registradas aún</p>
                  <p class="text-[10px] text-gray-500 max-w-xs mx-auto">
                    Presiona "Probar Notificación" arriba para ver una simulación en vivo o espera a la próxima actualización del mercado.
                  </p>
                </div>
              ` : `
                <div class="space-y-2">
                  ${logs.map(log => `
                    <div class="glass-card rounded-xl p-3 flex items-center justify-between border border-white/10 hover:border-cyan-500/30 transition-all">
                      <div class="flex items-center space-x-3">
                        <img src="${log.flagUrl}" alt="${log.countryName}" class="w-6 h-6 rounded-full object-cover border border-white/10">
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
    toggleSwitch?.addEventListener('click', async () => {
      await notificationService.toggleNotifications();
      this.render();
      if (window.lucide) window.lucide.createIcons();

      const event = new CustomEvent('dolarfy:notification_toggled');
      document.dispatchEvent(event);
    });

    const testBtn = document.getElementById('test-notif-btn');
    testBtn?.addEventListener('click', async () => {
      await notificationService.sendTestNotification();
      this.render();
      if (window.lucide) window.lucide.createIcons();

      const event = new CustomEvent('dolarfy:notification_toggled');
      document.dispatchEvent(event);
    });

    const clearBtn = document.getElementById('clear-notif-btn');
    clearBtn?.addEventListener('click', () => {
      notificationService.clearLogs();
      this.render();
      if (window.lucide) window.lucide.createIcons();

      const event = new CustomEvent('dolarfy:notification_toggled');
      document.dispatchEvent(event);
    });
  }
}
