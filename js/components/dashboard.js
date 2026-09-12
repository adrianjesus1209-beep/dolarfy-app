import { mockEngine } from '../mockData.js';
import { formatCurrency, formatPercentage, formatTime, escapeHtml } from '../utils/formatters.js';

export class DashboardView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.unsubscribe = null;
    this.selectedDay = 'hoy'; // 'hoy' | 'manana'
  }

  getNextDayLabel(rates) {
    const now = new Date();
    const vetOffsetMs = -4 * 60 * 60 * 1000;
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const vetDate = new Date(utcMs + vetOffsetMs);
    const todayDay = vetDate.getDay(); // 0 = Dom, 1 = Lun, 2 = Mar, 3 = Mié, 4 = Jue, 5 = Vie, 6 = Sáb

    // En Viernes, Sábado y Domingo, la próxima fecha valor del BCV es siempre el Lunes
    if (todayDay === 5 || todayDay === 6 || todayDay === 0) {
      return 'Lunes';
    }

    const bcvNext = rates && rates.bcv && rates.bcv.nextDay;
    if (bcvNext && bcvNext.date) {
      const match = bcvNext.date.match(/(Lunes|Martes|Miércoles|Miercoles|Jueves|Viernes|Sábado|Sabado|Domingo)/i);
      if (match) {
        let day = match[1].toLowerCase();
        if (day === 'sábado' || day === 'sabado' || day === 'domingo') {
          return 'Lunes';
        }
        return day.charAt(0).toUpperCase() + day.slice(1);
      }
    }

    const dayNames = { 1: 'Martes', 2: 'Miércoles', 3: 'Jueves', 4: 'Viernes' };
    return dayNames[todayDay] || 'Mañana';
  }

  cleanText(str) {
    if (!str || typeof str !== 'string') return str || '';
    return str.replace(/Fecha\s+Valor\s*:?\s*/gi, '').trim();
  }

  formatSourceTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  getSourceLabel(rates) {
    const meta = (rates && rates._meta) || {};
    const src = meta.source || 'live';
    const time = this.formatSourceTime(meta.cachedAt || meta.fetchedAt);

    switch (src) {
      case 'stale':
        return `<span class="text-[10px] text-amber-400 font-semibold" title="Dato almacenado">Última: ${time}</span>`;
      case 'cache':
        return `<span class="text-[10px] text-gray-400 font-medium" title="Dato almacenado">Caché ${time}</span>`;
      case 'placeholder':
        return `<span class="text-[10px] text-gray-500 font-medium" title="Datos de referencia">Sin conexión · Referencia</span>`;
      case 'offline':
        return `<span class="text-[10px] text-red-400 font-semibold" title="Sin conexión activa">Sin conexión${time ? ` · ${time}` : ''}</span>`;
      default:
        return `<span class="text-[10px] text-emerald-400 font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block mr-1"></span>En Vivo</span>`;
    }
  }

  render() {
    const currentCountry = mockEngine.getCurrentCountry();
    const rates = mockEngine.getRates();
    const rateKeys = Object.keys(rates).filter(k => k !== '_meta');
    const rawNextDayLabel = this.getNextDayLabel(rates);
    const nextDayLabel = escapeHtml(this.cleanText(rawNextDayLabel));

    const isManana = this.selectedDay === 'manana';
    const mainRate = rates[currentCountry.defaultRateId] || rates[rateKeys[0]] || { name: 'Dólar Oficial (BCV)', currency: 'VES', value: 0 };
    const secondRate = rateKeys.length > 1 ? rates[rateKeys[1]] : null;

    const mainVal = (isManana && mainRate && mainRate.nextDay && mainRate.nextDay.value) ? mainRate.nextDay.value : (mainRate ? mainRate.value : null);
    const secondVal = (secondRate && isManana && secondRate.nextDay && secondRate.nextDay.value) ? secondRate.nextDay.value : (secondRate ? secondRate.value : null);

    let bannerTag = isManana 
      ? `Fecha Valor · ${nextDayLabel}` 
      : 'Resumen del Día';
    let bannerText = '';
    let bannerSub = '';

    if (isManana) {
      bannerText = (mainVal !== null && mainVal !== undefined)
        ? `${this.cleanText(mainRate.name)} (${nextDayLabel}): ${formatCurrency(mainVal, mainRate.currency, 2)}`
        : `${nextDayLabel}: Bs. — — —`;
      bannerSub = `Cotización oficial del Banco Central de Venezuela publicada en bcv.org.ve para ${nextDayLabel}.`;
    } else {
      bannerText = (mainVal !== null && mainVal !== undefined) ? `${this.cleanText(mainRate.name)}: ${formatCurrency(mainVal, mainRate.currency, 2)}` : `${mainRate.name}: Bs. — — —`;
      bannerSub = mainVal 
        ? `Tasas de referencia en vivo actualizadas desde bcv.org.ve.`
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
                <span>Monitoreo Oficial BCV (bcv.org.ve)</span>
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

        <!-- Encabezado de Tasas y Selector 'Hoy' / Pronóstico Día Siguiente -->
        <div>
          <div class="flex justify-between items-center mb-3">
            <div>
              <h2 class="text-xs font-bold uppercase tracking-wider text-gray-400">Tasas Principales ${currentCountry.name}</h2>
              <span class="text-xs font-bold text-cyan-400">${currentCountry.currency.code}</span>
            </div>

            <!-- Selector de Fecha 'Hoy' / Pronóstico Día Siguiente ('Lunes', 'Martes', 'Miércoles', etc.) -->
            <div class="bg-[#131924] border border-white/10 p-1 rounded-2xl flex items-center space-x-1 shadow-inner">
              <button type="button" data-day="hoy" class="dash-day-btn relative px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${this.selectedDay === 'hoy' ? 'bg-cyan-500/20 text-emerald-400 border border-cyan-500/40 shadow-sm' : 'text-gray-400 hover:text-white'}">
                Hoy
              </button>
              <button type="button" data-day="manana" class="dash-day-btn relative px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${this.selectedDay === 'manana' ? 'bg-cyan-500/20 text-emerald-400 border border-cyan-500/40 shadow-sm' : 'text-gray-400 hover:text-white'}">
                <span>${nextDayLabel}</span>
              </button>
            </div>
          </div>

          <!-- Contenido de Cotizaciones segun la pestaña activa -->
          ${this.renderContentSection(rates, rateKeys, currentCountry, isManana, nextDayLabel)}
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.subscribeToUpdates();
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  renderContentSection(rates, rateKeys, currentCountry, isManana, nextDayLabel) {
    if (isManana) {
      return `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
          ${rateKeys.map(key => this.renderNextDayRateCard(rates[key], nextDayLabel)).join('')}
        </div>
      `;
    }

    // Modo 'hoy' por defecto
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
        ${rateKeys.map(key => this.renderRateCard(rates[key], rates)).join('')}
      </div>
    `;
  }

  renderRateCard(rate, rates) {
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
          <span class="text-[10px] text-gray-500 font-medium">${this.getSourceLabel(rates)}</span>
        </div>
      </div>
    `;
  }

  renderNextDayRateCard(rate, nextDayLabel = 'Mañana') {
    if (!rate) return '';

    // Manejo especial para USDT / Crypto (Mercado 24/7 en tiempo real)
    if (rate.id === 'paralelo' || rate.type === 'crypto') {
      const liveVal = rate.value;
      const valueDisplay = liveVal !== null && liveVal !== undefined && !isNaN(liveVal)
        ? formatCurrency(liveVal, rate.currency, 2)
        : `<span class="text-white/30 tracking-widest font-mono text-xl">— — —</span>`;

      return `
        <div id="card-next-${rate.id}" class="glass-card-interactive rounded-2xl p-4 relative overflow-hidden transition-all duration-300 border-yellow-500/30">
          <div class="flex justify-between items-start">
            <div class="flex items-center space-x-3">
              <div class="p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-300">
                <i data-lucide="${rate.icon || 'coins'}" class="w-5 h-5"></i>
              </div>
              <div>
                <h4 class="font-bold text-gray-100 text-sm">${rate.name}</h4>
                <span class="text-[10px] bg-yellow-500/20 text-yellow-300 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <i data-lucide="zap" class="w-3 h-3 text-yellow-400"></i> Binance P2P
                </span>
              </div>
            </div>
            <span class="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
              <span>En Vivo</span>
            </span>
          </div>

          <div class="mt-4 flex justify-between items-end">
            <div>
              <p class="text-2xl font-extrabold text-amber-400 tracking-tight">
                ${valueDisplay}
              </p>
              <p class="text-[11px] text-gray-300 font-medium mt-0.5">Mercado 24/7 en Tiempo Real</p>
            </div>
            <span class="text-[10px] text-yellow-400 font-bold">Sin Cierre</span>
          </div>
        </div>
      `;
    }

    const hasOfficialNextDay = rate.nextDay && rate.nextDay.value && rate.nextDay.published;
    const nextDay = hasOfficialNextDay ? rate.nextDay : null;

    const val = nextDay ? nextDay.value : null;
    const isPositive = nextDay ? nextDay.change >= 0 : true;
    const badgeBg = isPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20';
    const trendIcon = isPositive ? 'trending-up' : 'trending-down';

    const valueDisplay = val !== null && val !== undefined && !isNaN(val)
      ? formatCurrency(val, rate.currency, val < 10 ? 4 : 2)
      : `<span class="text-white/30 tracking-widest font-mono text-xl">— — —</span>`;

    const isOfficial = rate.type === 'official' || (nextDay && nextDay.isOfficial);
    const badgeTag = isOfficial 
      ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><i data-lucide="check-circle" class="w-3 h-3 text-emerald-400"></i> Oficial BCV</span>'
      : '<span class="text-[10px] bg-cyan-500/20 text-cyan-300 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><i data-lucide="coins" class="w-3 h-3 text-cyan-400"></i> Binance P2P</span>';

    const dateSubtitle = hasOfficialNextDay
      ? escapeHtml(this.cleanText(nextDay.date)) || `Oficial ${nextDayLabel}`
      : `Sin publicación oficial BCV aún para ${nextDayLabel}`;

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
            <span>${nextDay ? formatPercentage(nextDay.change) : '0.00%'}</span>
          </span>
        </div>

        <div class="mt-4 flex justify-between items-end">
          <div>
            <p class="text-2xl font-extrabold text-emerald-400 tracking-tight">
              ${valueDisplay}
            </p>
            <p class="text-[11px] text-gray-300 font-medium mt-0.5">${dateSubtitle}</p>
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
      if (action === 'rates_refreshed') {
        this.render();
      }
    });
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}
