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
    if (rateKey === 'paralelo' || rateObj.id === 'paralelo') return 'Paralelo';
    return rateObj.name.split(' ')[0];
  }

  /**
   * Obtiene días de historia según el período seleccionado
   */
  getDaysForPeriod(period) {
    switch (period) {
      case '1W': return 7;
      case '3M': return 90;
      case '1Y': return 365;
      default: return 30;
    }
  }

  /**
   * Fetch de datos históricos reales desde ve.dolarapi.com (1 punto/día hábil)
   * Endpoints: /v1/historicos/dolares/oficial | /v1/historicos/dolares/paralelo | /v1/historicos/euros
   * Respuesta: [{ fuente, promedio, fecha }]
   */
  async fetchHistoricalData(rateKey, days) {
    const endpointMap = {
      bcv: 'https://ve.dolarapi.com/v1/historicos/dolares/oficial',
      paralelo: 'https://ve.dolarapi.com/v1/historicos/dolares/paralelo',
      euro: 'https://ve.dolarapi.com/v1/historicos/euros'
    };
    // /v1/historicos/euros devuelve series oficial Y paralelo juntas: filtrar por fuente
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
      console.warn(`Error fetching historical data for ${rateKey}:`, e);
    }

    return null; // Retorna null si falla, el gráfico mostrará un aviso
  }

  /**
   * Filtra la serie completa (cacheada) al período solicitado, en cliente.
   */
  _filterHistorical(series, days) {
    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - days);
    const fromStr = from.toISOString().split('T')[0];
    const toStr = today.toISOString().split('T')[0];
    return series.filter(d => d.date >= fromStr && d.date <= toStr);
  }

  /**
   * Convierte los datos históricos reales a formato para ApexCharts
   * Reduce puntos si son muchos para mejor visualización
   */
  processHistoricalForChart(historicalData, period) {
    if (!historicalData || historicalData.length === 0) return null;

    let data = [...historicalData];

    // Reducir puntos para mejor visualización según el período
    const maxPoints = { '1W': 7, '1M': 30, '3M': 30, '1Y': 24 };
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
          <!-- Brecha BCV vs Paralelo -->
          <div class="glass-card rounded-2xl p-3 text-center border border-white/10">
            <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Brecha BCV → Paralelo</span>
            <p class="text-lg font-black text-cyan-400 mt-0.5">${gapPercent > 0 ? `+${gapPercent.toFixed(2)}%` : '0.00%'}</p>
            <span class="text-[9px] text-gray-400 font-semibold block truncate">Mercado paralelo vs oficial</span>
          </div>

          <!-- Mínimo del Período (histórico real) -->
          <div class="glass-card rounded-2xl p-3 text-center border border-white/10">
            <span id="min-period-label" class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Mínimo (${periodDetails.short})</span>
            <p id="stat-min-value" class="text-sm font-black text-emerald-400 mt-1">— — —</p>
            <span class="text-[9px] text-gray-500 font-medium block">Piso oficial</span>
          </div>

          <!-- Máximo del Período (histórico real) -->
          <div class="glass-card rounded-2xl p-3 text-center border border-white/10">
            <span id="max-period-label" class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Máximo (${periodDetails.short})</span>
            <p id="stat-max-value" class="text-sm font-black text-amber-400 mt-1">— — —</p>
            <span class="text-[9px] text-gray-500 font-medium block">Techo oficial</span>
          </div>
        </div>

        <!-- Tarjeta del Gráfico ApexCharts -->
        <div class="glass-card rounded-3xl p-4 relative overflow-hidden space-y-3 border border-white/10 shadow-2xl">
          
          <!-- Filtros del Gráfico: Tasas y Períodos -->
          <div class="space-y-2">
            <!-- Píldoras de Tasas para filtrar -->
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <i data-lucide="line-chart" class="w-3.5 h-3.5 text-cyan-400"></i> Histórico de Mercado
              </span>
              <span class="text-[9px] text-emerald-400 font-bold flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
                Fuente: ve.dolarapi.com
              </span>
            </div>

            <div class="grid grid-cols-${Math.min(rateKeys.length + 1, 4)} gap-1 bg-black/40 p-1 rounded-2xl border border-white/10 w-full items-center" id="analytics-rate-filter">
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
    const paletteColors = ['#06B6D4', '#10B981', '#F59E0B', '#8B5CF6'];
    const seriesData = [];
    let categories = [];
    let hasRealData = false;

    // Rango real del período sobre la tasa activa (BCV por defecto con "Todas"):
    // las tarjetas dicen "Piso/Techo oficial", así que nunca mezclan series.
    const rangeKey = this.selectedRateFilter !== 'all' && rates[this.selectedRateFilter]
      ? this.selectedRateFilter
      : 'bcv';
    let realMin = Infinity;
    let realMax = -Infinity;
    let hasRangeData = false;

    // Intentar cargar datos históricos reales para cada tasa activa
    for (let index = 0; index < activeKeys.length; index++) {
      const key = activeKeys[index];
      const rateObj = rates[key];

      const historicalRaw = await this.fetchHistoricalData(key, days);
      let chartData = null;

      if (historicalRaw && historicalRaw.length > 0) {
        chartData = this.processHistoricalForChart(historicalRaw, this.selectedPeriod);
        hasRealData = true;
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

    // Actualizar tarjetas de Mínimo/Máximo con el rango real del período
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
