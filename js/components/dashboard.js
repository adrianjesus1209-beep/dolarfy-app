import { mockEngine } from '../mockData.js';
import { formatCurrency, formatPercentage, formatTime } from '../utils/formatters.js';

export class DashboardView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.unsubscribe = null;
    this.selectedDay = 'today'; // 'today' | 'tomorrow'
  }

  render() {
    const currentCountry = mockEngine.getCurrentCountry();
    const rates = mockEngine.getRates();
    const rateKeys = Object.keys(rates);
    
    // Verificar si existe alguna tasa con la publicación oficial de Mañana
    const publishedTomorrowRates = Object.values(rates).filter(r => r && r.tomorrow && r.tomorrow.published);
    const hasTomorrowData = publishedTomorrowRates.length > 0;

    // Si no se ha publicado para Mañana, forzar el estado a Hoy ("si no se ha publicado no mostrar nada")
    if (!hasTomorrowData) {
      this.selectedDay = 'today';
    }

    const isTomorrow = this.selectedDay === 'tomorrow' && hasTomorrowData;

    // Obtener tasa principal activa según el día seleccionado
    const mainRateObj = rates[currentCountry.defaultRateId] || rates[rateKeys[0]];
    const mainValue = (isTomorrow && mainRateObj.tomorrow && mainRateObj.tomorrow.published)
      ? mainRateObj.tomorrow.value
      : mainRateObj.value;

    let bannerText = `${mainRateObj.name}: ${formatCurrency(mainValue, mainRateObj.currency, 2)}`;
    let bannerSub = isTomorrow
      ? `Tasa oficial del día siguiente publicada para ${mainRateObj.tomorrow?.dateLabel || 'Mañana'}.`
      : `Tasas de referencia actualizadas para ${currentCountry.name}.`;

    const secondRateObj = rateKeys.length > 1 ? rates[rateKeys[1]] : null;
    if (!isTomorrow && secondRateObj && mainRateObj.value && secondRateObj.value && mainRateObj.currency === secondRateObj.currency) {
      const diff = Math.abs(secondRateObj.value - mainRateObj.value);
      const gapPercent = ((diff / Math.min(mainRateObj.value, secondRateObj.value)) * 100).toFixed(1);
      bannerSub = `Diferencia entre ${mainRateObj.name} y ${secondRateObj.name} se ubica en ${gapPercent}%.`;
    }

    this.container.innerHTML = `
      <div class="space-y-5 pb-24 animate-fade-in">
        
        <!-- Status Bar del Banco Central -->
        <div class="flex items-center justify-between bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-4 shadow-lg">
          <div class="flex items-center space-x-3">
            <span class="relative flex h-3 w-3">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <p class="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <i data-lucide="landmark" class="w-4 h-4 text-emerald-400"></i>
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

        <!-- CONDICIONAL: Sección de Botones Hoy / Mañana (Sólo se muestra si la tasa del día siguiente está publicada) -->
        ${hasTomorrowData ? `
          <div class="flex items-center justify-between bg-emerald-950/40 border border-emerald-500/30 backdrop-blur-xl rounded-2xl p-3 shadow-xl">
            <div class="flex items-center space-x-2.5">
              <div class="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <i data-lucide="calendar-clock" class="w-4.5 h-4.5"></i>
              </div>
              <div>
                <p class="text-xs font-black text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                  <span>Tasa Oficial Mañana</span>
                  <span class="bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0.2 rounded-full font-bold">Publicada</span>
                </p>
                <p class="text-[11px] text-gray-300 font-medium">Ver cotización de ${currentCountry.name}</p>
              </div>
            </div>

            <!-- Botones Selector de Día (Hoy / Mañana) -->
            <div class="flex items-center bg-black/60 p-1 rounded-xl border border-white/10 space-x-1">
              <button id="day-btn-today" type="button" class="px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${!isTomorrow ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/30' : 'text-gray-400 hover:text-white'}">
                Hoy
              </button>
              <button id="day-btn-tomorrow" type="button" class="px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center space-x-1.5 ${isTomorrow ? 'bg-emerald-400 text-black shadow-lg shadow-emerald-400/30' : 'text-emerald-400 hover:text-white'}">
                <span>Mañana</span>
                <span class="relative flex h-2 w-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                </span>
              </button>
            </div>
          </div>
        ` : ''}

        <!-- Banner Informativo / Resumen del Día -->
        <div class="relative overflow-hidden rounded-2xl ${isTomorrow ? 'bg-gradient-to-r from-emerald-900/50 via-teal-900/40 to-cyan-900/40 border-emerald-500/30' : 'bg-gradient-to-r from-cyan-900/40 via-blue-900/30 to-purple-900/40 border-white/10'} p-5 border shadow-xl">
          <div class="relative z-10">
            <span class="${isTomorrow ? 'bg-emerald-500/20 text-emerald-300' : 'bg-cyan-500/20 text-cyan-300'} text-xs px-2.5 py-0.5 rounded-full font-bold">
              ${isTomorrow ? '🟢 Tasa Oficial Día Siguiente' : 'Resumen del Día'}
            </span>
            <h3 class="text-xl font-black text-white mt-2 tracking-tight">${bannerText}</h3>
            <p class="text-xs text-gray-300 mt-1 font-medium">${bannerSub}</p>
          </div>
        </div>

        <!-- Sección Lista de Tasas -->
        <div>
          <div class="flex justify-between items-center mb-3">
            <h2 class="text-xs font-black uppercase tracking-wider text-gray-400">
              ${isTomorrow ? `Cotización Oficial del Día Siguiente (${currentCountry.name})` : `Tasas Principales (${currentCountry.name})`}
            </h2>
            <span class="text-xs font-extrabold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md">${currentCountry.currency.code}</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${rateKeys.map(key => this.renderRateCard(rates[key], isTomorrow)).join('')}
          </div>
        </div>
      </div>
    `;

    this.attachDayToggleEvents();
    this.subscribeToUpdates();
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  attachDayToggleEvents() {
    const btnToday = document.getElementById('day-btn-today');
    const btnTomorrow = document.getElementById('day-btn-tomorrow');

    btnToday?.addEventListener('click', () => {
      if (this.selectedDay !== 'today') {
        this.selectedDay = 'today';
        this.render();
      }
    });

    btnTomorrow?.addEventListener('click', () => {
      if (this.selectedDay !== 'tomorrow') {
        this.selectedDay = 'tomorrow';
        this.render();
      }
    });
  }

  renderRateCard(rate, isTomorrow) {
    if (!rate) return '';
    
    const hasTomorrowForRate = rate.tomorrow && rate.tomorrow.published;
    const activeValue = (isTomorrow && hasTomorrowForRate) ? rate.tomorrow.value : rate.value;
    const activeChange = (isTomorrow && hasTomorrowForRate) ? rate.tomorrow.change : rate.change;
    const refLabel = (isTomorrow && hasTomorrowForRate) ? (rate.tomorrow.dateLabel || 'Ref. Mañana') : 'Ref. Hoy';

    const isPositive = activeChange >= 0;
    const badgeBg = isPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20';
    const trendIcon = isPositive ? 'trending-up' : 'trending-down';

    return `
      <div id="card-${rate.id}" class="glass-card-interactive rounded-2xl p-4 relative overflow-hidden transition-all duration-300 ${isTomorrow && hasTomorrowForRate ? 'border-emerald-500/40 bg-emerald-950/20' : ''}">
        <div class="flex justify-between items-start">
          <div class="flex items-center space-x-3">
            <div class="p-2.5 rounded-xl bg-white/5 border border-white/10 ${isTomorrow && hasTomorrowForRate ? 'text-emerald-400' : 'text-cyan-400'}">
              <i data-lucide="${rate.icon || 'coins'}" class="w-5 h-5"></i>
            </div>
            <div>
              <h4 class="font-bold text-gray-100 text-sm">${rate.name}</h4>
              <p class="text-xs text-gray-400">${rate.code}</p>
            </div>
          </div>
          <span id="badge-${rate.id}" class="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeBg}">
            <i data-lucide="${trendIcon}" class="w-3.5 h-3.5"></i>
            <span>${formatPercentage(activeChange)}</span>
          </span>
        </div>

        <div class="mt-4 flex justify-between items-end">
          <div>
            <p class="text-2xl font-black text-white tracking-tight" id="val-${rate.id}">
              ${formatCurrency(activeValue, rate.currency, activeValue < 10 ? 4 : 2)}
            </p>
          </div>
          <span class="text-[10px] ${isTomorrow && hasTomorrowForRate ? 'text-emerald-300 font-bold bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30' : 'text-gray-400 font-semibold'}">
            ${refLabel}
          </span>
        </div>
      </div>
    `;
  }

  subscribeToUpdates() {
    if (this.unsubscribe) this.unsubscribe();

    this.unsubscribe = mockEngine.subscribe((rates, updatedId, action) => {
      if (action === 'rates_refreshed' || action === 'country_change') {
        this.render();
        return;
      }

      const valEl = document.getElementById(`val-${updatedId}`);
      const badgeEl = document.getElementById(`badge-${updatedId}`);
      const lastUpdateEl = document.getElementById('dash-last-update');

      if (lastUpdateEl) lastUpdateEl.textContent = formatTime();

      if (valEl && rates[updatedId]) {
        const rate = rates[updatedId];
        const isTomorrow = this.selectedDay === 'tomorrow';
        const hasTomorrowForRate = rate.tomorrow && rate.tomorrow.published;
        const activeValue = (isTomorrow && hasTomorrowForRate) ? rate.tomorrow.value : rate.value;
        const activeChange = (isTomorrow && hasTomorrowForRate) ? rate.tomorrow.change : rate.change;

        valEl.textContent = formatCurrency(activeValue, rate.currency, activeValue < 10 ? 4 : 2);

        if (badgeEl) {
          const isPositive = activeChange >= 0;
          const badgeBg = isPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20';
          const trendIcon = isPositive ? 'trending-up' : 'trending-down';

          badgeEl.className = `inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeBg}`;
          badgeEl.innerHTML = `
            <i data-lucide="${trendIcon}" class="w-3.5 h-3.5"></i>
            <span>${formatPercentage(activeChange)}</span>
          `;
          if (window.lucide) window.lucide.createIcons();
        }
      }
    });
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}
