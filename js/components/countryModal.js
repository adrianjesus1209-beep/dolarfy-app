import { mockEngine } from '../mockData.js';

export class CountryModal {
  constructor(onSelectCallback) {
    this.onSelectCallback = onSelectCallback;
    this.modalEl = null;
    this.searchQuery = '';
    this.activeFilter = 'all'; // 'all', 'latam', 'exterior'
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
    this.searchQuery = '';
    this.activeFilter = 'all';
    this.render();
    if (window.lucide) window.lucide.createIcons();
  }

  close() {
    if (this.modalEl) {
      this.modalEl.innerHTML = '';
    }
  }

  render() {
    const countries = mockEngine.getCountries();
    const currentCountry = mockEngine.getCurrentCountry();
    const defaultCountryId = mockEngine.getDefaultCountryId();

    const filteredCountries = countries.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                            c.currency.code.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                            c.currency.name.toLowerCase().includes(this.searchQuery.toLowerCase());
      const matchesFilter = this.activeFilter === 'all' || c.region === this.activeFilter;
      return matchesSearch && matchesFilter;
    });

    const latamCountries = filteredCountries.filter(c => c.region === 'latam');
    const exteriorCountries = filteredCountries.filter(c => c.region === 'exterior');

    this.modalEl.innerHTML = `
      <div id="country-modal-backdrop" class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 animate-fade-in">
        <div class="w-full max-w-md bg-[#0F141C] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
          
          <!-- Modal Header -->
          <div class="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
            <div class="flex items-center space-x-2">
              <i data-lucide="globe" class="w-5 h-5 text-cyan-400"></i>
              <h3 class="text-base font-extrabold text-white">Seleccionar País</h3>
            </div>
            <button id="close-modal-btn" type="button" class="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white transition-all active:scale-95">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <!-- Buscador Input -->
          <div class="p-4 border-b border-white/5 space-y-3">
            <div class="relative">
              <i data-lucide="search" class="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
              <input type="text" id="country-search-input" value="${this.searchQuery}" placeholder="Buscar país o moneda..." 
                class="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-all" />
              ${this.searchQuery ? `
                <button id="clear-search-btn" type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs">
                  ✕
                </button>
              ` : ''}
            </div>

            <!-- Filter Tabs -->
            <div class="flex space-x-2">
              <button type="button" data-filter="all" class="filter-tab-btn flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${this.activeFilter === 'all' ? 'bg-cyan-500/20 border border-cyan-500 text-cyan-300' : 'bg-white/5 text-gray-400 border border-white/5'}">
                Todos (${countries.length})
              </button>
              <button type="button" data-filter="latam" class="filter-tab-btn flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${this.activeFilter === 'latam' ? 'bg-cyan-500/20 border border-cyan-500 text-cyan-300' : 'bg-white/5 text-gray-400 border border-white/5'}">
                América Latina
              </button>
              <button type="button" data-filter="exterior" class="filter-tab-btn flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${this.activeFilter === 'exterior' ? 'bg-cyan-500/20 border border-cyan-500 text-cyan-300' : 'bg-white/5 text-gray-400 border border-white/5'}">
                Exterior
              </button>
            </div>
          </div>

          <!-- Country List Scrollable -->
          <div class="p-4 overflow-y-auto space-y-4 max-h-[60vh] custom-scroll">
            ${filteredCountries.length === 0 ? `
              <div class="text-center py-8 text-gray-500 text-xs">
                No se encontraron países que coincidan con "${this.searchQuery}".
              </div>
            ` : ''}

            ${(this.activeFilter === 'all' || this.activeFilter === 'latam') && latamCountries.length > 0 ? `
              <div>
                <div class="text-[10px] font-bold tracking-wider text-gray-400 uppercase mb-2">América Latina</div>
                <div class="space-y-2">
                  ${latamCountries.map(c => this.renderCountryRow(c, currentCountry.id, defaultCountryId)).join('')}
                </div>
              </div>
            ` : ''}

            ${(this.activeFilter === 'all' || this.activeFilter === 'exterior') && exteriorCountries.length > 0 ? `
              <div>
                <div class="text-[10px] font-bold tracking-wider text-gray-400 uppercase mb-2">Exterior & Global</div>
                <div class="space-y-2">
                  ${exteriorCountries.map(c => this.renderCountryRow(c, currentCountry.id, defaultCountryId)).join('')}
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Footer tip -->
          <div class="p-3 bg-white/5 border-t border-white/10 text-center text-[10px] text-gray-400 flex items-center justify-center space-x-1">
            <i data-lucide="star" class="w-3 h-3 text-amber-400 fill-amber-400"></i>
            <span>Presiona la estrella para definir tu país predeterminado.</span>
          </div>

        </div>
      </div>
    `;

    this.attachEvents();
  }

  renderCountryRow(country, activeId, defaultId) {
    const isActive = country.id === activeId;
    const isDefault = country.id === defaultId;

    return `
      <div data-country-id="${country.id}" class="country-row glass-card-interactive rounded-2xl p-3 flex items-center justify-between cursor-pointer border ${isActive ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/5'}">
        <div class="flex items-center space-x-3">
          <img src="${country.flagUrl}" alt="${country.name}" class="w-6 h-6 rounded-full object-cover shadow-sm border border-white/20">
          <div>
            <div class="flex items-center space-x-2">
              <h4 class="text-xs font-bold text-white">${country.name}</h4>
              ${isDefault ? `<span class="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"><i data-lucide="star" class="w-2.5 h-2.5 fill-amber-300"></i> Predeterminado</span>` : ''}
            </div>
            <p class="text-[10px] text-gray-400">${country.currency.code} (${country.currency.symbol}) - ${country.currency.name}</p>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <button type="button" data-default-id="${country.id}" aria-label="Fijar predeterminado" title="${isDefault ? 'País predeterminado actual' : 'Establecer como predeterminado'}" 
            class="set-default-btn p-1.5 rounded-lg border transition-all ${isDefault ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-white/5 border-white/10 text-gray-500 hover:text-amber-300'}">
            <i data-lucide="star" class="w-4 h-4 ${isDefault ? 'fill-amber-300 text-amber-300' : ''}"></i>
          </button>
          
          <div class="w-5 flex justify-center">
            ${isActive ? `<i data-lucide="check" class="w-4 h-4 text-cyan-400"></i>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  attachEvents() {
    const backdrop = document.getElementById('country-modal-backdrop');
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.close();
      }
    });

    const closeBtn = document.getElementById('close-modal-btn');
    closeBtn?.addEventListener('click', () => this.close());

    const searchInput = document.getElementById('country-search-input');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.render();
      if (window.lucide) window.lucide.createIcons();
      // Mantiene el foco en el campo de búsqueda
      const newSearchInput = document.getElementById('country-search-input');
      if (newSearchInput) {
        newSearchInput.focus();
        newSearchInput.setSelectionRange(this.searchQuery.length, this.searchQuery.length);
      }
    });

    const clearSearchBtn = document.getElementById('clear-search-btn');
    clearSearchBtn?.addEventListener('click', () => {
      this.searchQuery = '';
      this.render();
      if (window.lucide) window.lucide.createIcons();
    });

    const filterBtns = document.querySelectorAll('.filter-tab-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activeFilter = btn.getAttribute('data-filter');
        this.render();
        if (window.lucide) window.lucide.createIcons();
      });
    });

    const countryRows = document.querySelectorAll('.country-row');
    countryRows.forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.set-default-btn')) return;

        const countryId = row.getAttribute('data-country-id');
        mockEngine.setSelectedCountry(countryId);
        if (this.onSelectCallback) this.onSelectCallback(countryId);
        this.close();
      });
    });

    const defaultBtns = document.querySelectorAll('.set-default-btn');
    defaultBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const countryId = btn.getAttribute('data-default-id');
        mockEngine.setDefaultCountry(countryId);
        this.render();
        if (window.lucide) window.lucide.createIcons();
      });
    });
  }
}
