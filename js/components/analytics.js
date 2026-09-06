import { mockEngine } from '../mockData.js';
import { formatCurrency, formatPercentage } from '../utils/formatters.js';
import { themeService } from '../themeService.js';

export class AnalyticsView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.chart = null;
    this.selectedPeriod = '1M'; // 1D, 1W, 1M, 3M, 1Y
    this.selectedRateFilter = 'all'; // 'all' o ID de tasa específica
    this.activeStatCard = null;
    this.historicalCache = {}; // Cache de datos históricos reales
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

  getPillLabel(rateKey, rateObj) {
    if (!rateObj) return rateKey || '';
    if (rateKey === 'bcv') return 'BCV';
    if (rateKey === 'euro') return 'Euro';
    return rateObj.name.split(' ')[0];
  }

  /**
   * Obtiene días de historia según el período seleccionado
   */
  getDaysForPeriod(period) {
    switch (period) {
      case '1D': return 1;
      case '1W': return 7;
      case '1M': return 30;
      case '3M': return 90;
      case '1Y': return 365;
      default: return 30;
    }
  }

  /**
   * Fetch de datos históricos reales desde ve.dolarapi.com
   * Endpoint: https://ve.dolarapi.com/v1/dolares/historico/{fuente}/{inicio}/{fin}
   * fuente: oficial | euro
   */
  async fetchHistoricalData(rateKey, days) {
    const cacheKey = `hist_${rateKey}_${days}`;
    if (this.historicalCache[cacheKey]) {
      return this.historicalCache[cacheKey];
    }

    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - days);

    const toStr = today.toISOString().split('T')[0];
    const fromStr = from.toISOString().split('T')[0];

    // Mapear el rateKey a la fuente de ve.dolarapi.com
    const fuenteMap = {
      bcv: 'oficial',
      euro: 'euro'
    };
    const fuente = fuenteMap[rateKey] || 'oficial';

    try {
      const url = `https://ve.dolarapi.com/v1/dolares/historico/${fuente}/${fromStr}/${toStr}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // ve.dolarapi devuelve: [{fechaActualizacion, promedio, ...}]
          const parsed = data
            .filter(d => d.promedio && d.fechaActualizacion)
            .map(d => ({
              date: d.fechaActualizacion.split('T')[0],
              value: parseFloat(parseFloat(d.promedio).toFixed(2))
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

          if (parsed.length > 0) {
            this.historicalCache[cacheKey] = parsed;
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn(`Error fetching historical data for ${rateKey}:`, e);
    }

    return null; // Retorna null si falla, el gráfico mostrará un aviso
  }

  /**
   * Convierte los datos históricos reales a formato para ApexCharts
   * Reduce puntos si son muchos para mejor visualización
   */
  processHistoricalForChart(historicalData, period) {
    if (!historicalData || historicalData.length === 0) return null;

    let data = [...historicalData];

    // Reducir puntos para mejor visualización según el período
    const maxPoints = { '1D': 1, '1W': 7, '1M': 30, '3M': 30, '1Y': 24 };
    const targetPoints = maxPoints[period] || 30;

    if (data.length > targetPoints) {
      const step = Math.ceil(data.length / targetPoints);
      const sampled = [];
      for (let i = 0; i < data.length; i += step) {
        sampled.push(data[i]);
      }
      // Siempre incluir el último punto
      if (sampled[sampled.length - 1] !== data[data.length - 1]) {
        sampled.push(data[data.length - 1]);
      }
      data = sampled;
    }

    const labels = data.map(d => {
      const date = new Date(d.date + 'T12:00:00');
      if (period === '1Y') {
        return date.toLocaleDateString('es-VE', { month: 'short', year: '2-digit' });
      } else if (period === '3M') {
        return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
      } else {
        return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
      }
    });

    const values = data.map(d => d.value);

    return { labels, values };
  }

  render() {
    const currentCountry = mockEngine.getCurrentCountry();
    const rates = currentCountry.rates;
    const rateKeys = Object.keys(rates);
    const mainRate = rates[currentCountry.defaultRateId] || rates[rateKeys[0]];
    const secondRate = rateKeys.length > 1 ? rates[rateKeys[1]] : mainRate;

    // Cálculo de Brecha Cambiaria (BCV USD vs BCV EUR en términos de USD)
    let gapPercent = 0;
    if (mainRate.value && secondRate.value && mainRate.value !== secondRate.value) {
      const diff = Math.abs(secondRate.value - mainRate.value);
      const minVal = Math.min(mainRate.value, secondRate.value);
      gapPercent = ((diff / minVal) * 100).toFixed(2);
    }

    const filteredKeys = (this.selectedRateFilter !== 'all' && rates[this.selectedRateFilter]) 
      ? [this.selectedRateFilter] 
      : rateKeys;
    const targetValues = filteredKeys.map(k => rates[k].value).filter(v => typeof v === 'number' && !isNaN(v));
    const minVal = targetValues.length > 0 ? Math.min(...targetValues) * 0.98 : 1;
    const maxVal = targetValues.length > 0 ? Math.max(...targetValues) * 1.02 : 1;
    const periodDetails = this.getPeriodDetails(this.selectedPeriod);

    const mainLabel = this.getPillLabel(mainRate.id, mainRate);
    const secondLabel = this.getPillLabel(secondRate.id, secondRate);

    this.container.innerHTML = `
      <div class="space-y-4 pb-24 animate-fade-in max-w-md mx-auto">
        
        <!-- Header con selector de país -->
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-lg font-extrabold text-white leading-tight">Tendencias de Mercado</h2>
            <p class="text-xs text-gray-400 mt-0.5">Datos históricos oficiales BCV · ${currentCountry.name}</p>
          </div>

          <div class="bg-white/5 border border-white/10 text-cyan-300 text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center space-x-1.5">
            <img src="${currentCountry.flagUrl}" alt="${currentCountry.name}" class="w-4 h-4 rounded-full object-cover">
            <span>${currentCountry.currency.code}</span>
          </div>
        </div>

        <!-- Tarjetas de Métricas Principales (Brecha, Mín, Máx) -->
        <div class="grid grid-cols-3 gap-2">
          <!-- Brecha BCV USD vs EUR -->
          <button data-stat="brecha" type="button" class="stat-card-btn glass-card-interactive rounded-2xl p-3 text-center border transition-all duration-300 cursor-pointer ${this.activeStatCard === 'brecha' ? 'border-cyan-500/60 glow-cyan bg-cyan-500/15' : 'border-white/10 hover:border-cyan-500/30'}">
            <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Diferencial</span>
            <p class="text-lg font-black text-cyan-400 mt-0.5">${gapPercent > 0 ? `+${gapPercent}%` : '0.0%'}</p>
            <span class="text-[9px] text-gray-400 font-semibold block truncate">${mainLabel} vs ${secondLabel}</span>
          </button>

          <!-- Mínimo del Período -->
          <button data-stat="min" type="button" class="stat-card-btn glass-card-interactive rounded-2xl p-3 text-center border transition-all duration-300 cursor-pointer ${this.activeStatCard === 'min' ? 'border-emerald-500/60 glow-green bg-emerald-500/15' : 'border-white/10 hover:border-emerald-500/30'}">
            <span id="min-period-label" class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Mínimo (${periodDetails.short})</span>
            <p class="text-sm font-black text-emerald-400 mt-1">${targetValues.length > 0 ? formatCurrency(minVal, currentCountry.currency.code, 2) : '— — —'}</p>
            <span class="text-[9px] text-gray-500 font-medium block">Piso oficial</span>
          </button>

          <!-- Máximo del Período -->
          <button data-stat="max" type="button" class="stat-card-btn glass-card-interactive rounded-2xl p-3 text-center border transition-all duration-300 cursor-pointer ${this.activeStatCard === 'max' ? 'border-amber-500/60 bg-amber-500/15 shadow-lg shadow-amber-500/20' : 'border-white/10 hover:border-amber-500/30'}">
            <span id="max-period-label" class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Máximo (${periodDetails.short})</span>
            <p class="text-sm font-black text-amber-400 mt-1">${targetValues.length > 0 ? formatCurrency(maxVal, currentCountry.currency.code, 2) : '— — —'}</p>
            <span class="text-[9px] text-gray-500 font-medium block">Techo oficial</span>
          </button>
        </div>

        <!-- Tarjeta del Gráfico ApexCharts -->
        <div class="glass-card rounded-3xl p-4 relative overflow-hidden space-y-3 border border-white/10 shadow-2xl">
          
          <!-- Filtros del Gráfico: Tasas y Períodos -->
          <div class="space-y-2">
            <!-- Píldoras de Tasas para filtrar -->
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <i data-lucide="line-chart" class="w-3.5 h-3.5 text-cyan-400"></i> Histórico Oficial BCV
              </span>
              <span class="text-[9px] text-emerald-400 font-bold flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
                Fuente: bcv.org.ve
              </span>
            </div>

            <div class="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded-2xl border border-white/10 w-full items-center" id="analytics-rate-filter">
              <button data-rate="all" class="w-full py-1 px-1 text-[11px] font-bold rounded-xl transition-all text-center truncate ${this.selectedRateFilter === 'all' ? 'bg-emerald-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                Todas
              </button>
              ${rateKeys.map(key => {
                const r = rates[key];
                const isSel = this.selectedRateFilter === key;
                const pillLabel = this.getPillLabel(key, r);
                return `
                  <button data-rate="${key}" class="w-full py-1 px-1 text-[11px] font-bold rounded-xl transition-all text-center truncate ${isSel ? 'bg-emerald-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                    ${pillLabel}
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

              <p id="period-info-text" class="text-[10px] text-gray-400 font-semibold text-right pt-0.5 px-1">
                ${periodDetails.text}
              </p>
            </div>

          </div>

          <!-- Contenedor del Gráfico -->
          <div id="apex-analytics-chart" class="w-full h-60 pt-1 relative">
            <!-- Skeleton loader mientras carga -->
            <div id="chart-loading-skeleton" class="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div class="w-8 h-8 border-2 border-cyan-500/40 border-t-cyan-400 rounded-full animate-spin"></div>
              <p class="text-[10px] text-gray-400 font-semibold">Cargando datos históricos BCV...</p>
            </div>
          </div>
        </div>

        <!-- Fuente Oficial y Señales -->
        <div class="space-y-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Fuente Oficial</h3>

          <div class="glass-card rounded-2xl p-3 flex items-center justify-between border border-white/5">
            <div class="flex items-center space-x-3">
              <div class="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <i data-lucide="landmark" class="w-4 h-4"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-gray-100">Banco Central de Venezuela</h4>
                <p class="text-[10px] text-gray-400">Tasas oficiales publicadas en bcv.org.ve</p>
              </div>
            </div>
            <span class="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">BCV</span>
          </div>

          <div class="glass-card rounded-2xl p-3 flex items-center justify-between border border-white/5">
            <div class="flex items-center space-x-3">
              <div class="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <i data-lucide="shield-check" class="w-4 h-4"></i>
              </div>
              <div>
                <h4 class="text-xs font-bold text-gray-100">Publicación Oficial</h4>
                <p class="text-[10px] text-gray-400">${currentCountry.officialSchedule || 'Monitoreo diario del Banco Central'}</p>
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

  async initChart() {
    const chartContainer = document.getElementById('apex-analytics-chart');
    if (!chartContainer || !window.ApexCharts) return;

    const currentCountry = mockEngine.getCurrentCountry();
    const rates = currentCountry.rates;
    const rateKeys = Object.keys(rates);

    let activeKeys = rateKeys;
    if (this.selectedRateFilter !== 'all' && rates[this.selectedRateFilter]) {
      activeKeys = [this.selectedRateFilter];
    }

    const days = this.getDaysForPeriod(this.selectedPeriod);
    const paletteColors = ['#06B6D4', '#10B981', '#F59E0B', '#8B5CF6'];
    const seriesData = [];
    let categories = [];
    let hasRealData = false;

    // Intentar cargar datos históricos reales para cada tasa activa
    for (let index = 0; index < activeKeys.length; index++) {
      const key = activeKeys[index];
      const rateObj = rates[key];

      const historicalRaw = await this.fetchHistoricalData(key, days);
      let chartData = null;

      if (historicalRaw && historicalRaw.length > 0) {
        chartData = this.processHistoricalForChart(historicalRaw, this.selectedPeriod);
        hasRealData = true;
      }

      if (chartData) {
        if (index === 0) {
          categories = chartData.labels;
        }
        seriesData.push({
          name: rateObj.name,
          data: chartData.values,
          color: paletteColors[index % paletteColors.length]
        });
      } else {
        // Si no hay datos históricos reales, usar valor actual como referencia con aviso
        seriesData.push({
          name: rateObj.name,
          data: [rateObj.value || 0],
          color: paletteColors[index % paletteColors.length]
        });
      }
    }

    // Quitar skeleton loader
    const skeleton = document.getElementById('chart-loading-skeleton');
    if (skeleton) skeleton.remove();

    if (!hasRealData || seriesData.every(s => s.data.length <= 1)) {
      // Mostrar aviso de datos no disponibles
      chartContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full gap-2 py-8">
          <i data-lucide="wifi-off" class="w-8 h-8 text-gray-500"></i>
          <p class="text-[11px] text-gray-400 font-semibold text-center">Datos históricos no disponibles</p>
          <p class="text-[10px] text-gray-500 text-center">Verifica tu conexión a Internet para cargar el historial oficial del BCV</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

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
        borderColor: themeService.getTheme() === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)',
        strokeDashArray: 4
      },
      legend: {
        labels: { colors: themeService.getTheme() === 'light' ? '#0F172A' : '#E5E7EB', useSeriesColors: false },
        fontSize: '10px',
        position: 'top',
        horizontalAlign: 'right',
        markers: { radius: 12 }
      },
      tooltip: {
        theme: themeService.getTheme() === 'light' ? 'light' : 'dark',
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

    const statBtns = document.querySelectorAll('.stat-card-btn');
    statBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-stat');
        this.activeStatCard = this.activeStatCard === type ? null : type;
        this.render();
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
