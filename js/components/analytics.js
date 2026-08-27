import { mockEngine } from '../mockData.js';

export class AnalyticsView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.chart = null;
    this.selectedPeriod = '1M';
  }

  render() {
    const currentCountry = mockEngine.getCurrentCountry();
    const rates = currentCountry.rates;
    const rateKeys = Object.keys(rates);
    const firstRate = rates[rateKeys[0]];
    const secondRate = rateKeys.length > 1 ? rates[rateKeys[1]] : firstRate;

    this.container.innerHTML = `
      <div class="space-y-6 pb-24 animate-fade-in">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-xl font-extrabold text-white">Tendencias y Analítica</h2>
            <p class="text-xs text-gray-400 mt-1">Histórico de tasas para ${currentCountry.name} ${currentCountry.flag}</p>
          </div>
          <span class="bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-bold px-2.5 py-1 rounded-xl">
            ${currentCountry.currency.code}
          </span>
        </div>

        <!-- Chart Container Card -->
        <div class="glass-card rounded-3xl p-4 relative overflow-hidden">
          <div class="flex justify-between items-center mb-4">
            <div>
              <span class="text-xs text-gray-400 font-semibold uppercase">Comportamiento</span>
              <h3 class="text-sm font-bold text-white">${firstRate.name.split(' ')[0]} vs ${secondRate.name.split(' ')[0]}</h3>
            </div>
            <!-- Time period selector -->
            <div class="flex bg-black/40 p-1 rounded-xl border border-white/10" id="period-selector">
              <button data-period="1D" class="px-2.5 py-1 text-xs font-bold rounded-lg ${this.selectedPeriod === '1D' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:text-white'}">1D</button>
              <button data-period="1W" class="px-2.5 py-1 text-xs font-bold rounded-lg ${this.selectedPeriod === '1W' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:text-white'}">1W</button>
              <button data-period="1M" class="px-2.5 py-1 text-xs font-bold rounded-lg ${this.selectedPeriod === '1M' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:text-white'}">1M</button>
              <button data-period="1Y" class="px-2.5 py-1 text-xs font-bold rounded-lg ${this.selectedPeriod === '1Y' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:text-white'}">1Y</button>
            </div>
          </div>

          <!-- Chart Render Target -->
          <div id="apex-analytics-chart" class="w-full h-64"></div>
        </div>

        <!-- Proyecciones e Indicadores Inteligentes -->
        <div>
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Señales de Mercado</h3>
          <div class="space-y-3">
            <div class="glass-card rounded-2xl p-4 flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div class="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <i data-lucide="trending-up" class="w-5 h-5"></i>
                </div>
                <div>
                  <h4 class="text-sm font-bold text-gray-100">Tendencia Estable en ${currentCountry.name}</h4>
                  <p class="text-xs text-gray-400">Variación proyectada moderada (+0.5% mensual).</p>
                </div>
              </div>
              <span class="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">+0.5%</span>
            </div>

            <div class="glass-card rounded-2xl p-4 flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div class="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <i data-lucide="shield-check" class="w-5 h-5"></i>
                </div>
                <div>
                  <h4 class="text-sm font-bold text-gray-100">Supervisión Financiera Local</h4>
                  <p class="text-xs text-gray-400">Monitoreo continuo de liquidez y divisas.</p>
                </div>
              </div>
              <span class="text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full">Monitoreado</span>
            </div>
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
    const r1 = rates[rateKeys[0]];
    const r2 = rateKeys.length > 1 ? rates[rateKeys[1]] : r1;

    const dataSeries = this.generateMockChartData(this.selectedPeriod, r1.value, r2.value);

    const options = {
      series: [
        { name: r1.name, data: dataSeries.series1 },
        { name: r2.name, data: dataSeries.series2 }
      ],
      chart: {
        type: 'area',
        height: 250,
        toolbar: { show: false },
        background: 'transparent',
        sparkline: { enabled: false }
      },
      colors: ['#06B6D4', '#10B981'],
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
        categories: dataSeries.labels,
        labels: { style: { colors: '#9CA3AF', fontSize: '10px' } },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: { style: { colors: '#9CA3AF', fontSize: '10px' } }
      },
      grid: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        strokeDashArray: 4
      },
      legend: {
        labels: { colors: '#E5E7EB' },
        position: 'top',
        horizontalAlign: 'right'
      },
      tooltip: {
        theme: 'dark'
      }
    };

    if (this.chart) {
      this.chart.destroy();
    }
    this.chart = new ApexCharts(chartContainer, options);
    this.chart.render();
  }

  generateMockChartData(period, base1, base2) {
    let count = 7;
    let labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    if (period === '1D') {
      count = 6;
      labels = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];
    } else if (period === '1M') {
      count = 6;
      labels = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5', 'Sem 6'];
    } else if (period === '1Y') {
      count = 6;
      labels = ['Ene', 'Mar', 'May', 'Jul', 'Sep', 'Nov'];
    }

    const step1 = base1 * 0.002;
    const step2 = base2 * 0.003;

    const series1 = Array.from({ length: count }, (_, i) => parseFloat((base1 - (count - i) * step1).toFixed(base1 < 10 ? 4 : 2)));
    const series2 = Array.from({ length: count }, (_, i) => parseFloat((base2 - (count - i) * step2).toFixed(base2 < 10 ? 4 : 2)));

    return { labels, series1, series2 };
  }

  attachEvents() {
    const btns = document.querySelectorAll('#period-selector button');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedPeriod = btn.getAttribute('data-period');
        btns.forEach(b => {
          b.className = `px-2.5 py-1 text-xs font-bold rounded-lg ${b.getAttribute('data-period') === this.selectedPeriod ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:text-white'}`;
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
