import { mockEngine } from '../mockData.js';
import { apiService } from '../apiService.js';
import { formatCurrency, formatPercentage, formatTime } from '../utils/formatters.js';

export class DashboardView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.unsubscribe = null;
    this.forecastData = null;
    this.activeForecastTab = 'today'; // 'today' | 'tomorrow'
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

        <!-- Sección Pronóstico Hoy / Mañana -->
        <div id="forecast-section">
          ${this._renderForecastSkeleton()}
        </div>

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

    this.subscribeToUpdates();
    if (window.lucide) {
      window.lucide.createIcons();
    }

    // Load forecast data asynchronously
    this._loadForecast(currentCountry);
  }

  _renderForecastSkeleton() {
    return `
      <div class="rounded-2xl bg-white/5 border border-white/10 p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-white/10 animate-pulse"></div>
            <div>
              <div class="h-2.5 bg-white/10 rounded w-24 animate-pulse mb-1"></div>
              <div class="h-2 bg-white/8 rounded w-16 animate-pulse"></div>
            </div>
          </div>
          <div class="h-7 w-28 bg-white/10 rounded-xl animate-pulse"></div>
        </div>
        <div class="h-9 bg-white/10 rounded w-40 animate-pulse mb-2"></div>
        <div class="h-3 bg-white/8 rounded w-32 animate-pulse"></div>
      </div>
    `;
  }

  async _loadForecast(country) {
    const section = document.getElementById('forecast-section');
    if (!section) return;

    try {
      const forecast = await apiService.fetchForecastData(country);
      this.forecastData = forecast;

      if (!forecast) {
        section.innerHTML = '';
        return;
      }

      this._renderForecast(forecast);
    } catch (e) {
      console.warn('Forecast load error:', e);
      section.innerHTML = '';
    }
  }

  _renderForecast(forecast) {
    const section = document.getElementById('forecast-section');
    if (!section || !forecast) return;

    const { today, tomorrow, tomorrowAvailable, mainRateLabel, currency, publicationTime } = forecast;
    const activeDay = this.activeForecastTab === 'tomorrow' && tomorrowAvailable ? tomorrow : today;

    section.innerHTML = `
      <div class="rounded-2xl overflow-hidden border border-white/10" style="background: linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(59,130,246,0.06) 50%, rgba(139,92,246,0.08) 100%);">
        <!-- Section header -->
        <div class="flex items-center justify-between px-4 pt-4 pb-3">
          <div class="flex items-center gap-2">
            <div class="p-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/20">
              <i data-lucide="calendar-days" class="w-3.5 h-3.5 text-cyan-400"></i>
            </div>
            <div>
              <h2 class="text-xs font-bold uppercase tracking-wider text-gray-300">${mainRateLabel}</h2>
              <p class="text-[10px] text-gray-500 font-medium">Publicado · ${publicationTime}</p>
            </div>
          </div>

          <!-- Hoy / Mañana toggle pills -->
          <div class="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10">
            <button
              id="forecast-btn-today"
              type="button"
              class="forecast-tab-btn px-3 py-1 rounded-lg text-xs font-bold transition-all duration-200 ${this.activeForecastTab === 'today' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/30' : 'text-gray-400 hover:text-gray-200'}"
              data-tab="today"
            >Hoy</button>
            ${tomorrowAvailable ? `
            <button
              id="forecast-btn-tomorrow"
              type="button"
              class="forecast-tab-btn px-3 py-1 rounded-lg text-xs font-bold transition-all duration-200 ${this.activeForecastTab === 'tomorrow' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/30' : 'text-gray-400 hover:text-gray-200'}"
              data-tab="tomorrow"
            >Mañana</button>
            ` : `
            <span class="px-3 py-1 rounded-lg text-xs font-medium text-gray-600 cursor-not-allowed select-none" title="Aún no publicado">
              Mañana
            </span>
            `}
          </div>
        </div>

        <!-- Rate display -->
        <div id="forecast-rate-display" class="px-4 pb-4">
          ${this._renderForecastRateDisplay(activeDay, currency)}
        </div>

        ${!tomorrowAvailable ? `
        <div class="px-4 pb-3">
          <div class="flex items-center gap-2 rounded-xl px-3 py-2" style="background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.2)">
            <i data-lucide="clock" class="w-3.5 h-3.5 text-amber-400 flex-shrink-0"></i>
            <p class="text-[10px] text-amber-300/80 font-medium">La tasa del día siguiente se publica a las ${publicationTime}</p>
          </div>
        </div>
        ` : ''}
      </div>
    `;

    // Bind tab button events
    section.querySelectorAll('.forecast-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeForecastTab = btn.dataset.tab;
        this._renderForecast(forecast);
        if (window.lucide) window.lucide.createIcons();
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }

  _renderForecastRateDisplay(dayData, currency) {
    if (!dayData) return '';

    const formatVal = (v) => formatCurrency(v, currency, v < 10 ? 4 : 2);
    const parallelLabel = currency === 'VES' ? 'Paralelo' : currency === 'ARS' ? 'Blue' : 'Mercado';
    const isNextDay = dayData.isNextDay || false;

    const pubDate = dayData.publishedAt ? new Date(dayData.publishedAt) : null;
    const pubDateStr = pubDate ? pubDate.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) : '';

    return `
      <div class="flex items-end justify-between">
        <div>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-black text-white tracking-tight">
              ${formatVal(dayData.value)}
            </span>
            <span class="text-xs text-gray-400 font-semibold">${currency}</span>
          </div>
          ${dayData.parallel ? `
          <div class="flex items-center gap-1.5 mt-1.5">
            <span class="text-[10px] text-gray-500 font-medium">${parallelLabel}:</span>
            <span class="text-xs font-bold text-purple-300">${formatVal(dayData.parallel)}</span>
          </div>
          ` : ''}
          ${pubDateStr ? `<p class="text-[10px] text-gray-500 mt-1.5">Publicado: ${pubDateStr}</p>` : ''}
        </div>

        <div class="text-right">
          ${isNextDay ? `
          <div class="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5" style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25)">
            <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-400"></i>
            <span class="text-xs font-bold text-emerald-400">Publicado</span>
          </div>
          <p class="text-[10px] text-gray-500 mt-1">Vigente mañana</p>
          ` : `
          <div class="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5" style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.25)">
            <i data-lucide="circle-dot" class="w-3.5 h-3.5 text-cyan-400"></i>
            <span class="text-xs font-bold text-cyan-400">Vigente</span>
          </div>
          <p class="text-[10px] text-gray-500 mt-1">Tasa actual</p>
          `}
        </div>
      </div>
    `;
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
