import { mockEngine } from '../mockData.js';
import { formatCurrency, formatPercentage, formatTime } from '../utils/formatters.js';

export class DashboardView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.unsubscribe = null;
  }

  render() {
    const rates = mockEngine.getRates();
    this.container.innerHTML = `
      <div class="space-y-6 pb-24 animate-fade-in">
        <!-- Header status bar -->
        <div class="flex items-center justify-between bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-4">
          <div class="flex items-center space-x-3">
            <span class="relative flex h-3 w-3">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <p class="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Mercado En Vivo</p>
              <p class="text-xs text-gray-400">Actualizado: <span id="dash-last-update">${formatTime()}</span></p>
            </div>
          </div>
          <span class="text-xs font-medium px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            Venezuela 🇻🇪
          </span>
        </div>

        <!-- Banner Promocional / Alerta de Mercado -->
        <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-900/40 via-blue-900/30 to-purple-900/40 p-5 border border-cyan-500/20 glow-cyan">
          <div class="relative z-10">
            <span class="bg-cyan-500/20 text-cyan-300 text-xs px-2.5 py-0.5 rounded-full font-semibold">Resumen Diario</span>
            <h3 class="text-lg font-bold text-white mt-2">Dólar Paralelo alcanza los 917.50 VES</h3>
            <p class="text-xs text-gray-300 mt-1">Brecha respecto a la tasa oficial del BCV (785.07 VES) se ubica en 16.8%.</p>
          </div>
        </div>

        <!-- Sección Tasas Principales Venezuela -->
        <div>
          <div class="flex justify-between items-center mb-3">
            <h2 class="text-sm font-bold uppercase tracking-wider text-gray-400">Tasas Principales Venezuela</h2>
            <span class="text-xs text-cyan-400">VES</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${this.renderRateCard(rates.bcv)}
            ${this.renderRateCard(rates.paralelo)}
            ${this.renderRateCard(rates.euro)}
          </div>
        </div>

        <!-- Sección Cripto / Divisas Globales -->
        <div>
          <div class="flex justify-between items-center mb-3">
            <h2 class="text-sm font-bold uppercase tracking-wider text-gray-400">Global & Cripto P2P</h2>
            <span class="text-xs text-gray-400">P2P / Forex</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${this.renderRateCard(rates.usdt)}
            ${this.renderRateCard(rates.eurusd)}
          </div>
        </div>
      </div>
    `;

    this.subscribeToUpdates();
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  renderRateCard(rate) {
    const isPositive = rate.change >= 0;
    const badgeBg = isPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20';
    const trendIcon = isPositive ? 'trending-up' : 'trending-down';

    return `
      <div id="card-${rate.id}" class="glass-card-interactive rounded-2xl p-4 relative overflow-hidden transition-all duration-300">
        <div class="flex justify-between items-start">
          <div class="flex items-center space-x-3">
            <div class="p-2.5 rounded-xl bg-white/5 border border-white/10 text-cyan-400">
              <i data-lucide="${rate.icon}" class="w-5 h-5"></i>
            </div>
            <div>
              <h4 class="font-bold text-gray-100 text-sm">${rate.name}</h4>
              <p class="text-xs text-gray-400">${rate.code}</p>
            </div>
          </div>
          <span class="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeBg}">
            <i data-lucide="${trendIcon}" class="w-3.5 h-3.5"></i>
            <span>${formatPercentage(rate.change)}</span>
          </span>
        </div>

        <div class="mt-4 flex justify-between items-end">
          <div>
            <p class="text-2xl font-extrabold text-white tracking-tight" id="val-${rate.id}">
              ${formatCurrency(rate.value, rate.currency, rate.id === 'eurusd' ? 4 : 2)}
            </p>
          </div>
          <span class="text-[10px] text-gray-500 font-medium">Ref. Hoy</span>
        </div>
      </div>
    `;
  }

  subscribeToUpdates() {
    if (this.unsubscribe) this.unsubscribe();

    this.unsubscribe = mockEngine.subscribe((rates, updatedId, direction) => {
      const cardEl = document.getElementById(`card-${updatedId}`);
      const valEl = document.getElementById(`val-${updatedId}`);
      const lastUpdateEl = document.getElementById('dash-last-update');

      if (lastUpdateEl) lastUpdateEl.textContent = formatTime();

      if (cardEl && valEl && rates[updatedId]) {
        const rate = rates[updatedId];
        valEl.textContent = formatCurrency(rate.value, rate.currency, rate.id === 'eurusd' ? 4 : 2);
        
        // Animación de parpadeo de precio
        const animClass = direction === 'up' ? 'price-up' : 'price-down';
        cardEl.classList.add(animClass);
        setTimeout(() => cardEl.classList.remove(animClass), 1000);
      }
    });
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}
