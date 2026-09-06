import { mockEngine } from '../mockData.js';
import { formatCurrency, formatPercentage, formatTime } from '../utils/formatters.js';

export class DashboardView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.unsubscribe = null;
    this.selectedDay = 'hoy'; // 'hoy' | 'manana'
  }

  getNextDayLabel(rates) {
    const bcvNext = rates && rates.bcv && rates.bcv.nextDay;
    if (bcvNext && bcvNext.date) {
      const match = bcvNext.date.match(/(Lunes|Martes|Miércoles|Miercoles|Jueves|Viernes|Sábado|Sabado|Domingo)/i);
      if (match) {
        const day = match[1].toLowerCase();
        return day.charAt(0).toUpperCase() + day.slice(1);
      }
    }
    const todayDay = new Date().getDay();
    if (todayDay === 5 || todayDay === 6 || todayDay === 0) {
      return 'Lunes';
    }
    return 'Mañana';
  }

  render() {
    const currentCountry = mockEngine.getCurrentCountry();
    const rates = mockEngine.getRates();
    const rateKeys = Object.keys(rates);
    const nextDayLabel = this.getNextDayLabel(rates);
    
    const isManana = this.selectedDay === 'manana';
    const mainRate = rates[currentCountry.defaultRateId] || rates[rateKeys[0]];
    const secondRate = rateKeys.length > 1 ? rates[rateKeys[1]] : null;

    const isOfficialNext = isManana && mainRate.nextDay && mainRate.nextDay.isOfficial;
    const mainVal = (isManana && mainRate.nextDay && mainRate.nextDay.value) ? mainRate.nextDay.value : mainRate.value;
    const secondVal = (secondRate && isManana && secondRate.nextDay && secondRate.nextDay.value) ? secondRate.nextDay.value : (secondRate ? secondRate.value : null);

    let bannerTag = isManana 
      ? (isOfficialNext ? `Oficial ${nextDayLabel}` : `Pronóstico ${nextDayLabel}`) 
      : 'Resumen del Día';
    let bannerText = '';
    let bannerSub = '';

    if (isManana) {
      bannerText = (mainVal !== null && mainVal !== undefined)
        ? `${mainRate.name} (${nextDayLabel}): ${formatCurrency(mainVal, mainRate.currency, 2)}`
        : `Pronóstico ${nextDayLabel}: Bs. — — —`;
      bannerSub = isOfficialNext
        ? `Cotización oficial publicada por el Banco Central de Venezuela para ${nextDayLabel}.`
        : `Pronóstico del mercado proyectado para ${nextDayLabel} según tendencia actual.`;
    } else {
      bannerText = (mainVal !== null && mainVal !== undefined) ? `${mainRate.name}: ${formatCurrency(mainVal, mainRate.currency, 2)}` : `${mainRate.name}: Bs. — — —`;
      bannerSub = mainVal 
        ? `Tasas de referencia actualizadas para ${currentCountry.name}.`
        : 'Cargando tasas en vivo...';

      if (secondVal && mainVal && mainRate.currency === secondRate.currency) {
        const diff = Math.abs(secondVal - mainVal);
        const gapPercent = ((diff / Math.min(mainVal, secondVal)) * 100).toFixed(1);
        bannerSub = `Diferencia entre ${mainRate.name} y ${secondRate.name} se ubica en ${gapPercent}%.`;
      }
    }

    this.container.innerHTML = `
      <div class="space-y-6 pb-24 animate-fade-in">
        <!-- Header status bar -->
        <div class="flex items-center justify-between bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-4">
          <div class="flex items-center space-x-3">
            <span class="relative flex h-3 w-3">
              <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <p class="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <i data-lucide="landmark" class="w-3.5 h-3.5 text-emerald-400"></i>
                <span>Monitoreo Financiero en Vivo</span>
              </p>
              <p class="text-[11px] text-gray-300 font-semibold mt-0.5">${currentCountry.officialSchedule || 'Cierre Banco Central'}</p>
            </div>
          </div>
          <div id="dash-country-badge" class="text-xs font-bold px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center space-x-1.5">
            <img src="${currentCountry.flagUrl}" alt="${currentCountry.name}" class="w-4 h-4 rounded-full object-cover border border-cyan-500/30">
            <span>${currentCountry.name}</span>
          </div>
        </div>

        <!-- Banner Promocional / Alerta de Mercado -->
        <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-900/40 via-blue-900/30 to-purple-900/40 p-5 border border-white/10">
          <div class="relative z-10">
            <span class="bg-cyan-500/20 text-cyan-300 text-xs px-2.5 py-0.5 rounded-full font-semibold">${bannerTag}</span>
            <h3 class="text-lg font-bold text-white mt-2">${bannerText}</h3>
            <p class="text-xs text-gray-300 mt-1">${bannerSub}</p>
          </div>
        </div>

        <!-- Encabezado de Tasas y Selector 'Hoy' / 'Mañana' (o 'Lunes') -->
        <div>
          <div class="flex justify-between items-center mb-3">
            <div>
              <h2 class="text-xs font-bold uppercase tracking-wider text-gray-400">Tasas Principales ${currentCountry.name}</h2>
              <span class="text-xs font-bold text-cyan-400">${currentCountry.currency.code}</span>
            </div>

            <!-- Selector de Fecha 'Hoy' / Día Siguiente ('Lunes' / 'Mañana') -->
            <div class="bg-[#131924] border border-white/10 p-1 rounded-2xl flex items-center space-x-1 shadow-inner">
              <button type="button" data-day="hoy" class="dash-day-btn relative px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${this.selectedDay === 'hoy' ? 'bg-cyan-500/20 text-emerald-400 border border-cyan-500/40 shadow-sm' : 'text-gray-400 hover:text-white'}">
                Hoy
              </button>
              <button type="button" data-day="manana" class="dash-day-btn relative px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${this.selectedDay === 'manana' ? 'bg-cyan-500/20 text-emerald-400 border border-cyan-500/40 shadow-sm' : 'text-gray-400 hover:text-white'}">
                <span>Pronóstico ${nextDayLabel}</span>
              </button>
            </div>
          </div>

          <!-- Contenido de Cotizaciones segun la pestaña activa -->
          ${this.renderContentSection(rates, rateKeys, currentCountry, true, nextDayLabel)}
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.subscribeToUpdates();
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  renderContentSection(rates, rateKeys, currentCountry, hasPublishedNextDay, nextDayLabel) {
    if (this.selectedDay === 'manana') {
      return `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
          ${rateKeys.map(key => this.renderNextDayRateCard(rates[key], nextDayLabel)).join('')}
        </div>
      `;
    }

    // Modo 'hoy' por defecto
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
        ${rateKeys.map(key => this.renderRateCard(rates[key])).join('')}
      </div>
    `;
  }

  renderRateCard(rate) {
    if (!rate) return '';
    const isPositive = rate.change >= 0;
    const badgeBg = isPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20';
    const trendIcon = isPositive ? 'trending-up' : 'trending-down';

    const isLoaded = rate.value !== null && rate.value !== undefined && !isNaN(rate.value);
    const valueDisplay = isLoaded
      ? formatCurrency(rate.value, rate.currency, rate.value < 10 ? 4 : 2)
      : `<span class="text-white/30 tracking-widest font-mono text-xl">— — —</span>`;

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
            <span>${formatPercentage(rate.change)}</span>
          </span>
        </div>

        <div class="mt-4 flex justify-between items-end">
          <div>
            <p class="text-2xl font-extrabold text-white tracking-tight" id="val-${rate.id}">
              ${valueDisplay}
            </p>
          </div>
          <span class="text-[10px] text-gray-500 font-medium">Ref. En Vivo</span>
        </div>
      </div>
    `;
  }

  renderNextDayRateCard(rate, nextDayLabel = 'Mañana') {
    if (!rate) return '';
    const nextDay = (rate.nextDay && rate.nextDay.value) ? rate.nextDay : {
      published: true,
      isOfficial: false,
      value: rate.value ? parseFloat((rate.value * 1.002).toFixed(2)) : null,
      change: 0.20,
      date: `Pronóstico ${nextDayLabel}`,
      scheduleText: 'Proyección estimada del mercado'
    };

    const val = nextDay.value || rate.value;
    const isPositive = nextDay.change >= 0;
    const badgeBg = isPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20';
    const trendIcon = isPositive ? 'trending-up' : 'trending-down';

    const isLoaded = val !== null && val !== undefined && !isNaN(val);
    const valueDisplay = isLoaded
      ? formatCurrency(val, rate.currency, val < 10 ? 4 : 2)
      : `<span class="text-white/30 tracking-widest font-mono text-xl">— — —</span>`;

    const isOfficial = nextDay.isOfficial;
    const badgeTag = isOfficial 
      ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">Fecha Valor BCV</span>'
      : '<span class="text-[10px] bg-cyan-500/20 text-cyan-300 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">Pronóstico Dolarfy</span>';

    return `
      <div id="card-next-${rate.id}" class="glass-card-interactive rounded-2xl p-4 relative overflow-hidden transition-all duration-300 border-cyan-500/30">
        <div class="flex justify-between items-start">
          <div class="flex items-center space-x-3">
            <div class="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
              <i data-lucide="${rate.icon || 'coins'}" class="w-5 h-5"></i>
            </div>
            <div>
              <h4 class="font-bold text-gray-100 text-sm">${rate.name}</h4>
              ${badgeTag}
            </div>
          </div>
          <span class="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeBg}">
            <i data-lucide="${trendIcon}" class="w-3.5 h-3.5"></i>
            <span>${formatPercentage(nextDay.change)}</span>
          </span>
        </div>

        <div class="mt-4 flex justify-between items-end">
          <div>
            <p class="text-2xl font-extrabold text-emerald-400 tracking-tight">
              ${valueDisplay}
            </p>
            <p class="text-[11px] text-gray-300 font-medium mt-0.5">${(nextDay.date && !nextDay.date.toLowerCase().includes('pendiente')) ? nextDay.date : `Pronóstico Estimado ${nextDayLabel}`}</p>
          </div>
          <span class="text-[10px] text-cyan-400 font-bold">Ref. ${nextDayLabel}</span>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    const dayBtns = this.container.querySelectorAll('.dash-day-btn');
    dayBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const day = btn.getAttribute('data-day');
        if (day && day !== this.selectedDay) {
          this.selectedDay = day;
          this.render();
        }
      });
    });
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

      if (valEl && rates[updatedId]) {
        const rate = rates[updatedId];
        valEl.textContent = formatCurrency(rate.value, rate.currency, rate.value < 10 ? 4 : 2);

        if (badgeEl) {
          const isPositive = rate.change >= 0;
          const badgeBg = isPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20';
          const trendIcon = isPositive ? 'trending-up' : 'trending-down';

          badgeEl.className = `inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeBg}`;
          badgeEl.innerHTML = `
            <i data-lucide="${trendIcon}" class="w-3.5 h-3.5"></i>
            <span>${formatPercentage(rate.change)}</span>
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
