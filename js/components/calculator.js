import { mockEngine } from '../mockData.js';
import { formatCurrency } from '../utils/formatters.js';

export class CalculatorView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.amount = 100;
    this.fromCurrency = 'USD';
    this.toCurrency = 'VES';
    this.selectedRateId = 'bcv'; // 'bcv', 'paralelo', 'usdt'
  }

  render() {
    const rates = mockEngine.getRates();

    this.container.innerHTML = `
      <div class="space-y-6 pb-24 animate-fade-in">
        <!-- Title & Rate Selector -->
        <div>
          <h2 class="text-xl font-extrabold text-white">Calculadora Cruzada</h2>
          <p class="text-xs text-gray-400 mt-1">Conversión instantánea multitasa en tiempo real.</p>
        </div>

        <!-- Tasa Base Selector -->
        <div class="glass-card rounded-2xl p-3">
          <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tasa de Referencia</label>
          <div class="grid grid-cols-3 gap-2" id="rate-selector-group">
            <button data-rate="bcv" class="rate-btn p-2.5 rounded-xl border text-xs font-bold text-center transition-all ${this.selectedRateId === 'bcv' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'bg-white/5 border-white/10 text-gray-400'}">
              BCV (${rates.bcv.value.toFixed(2)})
            </button>
            <button data-rate="paralelo" class="rate-btn p-2.5 rounded-xl border text-xs font-bold text-center transition-all ${this.selectedRateId === 'paralelo' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'bg-white/5 border-white/10 text-gray-400'}">
              Paralelo (${rates.paralelo.value.toFixed(2)})
            </button>
            <button data-rate="usdt" class="rate-btn p-2.5 rounded-xl border text-xs font-bold text-center transition-all ${this.selectedRateId === 'usdt' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'bg-white/5 border-white/10 text-gray-400'}">
              USDT (${rates.usdt.value.toFixed(2)})
            </button>
          </div>
        </div>

        <!-- Conversor Box -->
        <div class="glass-card rounded-3xl p-5 relative space-y-4">
          <!-- From Currency Input -->
          <div class="bg-black/30 border border-white/10 rounded-2xl p-4">
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs font-semibold text-gray-400">Tú envías / Origen</span>
              <select id="from-currency-select" class="bg-transparent text-xs font-bold text-cyan-400 outline-none cursor-pointer">
                <option value="USD" ${this.fromCurrency === 'USD' ? 'selected' : ''}>USD - Dólar</option>
                <option value="VES" ${this.fromCurrency === 'VES' ? 'selected' : ''}>VES - Bolívares</option>
                <option value="EUR" ${this.fromCurrency === 'EUR' ? 'selected' : ''}>EUR - Euro</option>
                <option value="USDT" ${this.fromCurrency === 'USDT' ? 'selected' : ''}>USDT - Tether</option>
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
                <option value="VES" ${this.toCurrency === 'VES' ? 'selected' : ''}>VES - Bolívares</option>
                <option value="USD" ${this.toCurrency === 'USD' ? 'selected' : ''}>USD - Dólar</option>
                <option value="EUR" ${this.toCurrency === 'EUR' ? 'selected' : ''}>EUR - Euro</option>
                <option value="USDT" ${this.toCurrency === 'USDT' ? 'selected' : ''}>USDT - Tether</option>
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
          <span id="applied-rate-info" class="font-bold text-gray-200">1 USD = 0.00 VES</span>
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
      document.getElementById('from-symbol').textContent = this.fromCurrency;
      this.calculate();
    });

    toSelect?.addEventListener('change', (e) => {
      this.toCurrency = e.target.value;
      document.getElementById('to-symbol').textContent = this.toCurrency;
      this.calculate();
    });

    swapBtn?.addEventListener('click', () => {
      const temp = this.fromCurrency;
      this.fromCurrency = this.toCurrency;
      this.toCurrency = temp;

      document.getElementById('from-currency-select').value = this.fromCurrency;
      document.getElementById('to-currency-select').value = this.toCurrency;
      document.getElementById('from-symbol').textContent = this.fromCurrency;
      document.getElementById('to-symbol').textContent = this.toCurrency;

      this.calculate();
    });

    rateBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedRateId = btn.getAttribute('data-rate');
        rateBtns.forEach(b => {
          b.className = `rate-btn p-2.5 rounded-xl border text-xs font-bold text-center transition-all ${b.getAttribute('data-rate') === this.selectedRateId ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'bg-white/5 border-white/10 text-gray-400'}`;
        });
        this.calculate();
      });
    });
  }

  calculate() {
    const rates = mockEngine.getRates();
    const activeRate = rates[this.selectedRateId] ? rates[this.selectedRateId].value : rates.bcv.value;
    const euroRate = rates.euro.value;

    // Convertir de origen a USD equivalente
    let inUSD = 0;
    if (this.fromCurrency === 'USD' || this.fromCurrency === 'USDT') {
      inUSD = this.amount;
    } else if (this.fromCurrency === 'VES') {
      inUSD = this.amount / activeRate;
    } else if (this.fromCurrency === 'EUR') {
      inUSD = (this.amount * euroRate) / activeRate;
    }

    // Convertir de USD a destino
    let finalResult = 0;
    if (this.toCurrency === 'USD' || this.toCurrency === 'USDT') {
      finalResult = inUSD;
    } else if (this.toCurrency === 'VES') {
      finalResult = inUSD * activeRate;
    } else if (this.toCurrency === 'EUR') {
      finalResult = (inUSD * activeRate) / euroRate;
    }

    const resultEl = document.getElementById('calc-result-amount');
    const infoEl = document.getElementById('applied-rate-info');

    if (resultEl) {
      resultEl.textContent = formatCurrency(finalResult, this.toCurrency, this.toCurrency === 'VES' ? 2 : 2).replace(/[$€₮Bs.]/g, '').trim();
    }

    if (infoEl) {
      infoEl.textContent = `1 USD = ${activeRate.toFixed(2)} VES (${this.selectedRateId.toUpperCase()})`;
    }
  }

  destroy() {}
}
