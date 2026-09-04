import { mockEngine } from '../mockData.js';
import { formatCurrency, formatPercentage, formatTime } from '../utils/formatters.js';
import { dolarDayService } from '../dolarDayService.js';

export class DashboardView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.unsubscribe = null;
    this.activeDayTab = 'today'; // 'today' | 'tomorrow'
    this.dayRates = null; // { today, tomorrow }
  }

  async render() {
    const currentCountry = mockEngine.getCurrentCountry();
    const rates = mockEngine.getRates();
    const rateKeys = Object.keys(rates);

    // Find main featured rate for banner
    const mainRate = rates[currentCountry.defaultRateId] || rates[rateKeys[0]];
    const secondRate = rateKeys.length > 1 ? rates[rateKeys[1]] : null;

    let bannerText = `${mainRate.name}: ${formatCurrency(mainRate.value, mainRate.currency, 2)}`;
    let bannerSub = `Tasas de referencia actualizadas para ${currentCountry.name}.`;

    if (secondRate && mainRate.value && secondRate.value && mainRate.currency === secondRate.currency) {
      const diff = Math.abs(secondRate.value - mainRate.value);
      const gapPercent = ((diff / Math.min(mainRate.value, secondRate.value)) * 100).toFixed(1);
      bannerSub = `Diferencia entre ${mainRate.name} y ${secondRate.name} se ubica en ${gapPercent}%.`;
    }

    // Obtener datos de hoy/mañana si es Venezuela
    const isVenezuela = currentCountry.id === 'VE';
    if (isVenezuela) {
      this.dayRates = await dolarDayService.fetchVenezuelaRates();
    } else {
      this.dayRates = null;
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

        <!-- Banner Promocional / Alerta de Mercado -->
        <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-900/40 via-blue-900/30 to-purple-900/40 p-5 border border-white/10">
          <div class="relative z-10">
            <span class="bg-cyan-500/20 text-cyan-300 text-xs px-2.5 py-0.5 rounded-full font-semibold">Resumen del Día</span>
            <h3 class="text-lg font-bold text-white mt-2">${bannerText}</h3>
            <p class="text-xs text-gray-300 mt-1">${bannerSub}</p>
          </div>
        </div>

        ${isVenezuela && this.dayRates && this.dayRates.today ? this.renderDayRatesSection() : ''}

        <!-- Sección Tasas Principales del País -->
        <div>
          <div class="flex justify-between items-center mb-3">
            <h2 class="text-xs font-bold uppercase tracking-wider text-gray-400">Tasas Principales ${currentCountry.name}</h2>
            <span class="text-xs font-bold text-cyan-400">${currentCountry.currency.code}</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${rateKeys.map(key => this.renderRateCard(rates[key])).join('')}
          </div>
        </div>
      </div>
    `;

    this._bindDayTabs();
    this.subscribeToUpdates();
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  renderDayRatesSection() {
    const { today, tomorrow } = this.dayRates;
    const hasTomorrow = !!tomorrow;
    const activeRate = this.activeDayTab === 'tomorrow' && hasTomorrow ? tomorrow : today;

    const todayBtnClass = this.activeDayTab === 'today'
      ? 'day-tab-btn active-day-tab px-4 py-1.5 rounded-full text-xs font-bold bg-cyan-500 text-white shadow-lg shadow-cyan-500/30 transition-all'
      : 'day-tab-btn px-4 py-1.5 rounded-full text-xs font-semibold bg-white/5 text-gray-400 hover:text-gray-200 border border-white/10 transition-all';

    const tomorrowBtnClass = this.activeDayTab === 'tomorrow'
      ? 'day-tab-btn active-day-tab px-4 py-1.5 rounded-full text-xs font-bold bg-cyan-500 text-white shadow-lg shadow-cyan-500/30 transition-all'
      : 'day-tab-btn px-4 py-1.5 rounded-full text-xs font-semibold bg-white/5 text-gray-400 hover:text-gray-200 border border-white/10 transition-all';

    return `
      <div id="day-rates-section" class="rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-[#0e1520]/80 via-[#111827]/90 to-[#0c1219]/80 backdrop-blur-xl p-4 space-y-3">
        <!-- Header con tabs -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <i data-lucide="calendar-days" class="w-4 h-4 text-cyan-400"></i>
            <span class="text-xs font-bold text-gray-300 uppercase tracking-wider">Tasa BCV</span>
          </div>
          <div class="flex items-center gap-1.5 p-1 bg-white/5 rounded-full border border-white/10">
            <button type="button" id="day-tab-today" data-day="today" class="${todayBtnClass}" aria-label="Ver tasa de hoy">
              Hoy
            </button>
            ${hasTomorrow ? `
            <button type="button" id="day-tab-tomorrow" data-day="tomorrow" class="${tomorrowBtnClass}" aria-label="Ver tasa de mañana">
              <span class="flex items-center gap-1">
                Mañana
                <span class="inline-flex w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              </span>
            </button>` : ''}
          </div>
        </div>

        <!-- Contenido de la tasa activa -->
        <div id="day-rate-content" class="animate-fade-in">
          ${this._renderDayRateContent(activeRate)}
        </div>

        ${!hasTomorrow ? `
        <div class="flex items-center gap-2 text-[10px] text-gray-500 border-t border-white/5 pt-2">
          <i data-lucide="clock" class="w-3 h-3 flex-shrink-0"></i>
          <span>La tasa del próximo día hábil se publica después de las 5:00 PM (VET)</span>
        </div>` : ''}
      </div>
    `;
  }

  _renderDayRateContent(rate) {
    if (!rate) return '';

    const isPositive = rate.change !== null ? rate.change >= 0 : true;
    const changeColor = isPositive ? 'text-emerald-400' : 'text-red-400';
    const trendIcon = isPositive ? 'trending-up' : 'trending-down';
    const changeLabel = rate.change !== null ? formatPercentage(rate.change) : '—';

    const bcvFormatted = formatCurrency(rate.value, 'VES', 2);

    let paraleloHtml = '';
    if (rate.paralelo) {
      const parIsPos = rate.paralelo.change !== null ? rate.paralelo.change >= 0 : true;
      const parColor = parIsPos ? 'text-emerald-400' : 'text-red-400';
      paraleloHtml = `
        <div class="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2.5 border border-white/5">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <i data-lucide="trending-up" class="w-3.5 h-3.5 text-purple-400"></i>
            </div>
            <div>
              <p class="text-[11px] font-bold text-gray-200">Paralelo</p>
              <p class="text-[10px] text-gray-500">USD/VES Mercado</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-sm font-extrabold text-white">${formatCurrency(rate.paralelo.value, 'VES', 2)}</p>
            ${rate.paralelo.change !== null
              ? `<p class="text-[10px] font-bold ${parColor}">${formatPercentage(rate.paralelo.change)}</p>`
              : `<p class="text-[10px] text-gray-500">—</p>`}
          </div>
        </div>
      `;
    }

    return `
      <div class="space-y-2.5">
        <!-- BCV Card -->
        <div class="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2.5 border border-white/5">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <i data-lucide="building-2" class="w-3.5 h-3.5 text-cyan-400"></i>
            </div>
            <div>
              <p class="text-[11px] font-bold text-gray-200">Oficial BCV</p>
              <p class="text-[10px] text-gray-500">USD/VES Banco Central</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-sm font-extrabold text-white">${bcvFormatted}</p>
            <p class="text-[10px] font-bold ${changeColor} flex items-center justify-end gap-0.5">
              <i data-lucide="${trendIcon}" class="w-3 h-3"></i>
              ${changeLabel}
            </p>
          </div>
        </div>
        ${paraleloHtml}
      </div>
    `;
  }

  _bindDayTabs() {
    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('.day-tab-btn');
      if (!btn) return;

      const day = btn.dataset.day;
      if (!day || day === this.activeDayTab) return;

      this.activeDayTab = day;

      // Actualizar estilos de botones
      this.container.querySelectorAll('.day-tab-btn').forEach(b => {
        if (b.dataset.day === day) {
          b.className = 'day-tab-btn active-day-tab px-4 py-1.5 rounded-full text-xs font-bold bg-cyan-500 text-white shadow-lg shadow-cyan-500/30 transition-all';
        } else {
          b.className = 'day-tab-btn px-4 py-1.5 rounded-full text-xs font-semibold bg-white/5 text-gray-400 hover:text-gray-200 border border-white/10 transition-all';
        }
      });

      // Actualizar contenido
      const contentEl = document.getElementById('day-rate-content');
      if (contentEl && this.dayRates) {
        const activeRate = day === 'tomorrow' && this.dayRates.tomorrow
          ? this.dayRates.tomorrow
          : this.dayRates.today;
        contentEl.innerHTML = this._renderDayRateContent(activeRate);
        contentEl.classList.remove('animate-fade-in');
        void contentEl.offsetWidth; // reflow
        contentEl.classList.add('animate-fade-in');
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }

  renderRateCard(rate) {
    if (!rate) return '';
    const isPositive = rate.change >= 0;
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
            <span>${formatPercentage(rate.change)}</span>
          </span>
        </div>

        <div class="mt-4 flex justify-between items-end">
          <div>
            <p class="text-2xl font-extrabold text-white tracking-tight" id="val-${rate.id}">
              ${formatCurrency(rate.value, rate.currency, rate.value < 10 ? 4 : 2)}
            </p>
          </div>
          <span class="text-[10px] text-gray-500 font-medium">Ref. Hoy</span>
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
