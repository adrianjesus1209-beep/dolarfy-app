import { APP_VERSION } from '../constants.js';

export class AboutModal {
  constructor() {
    this.modalEl = null;
  }

  init() {
    let container = document.getElementById('about-modal-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'about-modal-container';
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
    this.modalEl.innerHTML = `
      <div id="about-modal-backdrop" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
        <div class="w-full max-w-sm bg-[#111622] border border-cyan-500/20 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-up">
          
          <!-- Header -->
          <div class="p-5 pb-3">
            <h3 class="text-xl font-extrabold text-white tracking-tight">Acerca de la app</h3>
          </div>

          <!-- Content -->
          <div class="px-5 space-y-4 text-xs">
            
            <!-- Desarrollador -->
            <div class="flex items-start space-x-3.5 border-b border-white/5 pb-3.5">
              <div class="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
                <i data-lucide="code-2" class="w-4 h-4"></i>
              </div>
              <div>
                <span class="text-[11px] font-semibold text-gray-400 block">Desarrollador</span>
                <span class="text-sm font-extrabold text-white block mt-0.5">Adrian Bello</span>
              </div>
            </div>

            <!-- Fuente de datos -->
            <div class="flex items-start space-x-3.5 border-b border-white/5 pb-3.5">
              <div class="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
                <i data-lucide="layers" class="w-4 h-4"></i>
              </div>
              <div>
                <span class="text-[11px] font-semibold text-gray-400 block">Fuente de datos</span>
                <a href="https://www.bcv.org.ve" target="_blank" rel="noopener noreferrer" class="text-xs font-extrabold text-cyan-400 hover:underline flex items-center gap-1 mt-0.5">
                  <span>Tasa oficial BCV</span>
                  <i data-lucide="external-link" class="w-3 h-3"></i>
                </a>
              </div>
            </div>

            <!-- Política de privacidad -->
            <div class="flex items-start space-x-3.5 border-b border-white/5 pb-3.5">
              <div class="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
                <i data-lucide="shield-check" class="w-4 h-4"></i>
              </div>
              <div>
                <span class="text-[11px] font-semibold text-gray-400 block">Política de privacidad</span>
                <button id="about-privacy-btn" type="button" class="text-xs font-extrabold text-cyan-400 hover:underline mt-0.5 cursor-pointer">
                  Ver
                </button>
              </div>
            </div>

            <!-- Aviso legal -->
            <div class="space-y-1.5 bg-black/40 p-3.5 rounded-2xl border border-white/5">
              <h4 class="text-xs font-extrabold text-white">Aviso legal:</h4>
              <p class="text-[10px] text-gray-400 leading-relaxed">
                Esta aplicación NO representa a ninguna entidad gubernamental ni bancaria. No tenemos afiliación con el Banco Central de Venezuela. Los datos son obtenidos a través de una API que consulta la página oficial del BCV. El uso de la información es responsabilidad exclusiva del usuario.
              </p>
            </div>

            <!-- Licencias de código abierto -->
            <div class="text-center pt-1">
              <button id="about-open-source-btn" type="button" class="text-xs font-extrabold text-emerald-400 hover:underline flex items-center justify-center gap-1.5 mx-auto cursor-pointer">
                <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
                <span>Licencias de código abierto</span>
              </button>
              <p class="text-[10px] text-gray-500 font-semibold mt-2">Versión ${APP_VERSION}</p>
            </div>

          </div>

          <!-- Footer / Actions -->
          <div class="p-4 pt-2 text-right">
            <button id="close-about-modal-btn" type="button" class="text-xs font-extrabold text-cyan-400 hover:text-cyan-300 px-4 py-2 rounded-xl transition-all cursor-pointer active:scale-95">
              Cerrar
            </button>
          </div>

        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    const backdrop = document.getElementById('about-modal-backdrop');
    const closeBtn = document.getElementById('close-about-modal-btn');
    const privacyBtn = document.getElementById('about-privacy-btn');
    const openSourceBtn = document.getElementById('about-open-source-btn');

    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    closeBtn?.addEventListener('click', () => this.close());

    privacyBtn?.addEventListener('click', () => {
      alert('🛡️ Política de Privacidad Dolarfy\n\nDolarfy no recopila, vende ni comparte datos personales de sus usuarios. Toda la configuración e historial se almacenan de forma local en tu dispositivo.');
    });

    openSourceBtn?.addEventListener('click', () => {
      alert('📄 Licencias de Código Abierto\n\nDolarfy hace uso de librerías de código abierto incluyendo Lucide Icons, ApexCharts, TailwindCSS y bibliotecas de utilidades bajo licencia MIT.');
    });
  }
}

export const aboutModal = new AboutModal();
