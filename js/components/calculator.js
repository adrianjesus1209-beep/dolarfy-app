import { mockEngine } from '../mockData.js';
import { formatCurrency } from '../utils/formatters.js';

export class CalculatorView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.amount = 100;
    this.currentCountry = mockEngine.getCurrentCountry();
    
    // Set default currencies according to active country
    const localCode = this.currentCountry.currency.code;
    this.fromCurrency = 'USD';
    this.toCurrency = localCode === 'USD' ? 'EUR' : localCode;

    // Default rate
    const rates = this.currentCountry.rates;
    const rateKeys = Object.keys(rates);
    this.selectedRateId = this.currentCountry.defaultRateId && rates[this.currentCountry.defaultRateId] 
      ? this.currentCountry.defaultRateId 
      : rateKeys[0];
  }

  render() {
    this.currentCountry = mockEngine.getCurrentCountry();
    const rates = this.currentCountry.rates;
    const rateKeys = Object.keys(rates);

    if (!rates[this.selectedRateId]) {
      this.selectedRateId = this.currentCountry.defaultRateId && rates[this.currentCountry.defaultRateId]
        ? this.currentCountry.defaultRateId
        : rateKeys[0];
    }

    const availableCurrencies = [
      { code: 'USD', name: 'USD - Dólar' },
      { code: 'USDT', name: 'USDT - Tether' },
      { code: 'EUR', name: 'EUR - Euro' }
    ];

    if (!availableCurrencies.some(c => c.code === this.currentCountry.currency.code)) {
      availableCurrencies.splice(1, 0, {
        code: this.currentCountry.currency.code,
        name: `${this.currentCountry.currency.code} - ${this.currentCountry.currency.name}`
      });
    }

    this.container.innerHTML = `
      <div class="space-y-6 pb-24 animate-fade-in">
        <!-- Title & Country Info -->
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-xl font-extrabold text-white">Calculadora Cruzada</h2>
            <p class="text-xs text-gray-400 mt-1">Conversión instantánea para ${this.currentCountry.name} ${this.currentCountry.flag}</p>
          </div>
          <span class="bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-bold px-2.5 py-1 rounded-xl">
            ${this.currentCountry.currency.code}
          </span>
        </div>

        <!-- Tasa Base Selector -->
        <div class="glass-card rounded-2xl p-3 space-y-2">
          <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Tasa de Referencia</label>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2" id="rate-selector-group">
            ${rateKeys.map(key => {
              const r = rates[key];
              const isSelected = this.selectedRateId === key;
              return `
                <button data-rate="${key}" class="rate-btn p-2 rounded-xl border text-[11px] font-bold text-center transition-all truncate ${isSelected ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-500/10' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}">
                  ${r.name.split(' ')[0]} (${r.value.toFixed(r.value < 10 ? 2 : 2)})
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Conversor Box -->
        <div class="glass-card rounded-3xl p-5 relative space-y-4">
          <!-- From Currency Input -->
          <div class="bg-black/30 border border-white/10 rounded-2xl p-4">
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs font-semibold text-gray-400">Tú envías / Origen</span>
              <select id="from-currency-select" class="bg-transparent text-xs font-bold text-cyan-400 outline-none cursor-pointer">
                ${availableCurrencies.map(c => `
                  <option value="${c.code}" class="bg-[#0B0E14] text-white" ${this.fromCurrency === c.code ? 'selected' : ''}>${c.name}</option>
                `).join('')}
              </select>
            </div>
            <div class="flex items-center justify-between">
              <input type="number" id="calc-input-amount" value="${this.amount}" min="0" step="any"
                class="w-full bg-transparent text-2xl font-extrabold text-white outline-none focus:ring-0 placeholder-gray-600" />
              <span class="text-lg font-bold text-gray-400 ml-2" id="from-symbol">${this.fromCurrency}</span>
            </div>
          </div>

          <!-- Swap Button Floating -->
          <div class="flex justify-center -my-2 relative z-10">
            <button id="swap-currency-btn" class="p-3 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-lg shadow-cyan-500/30 active:scale-95 transition-all">
              <i data-lucide="arrow-up-down" class="w-5 h-5"></i>
            </button>
          </div>

          <!-- To Currency Output -->
          <div class="bg-black/30 border border-white/10 rounded-2xl p-4">
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs font-semibold text-gray-400">Tú recibes / Destino</span>
              <select id="to-currency-select" class="bg-transparent text-xs font-bold text-cyan-400 outline-none cursor-pointer">
                ${availableCurrencies.map(c => `
                  <option value="${c.code}" class="bg-[#0B0E14] text-white" ${this.toCurrency === c.code ? 'selected' : ''}>${c.name}</option>
                `).join('')}
              </select>
            </div>
            <div class="flex items-center justify-between">
              <p id="calc-result-amount" class="text-2xl font-extrabold text-emerald-400 tracking-tight">0.00</p>
              <span class="text-lg font-bold text-gray-400 ml-2" id="to-symbol">${this.toCurrency}</span>
            </div>
          </div>
        </div>

        <!-- Resumen de tasa utilizada -->
        <div class="flex justify-between items-center text-xs text-gray-400 px-2">
          <span>Tasa aplicada:</span>
          <span id="applied-rate-info" class="font-bold text-gray-200">1 USD = 0.00</span>
        </div>
      </div>
    `;

    this.attachEvents();
    this.calculate();
    if (window.lucide) window.lucide.createIcons();
  }

  attachEvents() {
    const inputEl = document.getElementById('calc-input-amount');
    const fromSelect = document.getElementById('from-currency-select');
    const toSelect = document.getElementById('to-currency-select');
    const swapBtn = document.getElementById('swap-currency-btn');
    const rateBtns = document.querySelectorAll('.rate-btn');

    inputEl?.addEventListener('input', (e) => {
      this.amount = parseFloat(e.target.value) || 0;
      this.calculate();
    });

    fromSelect?.addEventListener('change', (e) => {
      this.fromCurrency = e.target.value;
      const sym = document.getElementById('from-symbol');
      if (sym) sym.textContent = this.fromCurrency;
      this.calculate();
    });

    toSelect?.addEventListener('change', (e) => {
      this.toCurrency = e.target.value;
      const sym = document.getElementById('to-symbol');
      if (sym) sym.textContent = this.toCurrency;
      this.calculate();
    });

    swapBtn?.addEventListener('click', () => {
      const temp = this.fromCurrency;
      this.fromCurrency = this.toCurrency;
      this.toCurrency = temp;

      const fromSel = document.getElementById('from-currency-select');
      const toSel = document.getElementById('to-currency-select');
      if (fromSel) fromSel.value = this.fromCurrency;
      if (toSel) toSel.value = this.toCurrency;

      const fromSym = document.getElementById('from-symbol');
      const toSym = document.getElementById('to-symbol');
      if (fromSym) fromSym.textContent = this.fromCurrency;
      if (toSym) toSym.textContent = this.toCurrency;

      this.calculate();
    });

    rateBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedRateId = btn.getAttribute('data-rate');
        rateBtns.forEach(b => {
          const isSelected = b.getAttribute('data-rate') === this.selectedRateId;
          b.className = `rate-btn p-2 rounded-xl border text-[11px] font-bold text-center transition-all truncate ${isSelected ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-500/10' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`;
        });
        this.calculate();
      });
    });
  }

  calculate() {
    const rates = this.currentCountry.rates;
    const activeRateObj = rates[this.selectedRateId] || Object.values(rates)[0];
    const activeRate = activeRateObj.value;
    const localCode = this.currentCountry.currency.code;

    // Convertir de origen a USD equivalente
    let inUSD = 0;
    if (this.fromCurrency === 'USD' || this.fromCurrency === 'USDT') {
      inUSD = this.amount;
    } else if (this.fromCurrency === localCode) {
      inUSD = this.amount / activeRate;
    } else if (this.fromCurrency === 'EUR') {
      const euroRate = rates.euro ? rates.euro.value : (activeRate * 1.08);
      inUSD = (this.amount * euroRate) / activeRate;
    } else {
      inUSD = this.amount;
    }

    // Convertir de USD a destino
    let finalResult = 0;
    if (this.toCurrency === 'USD' || this.toCurrency === 'USDT') {
      finalResult = inUSD;
    } else if (this.toCurrency === localCode) {
      finalResult = inUSD * activeRate;
    } else if (this.toCurrency === 'EUR') {
      const euroRate = rates.euro ? rates.euro.value : (activeRate * 1.08);
      finalResult = (inUSD * activeRate) / euroRate;
    } else {
      finalResult = inUSD;
    }

    const resultEl = document.getElementById('calc-result-amount');
    const infoEl = document.getElementById('applied-rate-info');

    if (resultEl) {
      resultEl.textContent = finalResult.toLocaleString('es-VE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: finalResult < 10 ? 4 : 2
      });
    }

    if (infoEl) {
      infoEl.textContent = `1 USD = ${activeRate.toFixed(activeRate < 10 ? 4 : 2)} ${localCode} (${activeRateObj.name})`;
    }
  }

  destroy() {}
}
