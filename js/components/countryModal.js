import { mockEngine } from '../mockData.js';

export class CountryModal {
  constructor() {
    this.modalEl = null;
  }

  init() {
    let container = document.getElementById('country-modal-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'country-modal-container';
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
    const countries = [
      { id: 'VE', name: 'Venezuela', code: 'VES', flag: 'https://flagcdn.com/w40/ve.png', active: true, desc: 'BCV Oficial + Binance P2P En Vivo' },
      { id: 'CO', name: 'Colombia', code: 'COP', flag: 'https://flagcdn.com/w40/co.png', active: false, desc: 'TRM Oficial + Mercado Paralelo' },
      { id: 'AR', name: 'Argentina', code: 'ARS', flag: 'https://flagcdn.com/w40/ar.png', active: false, desc: 'Dólar Oficial, Blue & Cripto' },
      { id: 'MX', name: 'México', code: 'MXN', flag: 'https://flagcdn.com/w40/mx.png', active: false, desc: 'Banxico Oficial & Interbancario' },
      { id: 'PE', name: 'Perú', code: 'PEN', flag: 'https://flagcdn.com/w40/pe.png', active: false, desc: 'SUNAT & Mercado Paralelo' },
      { id: 'CL', name: 'Chile', code: 'CLP', flag: 'https://flagcdn.com/w40/cl.png', active: false, desc: 'Dólar Observado & Mercado' },
      { id: 'DO', name: 'Rep. Dominicana', code: 'DOP', flag: 'https://flagcdn.com/w40/do.png', active: false, desc: 'Banco Central & Mercado' }
    ];

    this.modalEl.innerHTML = `
      <div id="country-modal-backdrop" class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 animate-fade-in">
        <div class="w-full max-w-md bg-[#0F141C] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
          
          <!-- Header -->
          <div class="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
            <div class="flex items-center space-x-2">
              <i data-lucide="globe" class="w-5 h-5 text-cyan-400"></i>
              <h3 class="text-base font-extrabold text-white">Seleccionar País</h3>
            </div>
            <button id="close-country-modal-btn" type="button" class="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white transition-all active:scale-95 cursor-pointer">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <!-- Body -->
          <div class="p-4 overflow-y-auto space-y-3 custom-scroll">
            <div class="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-3 flex items-start space-x-3 text-xs">
              <i data-lucide="info" class="w-4 h-4 text-cyan-400 shrink-0 mt-0.5"></i>
              <p class="text-gray-300 text-[11px] leading-relaxed">
                Actualmente Dolarfy monitorea las tasas oficiales y de mercado para <strong class="text-cyan-300">Venezuela 🇻🇪</strong>. Pronto activaremos más países de la región.
              </p>
            </div>

            <div class="space-y-2 pt-1">
              ${countries.map(c => `
                <div class="glass-card rounded-2xl p-3.5 flex items-center justify-between transition-all border ${c.active ? 'border-cyan-500/50 bg-cyan-500/10 shadow-sm' : 'border-white/5 opacity-60'}">
                  <div class="flex items-center space-x-3">
                    <img src="${c.flag}" alt="${c.name}" class="w-7 h-7 rounded-full object-cover border border-white/10 shadow">
                    <div>
                      <h4 class="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>${c.name}</span>
                        <span class="text-[10px] text-cyan-400 font-extrabold">(${c.code})</span>
                      </h4>
                      <p class="text-[10px] text-gray-400 mt-0.5">${c.desc}</p>
                    </div>
                  </div>

                  <div>
                    ${c.active ? `
                      <span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <i data-lucide="check" class="w-3 h-3 text-emerald-400"></i> Activo
                      </span>
                    ` : `
                      <span class="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">
                        Próximamente
                      </span>
                    `}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    const backdrop = document.getElementById('country-modal-backdrop');
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    const closeBtn = document.getElementById('close-country-modal-btn');
    closeBtn?.addEventListener('click', () => this.close());
  }
}

export const countryModal = new CountryModal();
