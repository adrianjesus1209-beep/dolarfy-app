import { mockEngine } from '../mockData.js';
import { formatCurrency, formatPercentage } from '../utils/formatters.js';
import { themeService } from '../themeService.js';
import { fetchWithTimeout } from '../apiService.js';

export class AnalyticsView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.chart = null;
    this.selectedPeriod = '1M'; // 1W, 1M, 3M, 1Y
    this.selectedRateFilter = 'all'; // 'all' o ID de tasa específica
    this.historicalCache = {}; // Cache de datos históricos reales
    this.unsubscribe = null;
  }

  getPeriodDetails(period) {
    const map = {
      '1W': { short: '7 Días', text: 'Últimos 7 días' },
      '1M': { short: '30 Días', text: 'Últimos 30 días' },
      '3M': { short: '90 Días', text: 'Últimos 90 días' },
      '1Y': { short: '1 Año', text: 'Últimos 365 días' }
    };
    return map[period] || map['1M'];
  }

  getPillLabel(rateKey, rateObj) {
    if (!rateObj) return rateKey || '';
    if (rateKey === 'bcv') return 'BCV';
    if (rateKey === 'euro') return 'Euro';
    if (rateKey === 'paralelo' || rateObj.id === 'paralelo') return 'USDT';
    return rateObj.name.split(' ')[0];
  }

  getDaysForPeriod(period) {
    switch (period) {
      case '1W': return 7;
      case '3M': return 90;
      case '1Y': return 365;
      default: return 30;
    }
  }

  async fetchHistoricalData(rateKey, days) {
    const endpointMap = {
      bcv: 'https://ve.dolarapi.com/v1/historicos/dolares/oficial',
      paralelo: 'https://ve.dolarapi.com/v1/historicos/dolares/paralelo',
      euro: 'https://ve.dolarapi.com/v1/historicos/euros'
    };
    const fuenteMap = { bcv: 'oficial', paralelo: 'paralelo', euro: 'oficial' };
    const url = endpointMap[rateKey];
    const fuente = fuenteMap[rateKey];
    if (!url || !fuente) return null;

    if (this.historicalCache[rateKey]) {
      return this._filterHistorical(this.historicalCache[rateKey], days);
    }

    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;

      const parsed = data
        .filter(d => d && d.fuente === fuente && d.promedio && d.fecha)
        .map(d => ({
          date: String(d.fecha).split('T')[0],
          value: parseFloat(parseFloat(d.promedio).toFixed(2))
        }))
        .filter(d => d.date && typeof d.value === 'number' && !isNaN(d.value))
        .sort((a, b) => a.date.localeCompare(b.date));

      if (parsed.length === 0) return null;

      this.historicalCache[rateKey] = parsed;
      return this._filterHistorical(parsed, days);
    } catch (e) {
      console.warn(`Error al cargar histórico para ${rateKey}:`, e);
    }

    return null;
  }

  _filterHistorical(series, days) {
    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - days);
    const fromStr = from.toISOString().split('T')[0];
    const toStr = today.toISOString().split('T')[0];
    return series.filter(d => d.date >= fromStr && d.date <= toStr);
  }

  processHistoricalForChart(historicalData, period) {
    if (!historicalData || historicalData.length === 0) return null;

    let data = [...historicalData];
    const maxPoints = { '1W': 7, '1M': 30, '3M': 30, '1Y': 24 };
    const targetPoints = maxPoints[period] || 30;

    if (data.length > targetPoints) {
      const step = Math.ceil(data.length / targetPoints);
      const sampled = [];
      for (let i = 0; i < data.length; i += step) {
        sampled.push(data[i]);
      }
      if (sampled[sampled.length - 1] !== data[data.length - 1]) {
        sampled.push(data[data.length - 1]);
      }
      data = sampled;
    }

    const labels = data.map(d => {
      const date = new Date(d.date + 'T12:00:00');
      return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
    });

    const values = data.map(d => d.value);
    return { labels, values, rawData: data };
  }

  render() {
    const currentCountry = mockEngine.getCurrentCountry();
    const rates = currentCountry.rates;
    const rateKeys = Object.keys(rates).filter(k => k !== '_meta');

    // Brecha cambiaria real del mercado venezolano: Dólar Paralelo vs BCV Oficial
    const bcvRate = rates.bcv;
    const paraleloRate = rates.paralelo;
    let gapPercent = 0;
    if (
      bcvRate && paraleloRate &&
      typeof bcvRate.value === 'number' && typeof paraleloRate.value === 'number' &&
      bcvRate.value > 0 && paraleloRate.value > 0
    ) {
      gapPercent = ((paraleloRate.value / bcvRate.value) - 1) * 100;
    }

    const periodDetails = this.getPeriodDetails(this.selectedPeriod);

    this.container.innerHTML = `
      <div class="space-y-4 pb-24 animate-fade-in max-w-md mx-auto">
        
        <!-- Header con indicador de país -->
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-lg font-extrabold text-white leading-tight flex items-center gap-2">
              <span>Tendencias de Mercado</span>
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
            </h2>
            <p class="text-xs text-gray-400 mt-0.5">Histórico y variaciones oficiales · ${currentCountry.name}</p>
          </div>

          <div class="bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold px-3 py-1.5 rounded-full flex items-center space-x-1.5 shadow-sm">
            <img src="${currentCountry.flagUrl}" alt="${currentCountry.name}" class="w-4 h-4 rounded-full object-cover">
            <span>${currentCountry.currency.code}</span>
          </div>
        </div>

        <!-- Tarjetas de Métricas Principales (Brecha, Mínimo, Máximo, Variación) -->
        <div class="grid grid-cols-3 gap-2">
          <!-- Brecha BCV vs Paralelo -->
          <div class="glass-card rounded-2xl p-3 text-center border border-white/10 hover:border-cyan-500/30 transition-all">
            <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Brecha Oficial/P2P</span>
            <p class="text-lg font-black text-cyan-400 mt-0.5">${gapPercent > 0 ? `+${gapPercent.toFixed(2)}%` : '0.00%'}</p>
            <span class="text-[9px] text-gray-400 font-semibold block truncate">Diferencia BCV vs USDT</span>
          </div>

          <!-- Mínimo del Período -->
          <div class="glass-card rounded-2xl p-3 text-center border border-white/10 hover:border-emerald-500/30 transition-all">
            <span id="min-period-label" class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Piso (${periodDetails.short})</span>
            <p id="stat-min-value" class="text-sm font-black text-emerald-400 mt-1">— — —</p>
            <span class="text-[9px] text-gray-500 font-medium block">Valor mínimo</span>
          </div>

          <!-- Máximo del Período -->
          <div class="glass-card rounded-2xl p-3 text-center border border-white/10 hover:border-amber-500/30 transition-all">
            <span id="max-period-label" class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Techo (${periodDetails.short})</span>
            <p id="stat-max-value" class="text-sm font-black text-amber-400 mt-1">— — —</p>
            <span class="text-[9px] text-gray-500 font-medium block">Valor máximo</span>
          </div>
        </div>

        <!-- Tarjeta Principal del Gráfico ApexCharts -->
        <div class="glass-card rounded-3xl p-4 relative overflow-hidden space-y-3 border border-white/10 shadow-2xl bg-[#111622]/95">
          
          <!-- Filtros del Gráfico: Tasas y Períodos -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <i data-lucide="line-chart" class="w-3.5 h-3.5 text-cyan-400"></i> Comportamiento Histórico
              </span>
              <span id="period-info-text" class="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                ${periodDetails.text}
              </span>
            </div>

            <!-- Píldoras de Tasas -->
            <div class="grid grid-cols-${Math.min(rateKeys.length + 1, 4)} gap-1 bg-black/40 p-1 rounded-2xl border border-white/10 w-full items-center" id="analytics-rate-filter">
              <button data-rate="all" class="w-full py-1.5 px-1 text-[11px] font-bold rounded-xl transition-all text-center truncate cursor-pointer ${this.selectedRateFilter === 'all' ? 'bg-cyan-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                Todas
              </button>
              ${rateKeys.map(key => {
                const r = rates[key];
                const isSel = this.selectedRateFilter === key;
                const pillLabel = this.getPillLabel(key, r);
                return `
                  <button data-rate="${key}" class="w-full py-1.5 px-1 text-[11px] font-bold rounded-xl transition-all text-center truncate cursor-pointer ${isSel ? 'bg-cyan-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                    ${pillLabel}
                  </button>
                `;
              }).join('')}
            </div>

            <!-- Selector de Período Temporal -->
            <div class="bg-black/40 p-1 rounded-2xl border border-white/10 flex justify-between gap-1" id="period-selector">
              ${[
                { code: '1W', name: '7 Días' },
                { code: '1M', name: '30 Días' },
                { code: '3M', name: '90 Días' },
                { code: '1Y', name: '1 Año' }
              ].map(p => `
                <button data-period="${p.code}" title="${p.name}" class="flex-1 py-1.5 text-[11px] font-bold rounded-xl text-center transition-all cursor-pointer ${this.selectedPeriod === p.code ? 'bg-emerald-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                  ${p.code}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Contenedor del Gráfico -->
          <div id="apex-analytics-chart" class="w-full h-64 pt-1 relative">
            <div id="chart-loading-skeleton" class="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div class="w-8 h-8 border-2 border-cyan-500/40 border-t-cyan-400 rounded-full animate-spin"></div>
              <p class="text-[10px] text-gray-400 font-semibold">Cargando datos históricos del BCV...</p>
            </div>
          </div>
        </div>

      </div>
    `;

    this.initChart();
    this.attachEvents();
    this.subscribeToUpdates();
    if (window.lucide) window.lucide.createIcons();
  }

  async initChart() {
    const chartContainer = document.getElementById('apex-analytics-chart');
    if (!chartContainer || !window.ApexCharts) return;

    const currentCountry = mockEngine.getCurrentCountry();
    const rates = currentCountry.rates;
    const rateKeys = Object.keys(rates).filter(k => k !== '_meta');

    let activeKeys = rateKeys;
    if (this.selectedRateFilter !== 'all' && rates[this.selectedRateFilter]) {
      activeKeys = [this.selectedRateFilter];
    }

    const days = this.getDaysForPeriod(this.selectedPeriod);
    const colorMap = {
      bcv: '#06B6D4',      // Cyan para Dólar BCV
      paralelo: '#F59E0B', // Amarillo para Binance P2P
      euro: '#10B981'      // Esmeralda para Euro BCV
    };

    const seriesData = [];
    let categories = [];
    let hasRealData = false;
    let bcvHistoricalPoints = null;

    const rangeKey = this.selectedRateFilter !== 'all' && rates[this.selectedRateFilter]
      ? this.selectedRateFilter
      : 'bcv';
    let realMin = Infinity;
    let realMax = -Infinity;
    let hasRangeData = false;

    for (let index = 0; index < activeKeys.length; index++) {
      const key = activeKeys[index];
      const rateObj = rates[key];

      const historicalRaw = await this.fetchHistoricalData(key, days);
      let chartData = null;

      if (historicalRaw && historicalRaw.length > 0) {
        chartData = this.processHistoricalForChart(historicalRaw, this.selectedPeriod);
        hasRealData = true;
        if (key === 'bcv') bcvHistoricalPoints = historicalRaw;

        if (key === rangeKey) {
          for (const point of historicalRaw) {
            if (typeof point.value === 'number' && !isNaN(point.value)) {
              if (point.value < realMin) realMin = point.value;
              if (point.value > realMax) realMax = point.value;
              hasRangeData = true;
            }
          }
        }
      }

      if (chartData) {
        if (categories.length === 0) {
          categories = chartData.labels;
        }
        seriesData.push({
          name: rateObj.name,
          data: chartData.values,
          color: colorMap[key] || '#8B5CF6'
        });
      } else {
        seriesData.push({
          name: rateObj.name,
          data: [rateObj.value || 0],
          color: colorMap[key] || '#8B5CF6'
        });
      }
    }

    const skeleton = document.getElementById('chart-loading-skeleton');
    if (skeleton) skeleton.remove();

    if (!hasRealData || seriesData.every(s => s.data.length <= 1)) {
      chartContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full gap-2 py-8">
          <i data-lucide="wifi-off" class="w-8 h-8 text-gray-500"></i>
          <p class="text-[11px] text-gray-400 font-semibold text-center">Datos históricos no disponibles</p>
          <p class="text-[10px] text-gray-500 text-center">Conéctate a Internet para cargar el gráfico histórico oficial del BCV</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // Actualizar Mínimo y Máximo
    const minStatEl = document.getElementById('stat-min-value');
    const maxStatEl = document.getElementById('stat-max-value');
    if (minStatEl && maxStatEl) {
      if (hasRangeData && realMin !== Infinity && realMax !== -Infinity) {
        minStatEl.textContent = formatCurrency(realMin, currentCountry.currency.code, 2);
        maxStatEl.textContent = formatCurrency(realMax, currentCountry.currency.code, 2);
      } else {
        minStatEl.textContent = '— — —';
        maxStatEl.textContent = '— — —';
      }
    }

    const options = {
      series: seriesData.map(s => ({ name: s.name, data: s.data })),
      chart: {
        type: 'area',
        height: 230,
        toolbar: { show: false },
        background: 'transparent',
        sparkline: { enabled: false },
        animations: { enabled: true, speed: 450 }
      },
      colors: seriesData.map(s => s.color),
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.45,
          opacityTo: 0.05,
          stops: [0, 100]
        }
      },
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 2.5 },
      xaxis: {
        categories: categories,
        labels: { style: { colors: themeService.getTheme() === 'light' ? '#64748B' : '#9CA3AF', fontSize: '9px', fontWeight: 600 } },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: {
          style: { colors: themeService.getTheme() === 'light' ? '#64748B' : '#9CA3AF', fontSize: '9px', fontWeight: 600 },
          formatter: (val) => val.toFixed(val < 10 ? 2 : 0)
        }
      },
      grid: {
        borderColor: themeService.getTheme() === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.06)',
        strokeDashArray: 4
      },
      legend: {
        labels: { colors: themeService.getTheme() === 'light' ? '#0F172A' : '#E5E7EB' },
        fontSize: '10px',
        position: 'top',
        horizontalAlign: 'right',
        markers: { radius: 12 }
      },
      tooltip: {
        theme: themeService.getTheme() === 'light' ? 'light' : 'dark',
        x: { show: true },
        y: {
          formatter: (val) => formatCurrency(val, currentCountry.currency.code, val < 10 ? 4 : 2)
        }
      }
    };

    if (this.chart) {
      this.chart.destroy();
    }
    this.chart = new ApexCharts(chartContainer, options);
    this.chart.render();
  }

  attachEvents() {
    const periodBtns = document.querySelectorAll('#period-selector button');
    periodBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedPeriod = btn.getAttribute('data-period');
        const details = this.getPeriodDetails(this.selectedPeriod);

        periodBtns.forEach(b => {
          const isSel = b.getAttribute('data-period') === this.selectedPeriod;
          b.className = `flex-1 py-1.5 text-[11px] font-bold rounded-xl text-center transition-all cursor-pointer ${isSel ? 'bg-emerald-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}`;
        });

        const infoText = document.getElementById('period-info-text');
        if (infoText) infoText.textContent = details.text;

        const minLabel = document.getElementById('min-period-label');
        if (minLabel) minLabel.textContent = `Piso (${details.short})`;

        const maxLabel = document.getElementById('max-period-label');
        if (maxLabel) maxLabel.textContent = `Techo (${details.short})`;

        this.initChart();
      });
    });

    const rateFilterBtns = document.querySelectorAll('#analytics-rate-filter button');
    rateFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedRateFilter = btn.getAttribute('data-rate');
        rateFilterBtns.forEach(b => {
          const isSel = b.getAttribute('data-rate') === this.selectedRateFilter;
          b.className = `w-full py-1.5 px-1 text-[11px] font-bold rounded-xl transition-all text-center truncate cursor-pointer ${isSel ? 'bg-cyan-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}`;
        });
        this.initChart();
      });
    });
  }

  subscribeToUpdates() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = mockEngine.subscribe((rates, updatedId, action) => {
      if (action === 'rates_refreshed') {
        this.render();
      }
    });
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}

