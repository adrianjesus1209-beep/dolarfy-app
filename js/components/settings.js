import { notificationService } from '../notificationService.js';
import { themeService } from '../themeService.js';
import { mockEngine } from '../mockData.js';
import { APP_VERSION } from '../constants.js';

export class SettingsView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.unsubscribe = null;
  }

  isNextDayDefault() {
    return localStorage.getItem('dolarfy_next_day_default') === 'true';
  }

  toggleNextDayDefault() {
    const val = !this.isNextDayDefault();
    localStorage.setItem('dolarfy_next_day_default', String(val));
    return val;
  }

  render() {
    const isNotifEnabled = notificationService.isEnabled();
    const isNextDayDef = this.isNextDayDefault();

    this.container.innerHTML = `
      <div class="space-y-4 pb-24 animate-fade-in max-w-md mx-auto">
        
        <!-- Header de Ajustes -->
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-extrabold text-white tracking-tight">Ajustes</h2>
            <p class="text-xs text-gray-400 mt-0.5">Configura tu experiencia en Dolarfy</p>
          </div>
          <div class="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <i data-lucide="sliders" class="w-5 h-5"></i>
          </div>
        </div>

        <!-- Tarjeta Promocional: ¡Conviértete en usuario PRO! -->
        <div class="glass-card rounded-3xl p-5 border border-cyan-500/30 shadow-2xl relative overflow-hidden bg-gradient-to-br from-cyan-950/40 via-slate-900/90 to-cyan-900/20">
          <div class="absolute -right-6 -bottom-6 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none"></div>

          <div class="flex items-center space-x-3 mb-3">
            <div class="p-2.5 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 shadow-md">
              <i data-lucide="star" class="w-6 h-6 fill-cyan-400/20"></i>
            </div>
            <div>
              <h3 class="text-base font-extrabold text-white">¡Conviértete en usuario PRO!</h3>
              <p class="text-[11px] text-cyan-300/80 font-medium">Disfruta la versión definitiva de Dolarfy</p>
            </div>
          </div>

          <ul class="space-y-2 mb-4 text-xs text-gray-300">
            <li class="flex items-start space-x-2.5">
              <div class="p-1 rounded-lg bg-emerald-500/10 text-emerald-400 mt-0.5 shrink-0">
                <i data-lucide="ban" class="w-3.5 h-3.5"></i>
              </div>
              <div>
                <span class="font-bold text-white">Adiós a la publicidad:</span>
                <span class="text-gray-400"> Disfruta de una interfaz limpia y sin interrupciones.</span>
              </div>
            </li>
            <li class="flex items-start space-x-2.5">
              <div class="p-1 rounded-lg bg-cyan-500/10 text-cyan-400 mt-0.5 shrink-0">
                <i data-lucide="zap" class="w-3.5 h-3.5"></i>
              </div>
              <div>
                <span class="font-bold text-white">Máxima velocidad:</span>
                <span class="text-gray-400"> Navegación más fluida.</span>
              </div>
            </li>
            <li class="flex items-start space-x-2.5">
              <div class="p-1 rounded-lg bg-rose-500/10 text-rose-400 mt-0.5 shrink-0">
                <i data-lucide="heart" class="w-3.5 h-3.5 fill-rose-400/20"></i>
              </div>
              <div>
                <span class="font-bold text-white">Apoya el proyecto:</span>
                <span class="text-gray-400"> Ayúdanos a seguir mejorando la herramienta.</span>
              </div>
            </li>
          </ul>

          <button id="settings-pro-btn" type="button" class="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 flex items-center justify-center space-x-2 transition-all active:scale-[0.98] cursor-pointer">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
            <span>Obtener PRO - USD 1,99</span>
          </button>
        </div>

        <!-- Sección General -->
        <div class="space-y-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">General</h3>

          <!-- Notificaciones -->
          <div class="glass-card rounded-2xl p-4 flex items-center justify-between border border-white/10 hover:border-cyan-500/30 transition-all">
            <div class="flex items-center space-x-3.5 pr-2">
              <div class="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <i data-lucide="bell" class="w-5 h-5"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-white">Notificaciones</h4>
                <p class="text-[10px] text-gray-400 mt-0.5">Avisar cuando salga nueva tasa</p>
              </div>
            </div>

            <button id="settings-notif-toggle" type="button" class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isNotifEnabled ? 'bg-cyan-500' : 'bg-gray-700'}">
              <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isNotifEnabled ? 'translate-x-5' : 'translate-x-0'}"></span>
            </button>
          </div>

          <!-- Siguiente tasa por defecto -->
          <div class="glass-card rounded-2xl p-4 flex items-center justify-between border border-white/10 hover:border-cyan-500/30 transition-all">
            <div class="flex items-center space-x-3.5 pr-2">
              <div class="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <i data-lucide="trending-up" class="w-5 h-5"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-white">Siguiente tasa por defecto</h4>
                <p class="text-[10px] text-gray-400 mt-0.5 leading-snug">Usar la tasa de mañana/siguiente día automáticamente cuando esté disponible.</p>
              </div>
            </div>

            <button id="settings-nextday-toggle" type="button" class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isNextDayDef ? 'bg-cyan-500' : 'bg-gray-700'}">
              <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isNextDayDef ? 'translate-x-5' : 'translate-x-0'}"></span>
            </button>
          </div>

          <!-- Idioma -->
          <button id="settings-language-btn" type="button" class="w-full glass-card rounded-2xl p-4 flex items-center justify-between border border-white/10 hover:border-cyan-500/30 transition-all text-left cursor-pointer group">
            <div class="flex items-center space-x-3.5">
              <div class="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 group-hover:bg-cyan-500/20 transition-all">
                <i data-lucide="globe" class="w-5 h-5"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-white">Idioma</h4>
                <p class="text-[10px] text-gray-400 mt-0.5">Predeterminado del sistema</p>
              </div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-all"></i>
          </button>
        </div>

        <!-- Sección Información -->
        <div class="space-y-2 pt-1">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Información</h3>

          <!-- Compartir app -->
          <button id="settings-share-btn" type="button" class="w-full glass-card rounded-2xl p-4 flex items-center justify-between border border-white/10 hover:border-cyan-500/30 transition-all text-left cursor-pointer group">
            <div class="flex items-center space-x-3.5">
              <div class="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 group-hover:bg-cyan-500/20 transition-all">
                <i data-lucide="share-2" class="w-5 h-5"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-white">Compartir app</h4>
                <p class="text-[10px] text-gray-400 mt-0.5">Recomienda esta aplicación a tus amigos</p>
              </div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-all"></i>
          </button>

          <!-- Calificar app -->
          <button id="settings-rate-btn" type="button" class="w-full glass-card rounded-2xl p-4 flex items-center justify-between border border-white/10 hover:border-cyan-500/30 transition-all text-left cursor-pointer group">
            <div class="flex items-center space-x-3.5">
              <div class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 group-hover:bg-amber-500/20 transition-all">
                <i data-lucide="star" class="w-5 h-5"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-white">Calificar app</h4>
                <p class="text-[10px] text-gray-400 mt-0.5">Apoya este proyecto con 5 estrellas</p>
              </div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-all"></i>
          </button>

          <!-- Acerca de la app -->
          <button id="settings-about-btn" type="button" class="w-full glass-card rounded-2xl p-4 flex items-center justify-between border border-white/10 hover:border-cyan-500/30 transition-all text-left cursor-pointer group">
            <div class="flex items-center space-x-3.5">
              <div class="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 group-hover:bg-cyan-500/20 transition-all">
                <i data-lucide="info" class="w-5 h-5"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-white">Acerca de la app</h4>
                <p class="text-[10px] text-gray-400 mt-0.5">Versión, desarrollador y licencias</p>
              </div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-all"></i>
          </button>
        </div>

      </div>
    `;

    this.attachEvents();
    this.subscribeToUpdates();
    if (window.lucide) window.lucide.createIcons();
  }

  subscribeToUpdates() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = mockEngine.subscribe((rates, updatedId, action) => {
      if (action === 'rates_refreshed') {
        this.render();
      }
    });
  }

  attachEvents() {
    const notifToggle = document.getElementById('settings-notif-toggle');
    const nextdayToggle = document.getElementById('settings-nextday-toggle');
    const proBtn = document.getElementById('settings-pro-btn');
    const langBtn = document.getElementById('settings-language-btn');
    const shareBtn = document.getElementById('settings-share-btn');
    const rateBtn = document.getElementById('settings-rate-btn');
    const aboutBtn = document.getElementById('settings-about-btn');

    notifToggle?.addEventListener('click', async () => {
      await notificationService.toggleNotifications();
      this.render();
      document.dispatchEvent(new CustomEvent('dolarfy:notification_toggled'));
    });

    nextdayToggle?.addEventListener('click', () => {
      this.toggleNextDayDefault();
      this.render();
    });

    proBtn?.addEventListener('click', () => {
      alert('🌟 Dolarfy PRO\n\nPróximamente disponible la suscripción PRO en tiendas oficiales.');
    });

    langBtn?.addEventListener('click', () => {
      alert('🌐 Idioma de la Aplicación\n\nActualmente configurado en Español (Predeterminado del sistema).');
    });

    shareBtn?.addEventListener('click', async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Dolarfy - Cotizaciones en tiempo real',
            text: 'Calcula y consulta las tasas de cambio de Venezuela en tiempo real con Dolarfy.',
            url: window.location.href
          });
        } catch (e) {
          console.warn('Share cancelled or error:', e);
        }
      } else {
        try {
          await navigator.clipboard.writeText(window.location.href);
          alert('¡Enlace de Dolarfy copiado al portapapeles!');
        } catch {
          alert('Comparte Dolarfy desde la URL: ' + window.location.href);
        }
      }
    });

    rateBtn?.addEventListener('click', () => {
      alert('⭐ ¡Muchas gracias por tu apoyo!\n\nTu calificación nos ayuda a seguir mejorando Dolarfy.');
    });

    aboutBtn?.addEventListener('click', () => {
      alert(`ℹ️ Acerca de Dolarfy\n\nVersión: ${APP_VERSION}\nDesarrollador: Adrian Bello\nEstado de servicios: Conectado en tiempo real`);
    });
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
