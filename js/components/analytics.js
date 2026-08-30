import { mockEngine } from '../mockData.js';
import { formatCurrency, formatPercentage } from '../utils/formatters.js';

export class AnalyticsView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.chart = null;
    this.selectedPeriod = '1M'; // 1D, 1W, 1M, 3M, 1Y
    this.selectedRateFilter = 'all'; // 'all' o ID de tasa específica
  }

  getPeriodDetails(period) {
    const map = {
      '1D': { short: 'Hoy', text: 'Últimas 24 horas' },
      '1W': { short: '7 Días', text: 'Últimos 7 días' },
      '1M': { short: '30 Días', text: 'Últimos 30 días' },
      '3M': { short: '90 Días', text: 'Últimos 90 días' },
      '1Y': { short: '1 Año', text: 'Últimos 365 días' }
    };
    return map[period] || map['1M'];
  }

  render() {
    const currentCountry = mockEngine.getCurrentCountry();
    const rates = currentCountry.rates;
    const rateKeys = Object.keys(rates);
    const mainRate = rates[currentCountry.defaultRateId] || rates[rateKeys[0]];
    const secondRate = rateKeys.length > 1 ? rates[rateKeys[1]] : mainRate;

    // Cálculo de Brecha Cambiaria
    let gapPercent = 0;
    if (mainRate.value && secondRate.value && mainRate.value !== secondRate.value) {
      const diff = Math.abs(secondRate.value - mainRate.value);
      const minVal = Math.min(mainRate.value, secondRate.value);
      gapPercent = ((diff / minVal) * 100).toFixed(2);
    }

    // Cálculo Mínimo y Máximo simulado del período
    const allValues = rateKeys.map(k => rates[k].value);
    const minVal = Math.min(...allValues) * 0.98;
    const maxVal = Math.max(...allValues) * 1.02;
    const periodDetails = this.getPeriodDetails(this.selectedPeriod);

    this.container.innerHTML = `
      <div class="space-y-4 pb-24 animate-fade-in max-w-md mx-auto">
        
        <!-- Header con selector de país -->
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-lg font-extrabold text-white leading-tight">Tendencias de Mercado</h2>
            <p class="text-xs text-gray-400 mt-0.5">Comportamiento financiero en ${currentCountry.name}</p>
          </div>

          <button type="button" class="country-selector-trigger bg-white/5 border border-white/10 text-cyan-300 text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center space-x-1.5 active:scale-95 transition-all cursor-pointer">
            <img src="${currentCountry.flagUrl}" alt="${currentCountry.name}" class="w-4 h-4 rounded-full object-cover">
            <span>${currentCountry.currency.code}</span>
            <i data-lucide="chevron-down" class="w-3 h-3 text-cyan-400"></i>
          </button>
        </div>

        <!-- Tarjetas de Métricas Principales (Brecha, Mín, Máx) -->
        <div class="grid grid-cols-3 gap-2">
          <!-- Brecha Cambiaria -->
          <div class="glass-card rounded-2xl p-3 text-center border border-cyan-500/20 glow-cyan">
            <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Brecha Tasa</span>
            <p class="text-lg font-black text-cyan-400 mt-0.5">${gapPercent > 0 ? `+${gapPercent}%` : '0.0%'}</p>
            <span class="text-[9px] text-gray-400 font-semibold block truncate">${mainRate.name.split(' ')[0]} vs ${secondRate.name.split(' ')[0]}</span>
          </div>

          <!-- Mínimo del Período -->
          <div class="glass-card rounded-2xl p-3 text-center border border-white/10">
            <span id="min-period-label" class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Mínimo (${periodDetails.short})</span>
            <p class="text-sm font-black text-emerald-400 mt-1">${formatCurrency(minVal, currentCountry.currency.code, minVal < 10 ? 4 : 2)}</p>
            <span class="text-[9px] text-gray-500 font-medium block">Piso estimado</span>
          </div>

          <!-- Máximo del Período -->
          <div class="glass-card rounded-2xl p-3 text-center border border-white/10">
            <span id="max-period-label" class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Máximo (${periodDetails.short})</span>
            <p class="text-sm font-black text-amber-400 mt-1">${formatCurrency(maxVal, currentCountry.currency.code, maxVal < 10 ? 4 : 2)}</p>
            <span class="text-[9px] text-gray-500 font-medium block">Techo estimado</span>
          </div>
        </div>

        <!-- Tarjeta del Gráfico ApexCharts -->
        <div class="glass-card rounded-3xl p-4 relative overflow-hidden space-y-3 border border-white/10 shadow-2xl">
          
          <!-- Filtros del Gráfico: Tasas y Períodos -->
          <div class="space-y-2">
            <!-- Píldoras de Tasas para filtrar -->
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <i data-lucide="line-chart" class="w-3.5 h-3.5 text-cyan-400"></i> Histórico de Tasas
              </span>
              <span class="text-[10px] text-cyan-400 font-bold">${currentCountry.currency.code}</span>
            </div>

            <div class="flex bg-black/40 p-1 rounded-xl border border-white/10 overflow-x-auto no-scrollbar space-x-1" id="analytics-rate-filter">
              <button data-rate="all" class="px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap ${this.selectedRateFilter === 'all' ? 'bg-emerald-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                Todas
              </button>
              ${rateKeys.map(key => {
                const r = rates[key];
                const isSel = this.selectedRateFilter === key;
                const pillName = key === 'usdt' ? 'USDT' : r.name.split(' ')[0];
                return `
                  <button data-rate="${key}" class="px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap ${isSel ? 'bg-emerald-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                    ${pillName}
                  </button>
                `;
              }).join('')}
            </div>

            <!-- Selector de Período Temporal -->
            <div class="space-y-1.5 pt-1">
              <div class="flex bg-black/40 p-1 rounded-xl border border-white/10 justify-between" id="period-selector">
                ${[
                  { code: '1D', name: '1D (Hoy)' },
                  { code: '1W', name: '1W (Semana)' },
                  { code: '1M', name: '1M (Mes)' },
                  { code: '3M', name: '3M (Trimestre)' },
                  { code: '1Y', name: '1Y (Año)' }
                ].map(p => `
                  <button data-period="${p.code}" title="${p.name}" class="flex-1 py-1.5 text-[11px] font-bold rounded-lg text-center transition-all ${this.selectedPeriod === p.code ? 'bg-cyan-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                    ${p.code}
                  </button>
                `).join('')}
              </div>

              <!-- Texto Explicativo Simple sin contenedor ni iconos -->
              <p id="period-info-text" class="text-[10px] text-gray-400 font-semibold text-right pt-0.5 px-1">
                ${periodDetails.text}
              </p>
            </div>

          </div>

          <!-- Contenedor del Gráfico -->
          <div id="apex-analytics-chart" class="w-full h-60 pt-1"></div>
        </div>

        <!-- Indicadores y Señales de Mercado -->
        <div class="space-y-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Señales de Volatilidad</h3>

          <div class="glass-card rounded-2xl p-3 flex items-center justify-between border border-white/5">
            <div class="flex items-center space-x-3">
              <div class="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <i data-lucide="trending-up" class="w-4 h-4"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-gray-100">Tendencia General</h4>
                <p class="text-[10px] text-gray-400">Variación estable en los últimos 30 días.</p>
              </div>
            </div>
            <span class="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">Estable</span>
          </div>

          <div class="glass-card rounded-2xl p-3 flex items-center justify-between border border-white/5">
            <div class="flex items-center space-x-3">
              <div class="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <i data-lucide="shield-check" class="w-4 h-4"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-gray-100">Emisión Bancaria Oficial</h4>
                <p class="text-[10px] text-gray-400">${currentCountry.officialSchedule || 'Monitoreo diario de Banco Central'}</p>
              </div>
            </div>
            <span class="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">Oficial</span>
          </div>
        </div>

      </div>
    `;

    this.initChart();
    this.attachEvents();
    if (window.lucide) window.lucide.createIcons();
  }

  initChart() {
    const chartContainer = document.getElementById('apex-analytics-chart');
    if (!chartContainer || !window.ApexCharts) return;

    const currentCountry = mockEngine.getCurrentCountry();
    const rates = currentCountry.rates;
    const rateKeys = Object.keys(rates);

    let activeKeys = rateKeys;
    if (this.selectedRateFilter !== 'all' && rates[this.selectedRateFilter]) {
      activeKeys = [this.selectedRateFilter];
    }

    const paletteColors = ['#06B6D4', '#10B981', '#F59E0B', '#8B5CF6'];
    const seriesData = [];

    activeKeys.forEach((key, index) => {
      const rateObj = rates[key];
      const data = this.generateMockChartData(this.selectedPeriod, rateObj.value);
      seriesData.push({
        name: rateObj.name,
        data: data.values,
        color: paletteColors[index % paletteColors.length],
        labels: data.labels
      });
    });

    const categories = seriesData[0] ? seriesData[0].labels : [];

    const options = {
      series: seriesData.map(s => ({ name: s.name, data: s.data })),
      chart: {
        type: 'area',
        height: 220,
        toolbar: { show: false },
        background: 'transparent',
        sparkline: { enabled: false },
        animations: { enabled: true, speed: 400 }
      },
      colors: seriesData.map(s => s.color),
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.4,
          opacityTo: 0.05,
          stops: [0, 100]
        }
      },
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 2.5 },
      xaxis: {
        categories: categories,
        labels: { style: { colors: '#9CA3AF', fontSize: '9px', fontWeight: 600 } },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: {
          style: { colors: '#9CA3AF', fontSize: '9px', fontWeight: 600 },
          formatter: (val) => val.toFixed(val < 10 ? 2 : 0)
        }
      },
      grid: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        strokeDashArray: 4
      },
      legend: {
        labels: { colors: '#E5E7EB', useSeriesColors: false },
        fontSize: '10px',
        position: 'top',
        horizontalAlign: 'right',
        markers: { radius: 12 }
      },
      tooltip: {
        theme: 'dark',
        x: { show: true },
        y: {
          formatter: (val) => `${val.toLocaleString('es-VE')} ${currentCountry.currency.code}`
        }
      }
    };

    if (this.chart) {
      this.chart.destroy();
    }
    this.chart = new ApexCharts(chartContainer, options);
    this.chart.render();
  }

  generateMockChartData(period, baseValue) {
    let count = 6;
    let labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Hoy'];

    if (period === '1D') {
      count = 5;
      labels = ['09:00', '11:00', '13:00', '15:00', '17:00'];
    } else if (period === '1W') {
      count = 7;
      labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    } else if (period === '1M') {
      count = 6;
      labels = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5', 'Hoy'];
    } else if (period === '3M') {
      count = 6;
      labels = ['Hace 3m', 'Hace 2m', 'Hace 1m', 'Sem 2', 'Sem 4', 'Hoy'];
    } else if (period === '1Y') {
      count = 6;
      labels = ['Ene', 'Mar', 'May', 'Jul', 'Sep', 'Hoy'];
    }

    const variance = baseValue * 0.004;
    const values = Array.from({ length: count }, (_, i) => {
      const offset = (i - count + 1) * variance;
      const noise = (Math.random() - 0.5) * (variance * 0.2);
      const val = Math.max(0.01, baseValue + offset + noise);
      return parseFloat(val.toFixed(baseValue < 10 ? 4 : 2));
    });

    return { labels, values };
  }

  attachEvents() {
    const periodBtns = document.querySelectorAll('#period-selector button');
    periodBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedPeriod = btn.getAttribute('data-period');
        const details = this.getPeriodDetails(this.selectedPeriod);

        periodBtns.forEach(b => {
          const isSel = b.getAttribute('data-period') === this.selectedPeriod;
          b.className = `flex-1 py-1.5 text-[11px] font-bold rounded-lg text-center transition-all ${isSel ? 'bg-cyan-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}`;
        });

        const infoText = document.getElementById('period-info-text');
        if (infoText) infoText.textContent = details.text;

        const minLabel = document.getElementById('min-period-label');
        if (minLabel) minLabel.textContent = `Mínimo (${details.short})`;

        const maxLabel = document.getElementById('max-period-label');
        if (maxLabel) maxLabel.textContent = `Máximo (${details.short})`;

        this.initChart();
      });
    });

    const rateFilterBtns = document.querySelectorAll('#analytics-rate-filter button');
    rateFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedRateFilter = btn.getAttribute('data-rate');
        rateFilterBtns.forEach(b => {
          const isSel = b.getAttribute('data-rate') === this.selectedRateFilter;
          b.className = `px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap ${isSel ? 'bg-emerald-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}`;
        });
        this.initChart();
      });
    });
  }

  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}
