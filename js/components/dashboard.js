import { mockEngine } from '../mockData.js';
import { formatCurrency, formatPercentage, formatTime } from '../utils/formatters.js';

export class DashboardView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.unsubscribe = null;
    this.selectedRateId = null;
    this.selectedCurrencyType = 'USD'; // 'USD' | 'EUR'
  }

  render() {
    const currentCountry = mockEngine.getCurrentCountry();
    const rates = mockEngine.getRates();
    const rateKeys = Object.keys(rates);
    
    if (!this.selectedRateId || !rates[this.selectedRateId]) {
      this.selectedRateId = currentCountry.defaultRateId && rates[currentCountry.defaultRateId] 
        ? currentCountry.defaultRateId 
        : rateKeys[0];
    }

    const selectedDay = mockEngine.getSelectedDay(); // 'today' | 'tomorrow'
    const activeRateRaw = rates[this.selectedRateId] || rates[rateKeys[0]];
    const hasTomorrow = mockEngine.hasTomorrowForRate(this.selectedRateId);

    // Si 'Mañana' fue seleccionado previamente pero no está disponible para esta tasa, fallback a 'today'
    const effectiveDay = (selectedDay === 'tomorrow' && hasTomorrow) ? 'tomorrow' : 'today';
    const activeRate = mockEngine.getEffectiveRate(this.selectedRateId, effectiveDay);

    // Obtener valor según tipo de moneda seleccionada (USD o EUR)
    let displayValue = activeRate ? activeRate.value : 0;
    let displayCode = '1 USD';

    if (this.selectedCurrencyType === 'EUR') {
      if (rates.euro) {
        const eurEffective = mockEngine.getEffectiveRate('euro', effectiveDay);
        displayValue = eurEffective ? eurEffective.value : (activeRate ? activeRate.value * 1.088 : 0);
      } else {
        displayValue = activeRate ? activeRate.value * 1.088 : 0;
      }
      displayCode = '1 EUR';
    }

    const symbol = currentCountry.currency.symbol || 'Bs';

    this.container.innerHTML = `
      <div class="space-y-5 pb-24 animate-fade-in">
        
        <!-- Header Status & País -->
        <div class="flex items-center justify-between bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-4">
          <div class="flex items-center space-x-3">
            <span class="relative flex h-3 w-3">
              <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 animate-ping opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <p class="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <i data-lucide="landmark" class="w-3.5 h-3.5 text-emerald-400"></i>
                <span>Publicación Bancaria Oficial</span>
              </p>
              <p class="text-[11px] text-gray-300 font-semibold mt-0.5">${currentCountry.officialSchedule || 'Cierre Banco Central'}</p>
            </div>
          </div>
          <button type="button" id="dash-country-badge" aria-label="Cambiar país" class="country-selector-trigger text-xs font-bold px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center space-x-1.5 hover:bg-cyan-500/20 active:scale-95 transition-all cursor-pointer">
            <img src="${currentCountry.flagUrl}" alt="${currentCountry.name}" class="w-4 h-4 rounded-full object-cover border border-cyan-500/30">
            <span>${currentCountry.name}</span>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-cyan-400"></i>
          </button>
        </div>

        <!-- Barra Superior de Control (Categorías a la Izq + Hoy/Mañana a la Der) -->
        <div class="flex items-center justify-between gap-2">
          
          <!-- Píldoras de Tasas (Izq) -->
          <div class="flex items-center space-x-1 bg-black/40 p-1.5 rounded-2xl border border-white/10 overflow-x-auto no-scrollbar">
            ${rateKeys.map(key => {
              const r = rates[key];
              const isSelected = this.selectedRateId === key;
              const pillName = key === 'bcv' ? 'BCV' : (key === 'usdt' ? 'USDT' : (key === 'paralelo' ? 'Paralelo' : r.name.split(' ')[0]));
              return `
                <button type="button" data-rate-id="${key}" class="rate-dash-pill px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${isSelected ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20' : 'text-gray-400 hover:text-white'}">
                  ${pillName}
                </button>
              `;
            }).join('')}
          </div>

          <!-- Píldoras de Día (Hoy / Mañana) - Mañana se muestra ÚNICAMENTE si está publicado -->
          <div class="flex items-center space-x-1 bg-black/40 p-1.5 rounded-2xl border border-white/10">
            <button type="button" data-day="today" class="day-dash-pill px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${effectiveDay === 'today' ? 'bg-emerald-700/80 text-white border border-emerald-500/40 shadow-md' : 'text-gray-400 hover:text-white'}">
              Hoy
            </button>
            ${hasTomorrow ? `
              <button type="button" data-day="tomorrow" class="day-dash-pill px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${effectiveDay === 'tomorrow' ? 'bg-emerald-700/80 text-white border border-emerald-500/40 shadow-md' : 'text-gray-400 hover:text-white'}">
                Mañana
              </button>
            ` : ''}
          </div>

        </div>

        <!-- Tarjeta Principal Destacada de Cotización Dólar/Euro y Fecha Valor -->
        <div class="glass-card rounded-3xl p-6 relative overflow-hidden space-y-4 border border-white/10 bg-[#111622]/90 text-center shadow-2xl">
          
          <!-- Selector Central de Moneda (Dólares / Euros) -->
          <div class="inline-flex items-center bg-black/50 p-1 rounded-2xl border border-white/10 mx-auto">
            <button type="button" id="toggle-currency-usd" class="px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${this.selectedCurrencyType === 'USD' ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/30' : 'text-gray-400 hover:text-white'}">
              Dólares
            </button>
            <button type="button" id="toggle-currency-eur" class="px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${this.selectedCurrencyType === 'EUR' ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/30' : 'text-gray-400 hover:text-white'}">
              Euros
            </button>
          </div>

          <!-- Gran Pantalla del Precio -->
          <div class="py-2">
            <h2 class="text-3xl sm:text-4xl font-black text-white tracking-tight">
              ${displayCode} = <span class="text-emerald-400 drop-shadow-sm">${displayValue.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}</span>
            </h2>
          </div>

          <!-- Fecha Valor -->
          <div class="flex items-center justify-center space-x-1.5 text-xs text-gray-400 font-semibold pt-1 border-t border-white/5">
            <i data-lucide="calendar" class="w-4 h-4 text-emerald-400"></i>
            <span>Fecha Valor: ${activeRate ? activeRate.valueDate : 'Al día'}</span>
          </div>

        </div>

        <!-- Sección Tasas Principales del País -->
        <div class="pt-2">
          <div class="flex justify-between items-center mb-3">
            <h2 class="text-xs font-bold uppercase tracking-wider text-gray-400">Todas las Tasas ${currentCountry.name}</h2>
            <span class="text-xs font-bold text-cyan-400">${currentCountry.currency.code}</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${rateKeys.map(key => this.renderRateCard(rates[key], effectiveDay)).join('')}
          </div>
        </div>

      </div>
    `;

    this.attachEvents();
    this.subscribeToUpdates();
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  renderRateCard(rate, day) {
    if (!rate) return '';
    const eff = mockEngine.getEffectiveRate(rate.id, day);
    const val = eff ? eff.value : rate.value;
    const change = eff ? eff.change : rate.change;

    const isPositive = change >= 0;
    const badgeBg = isPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20';
    const trendIcon = isPositive ? 'trending-up' : 'trending-down';

    return `
      <div id="card-${rate.id}" class="glass-card-interactive rounded-2xl p-4 relative overflow-hidden transition-all duration-300">
        <div class="flex justify-between items-start">
          <div class="flex items-center space-x-3">
            <div class="p-2.5 rounded-xl bg-white/5 border border-white/10 text-cyan-400">
              <i data-lucide="${rate.icon || 'coins'}" class="w-5 h-5"></i>
            </div>
            <div>
              <h4 class="font-bold text-gray-100 text-sm">${rate.name}</h4>
              <p class="text-xs text-gray-400">${rate.code}</p>
            </div>
          </div>
          <span id="badge-${rate.id}" class="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeBg}">
            <i data-lucide="${trendIcon}" class="w-3.5 h-3.5"></i>
            <span>${formatPercentage(change)}</span>
          </span>
        </div>

        <div class="mt-4 flex justify-between items-end">
          <div>
            <p class="text-2xl font-extrabold text-white tracking-tight" id="val-${rate.id}">
              ${formatCurrency(val, rate.currency, val < 10 ? 4 : 2)}
            </p>
          </div>
          <span class="text-[10px] text-gray-400 font-bold uppercase">${eff && eff.isTomorrow ? 'Ref. Mañana' : 'Ref. Hoy'}</span>
        </div>
      </div>
    `;
  }

  attachEvents() {
    // Eventos de Píldoras de Tasa
    const ratePills = this.container.querySelectorAll('.rate-dash-pill');
    ratePills.forEach(btn => {
      btn.addEventListener('click', () => {
        const rateId = btn.getAttribute('data-rate-id');
        this.selectedRateId = rateId;
        this.render();
      });
    });

    // Eventos de Píldoras de Día (Hoy / Mañana)
    const dayPills = this.container.querySelectorAll('.day-dash-pill');
    dayPills.forEach(btn => {
      btn.addEventListener('click', () => {
        const day = btn.getAttribute('data-day');
        mockEngine.setSelectedDay(day);
        this.render();
      });
    });

    // Toggle Moneda USD / EUR
    const toggleUsd = this.container.querySelector('#toggle-currency-usd');
    const toggleEur = this.container.querySelector('#toggle-currency-eur');

    toggleUsd?.addEventListener('click', () => {
      this.selectedCurrencyType = 'USD';
      this.render();
    });

    toggleEur?.addEventListener('click', () => {
      this.selectedCurrencyType = 'EUR';
      this.render();
    });
  }

  subscribeToUpdates() {
    if (this.unsubscribe) this.unsubscribe();

    this.unsubscribe = mockEngine.subscribe((rates, updatedId, action) => {
      if (action === 'rates_refreshed' || action === 'country_change' || action === 'day_change') {
        this.render();
      }
    });
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}
