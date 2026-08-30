import { mockEngine } from '../mockData.js';
import { formatCurrency } from '../utils/formatters.js';

export class CalculatorView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.amountStr = '0';
    this.currentCountry = mockEngine.getCurrentCountry();
    
    // Monedas por defecto
    const localCode = this.currentCountry.currency.code;
    this.fromCurrency = 'USD';
    this.toCurrency = localCode === 'USD' ? 'EUR' : localCode;

    // Tasa por defecto
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
      <div class="space-y-3 pb-20 animate-fade-in max-w-md mx-auto">
        
        <!-- Header compacto + Selector de Tasa de Referencia -->
        <div class="glass-card rounded-2xl p-3 space-y-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <i data-lucide="calculator" class="w-4 h-4 text-cyan-400"></i>
              <span class="text-xs font-black text-white">Calculadora ${this.currentCountry.name}</span>
            </div>
            <img src="${this.currentCountry.flagUrl}" alt="${this.currentCountry.name}" class="w-4 h-4 rounded-full object-cover">
          </div>

          <!-- Select Compacto de Tasa de Referencia -->
          <div class="relative">
            <select id="rate-dropdown-select" class="w-full bg-black/50 border border-cyan-500/30 rounded-xl px-3 py-2 text-xs font-bold text-cyan-300 outline-none appearance-none cursor-pointer pr-8">
              ${rateKeys.map(key => {
                const r = rates[key];
                const isSelected = this.selectedRateId === key;
                return `
                  <option value="${key}" class="bg-[#0F141C] text-white" ${isSelected ? 'selected' : ''}>
                    ${r.name} (${formatCurrency(r.value, r.currency, r.value < 10 ? 4 : 2)})
                  </option>
                `;
              }).join('')}
            </select>
            <i data-lucide="chevron-down" class="w-4 h-4 text-cyan-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"></i>
          </div>
        </div>

        <!-- Pantalla de Conversión Integrada y Compacta -->
        <div class="glass-card rounded-2xl p-3 space-y-2 shadow-xl border border-white/10">
          
          <!-- Fila Origen -->
          <div class="flex items-center justify-between bg-black/40 border border-white/10 rounded-xl p-2.5">
            <div>
              <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Tú envías</span>
              <span id="calc-display-input" class="text-2xl font-black text-white tracking-tight leading-none">${this.amountStr}</span>
            </div>
            <select id="from-currency-select" class="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs font-bold text-cyan-300 outline-none cursor-pointer">
              ${availableCurrencies.map(c => `
                <option value="${c.code}" class="bg-[#0F141C] text-white" ${this.fromCurrency === c.code ? 'selected' : ''}>${c.code}</option>
              `).join('')}
            </select>
          </div>

          <!-- Fila Intermedia (Swap + Tasa Aplicada) -->
          <div class="flex items-center justify-between px-1 text-[10px]">
            <span id="applied-rate-info" class="text-gray-400 font-semibold truncate max-w-[80%]">1 USD = 0.00</span>
            <button id="swap-currency-btn" type="button" aria-label="Intercambiar divisas" class="p-1.5 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 active:scale-95 transition-all cursor-pointer">
              <i data-lucide="arrow-up-down" class="w-3.5 h-3.5"></i>
            </button>
          </div>

          <!-- Fila Destino -->
          <div class="flex items-center justify-between bg-black/40 border border-white/10 rounded-xl p-2.5">
            <div>
              <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Tú recibes</span>
              <p id="calc-result-amount" class="text-2xl font-black text-emerald-400 tracking-tight leading-none">0,00</p>
            </div>
            <select id="to-currency-select" class="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs font-bold text-cyan-300 outline-none cursor-pointer">
              ${availableCurrencies.map(c => `
                <option value="${c.code}" class="bg-[#0F141C] text-white" ${this.toCurrency === c.code ? 'selected' : ''}>${c.code}</option>
              `).join('')}
            </select>
          </div>

        </div>

        <!-- Teclado Numérico Ultra-Compacto (Keypad) -->
        <div class="grid grid-cols-4 gap-1.5" id="calc-keypad">
          <button data-key="C" type="button" class="calc-key-btn calc-key-clear py-2.5 rounded-xl text-sm font-extrabold">C</button>
          <button data-key="BACKSPACE" type="button" class="calc-key-btn calc-key-action py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center">
            <i data-lucide="delete" class="w-4 h-4"></i>
          </button>
          <button data-key="00" type="button" class="calc-key-btn calc-key-action py-2.5 rounded-xl text-xs font-extrabold">00</button>
          <button data-key="SWAP" type="button" class="calc-key-btn calc-key-action py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center">
            <i data-lucide="arrow-up-down" class="w-3.5 h-3.5"></i>
          </button>

          <button data-key="7" type="button" class="calc-key-btn py-2.5 rounded-xl text-base text-white">7</button>
          <button data-key="8" type="button" class="calc-key-btn py-2.5 rounded-xl text-base text-white">8</button>
          <button data-key="9" type="button" class="calc-key-btn py-2.5 rounded-xl text-base text-white">9</button>
          <button data-key="CLEAR_ENTRY" type="button" class="calc-key-btn calc-key-action py-2.5 rounded-xl text-xs font-bold">CE</button>

          <button data-key="4" type="button" class="calc-key-btn py-2.5 rounded-xl text-base text-white">4</button>
          <button data-key="5" type="button" class="calc-key-btn py-2.5 rounded-xl text-base text-white">5</button>
          <button data-key="6" type="button" class="calc-key-btn py-2.5 rounded-xl text-base text-white">6</button>
          <button data-key="." type="button" class="calc-key-btn py-2.5 rounded-xl text-lg text-cyan-400 font-black">.</button>

          <button data-key="1" type="button" class="calc-key-btn py-2.5 rounded-xl text-base text-white">1</button>
          <button data-key="2" type="button" class="calc-key-btn py-2.5 rounded-xl text-base text-white">2</button>
          <button data-key="3" type="button" class="calc-key-btn py-2.5 rounded-xl text-base text-white">3</button>
          <button data-key="0" type="button" class="calc-key-btn py-2.5 rounded-xl text-base text-white">0</button>
        </div>

      </div>
    `;

    this.attachEvents();
    this.calculate();
    if (window.lucide) window.lucide.createIcons();
  }

  attachEvents() {
    const rateSelect = document.getElementById('rate-dropdown-select');
    const fromSelect = document.getElementById('from-currency-select');
    const toSelect = document.getElementById('to-currency-select');
    const swapBtn = document.getElementById('swap-currency-btn');
    const keypadKeys = document.querySelectorAll('#calc-keypad button');

    rateSelect?.addEventListener('change', (e) => {
      this.selectedRateId = e.target.value;
      this.calculate();
    });

    fromSelect?.addEventListener('change', (e) => {
      this.fromCurrency = e.target.value;
      this.calculate();
    });

    toSelect?.addEventListener('change', (e) => {
      this.toCurrency = e.target.value;
      this.calculate();
    });

    const triggerSwap = () => {
      const temp = this.fromCurrency;
      this.fromCurrency = this.toCurrency;
      this.toCurrency = temp;

      const fromSel = document.getElementById('from-currency-select');
      const toSel = document.getElementById('to-currency-select');
      if (fromSel) fromSel.value = this.fromCurrency;
      if (toSel) toSel.value = this.toCurrency;

      this.calculate();
    };

    swapBtn?.addEventListener('click', triggerSwap);

    keypadKeys.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        this.handleKeyPress(key, triggerSwap);
      });
    });
  }

  handleKeyPress(key, triggerSwap) {
    if (key >= '0' && key <= '9') {
      if (this.amountStr === '0') {
        this.amountStr = key;
      } else {
        if (this.amountStr.length < 10) {
          this.amountStr += key;
        }
      }
    } else if (key === '00') {
      if (this.amountStr !== '0' && this.amountStr.length < 9) {
        this.amountStr += '00';
      }
    } else if (key === '.') {
      if (!this.amountStr.includes('.')) {
        this.amountStr += '.';
      }
    } else if (key === 'C' || key === 'CLEAR_ENTRY') {
      this.amountStr = '0';
    } else if (key === 'BACKSPACE') {
      if (this.amountStr.length > 1) {
        this.amountStr = this.amountStr.slice(0, -1);
      } else {
        this.amountStr = '0';
      }
    } else if (key === 'SWAP') {
      if (triggerSwap) triggerSwap();
    }

    const displayInput = document.getElementById('calc-display-input');
    if (displayInput) {
      displayInput.textContent = this.amountStr;
    }

    this.calculate();
  }

  calculate() {
    const rates = this.currentCountry.rates;
    const activeRateObj = rates[this.selectedRateId] || Object.values(rates)[0];
    const activeRate = activeRateObj ? activeRateObj.value : 1;
    const localCode = this.currentCountry.currency.code;
    const numericAmount = parseFloat(this.amountStr) || 0;

    // Convertir de origen a USD equivalente
    let inUSD = 0;
    if (this.fromCurrency === 'USD' || this.fromCurrency === 'USDT') {
      inUSD = numericAmount;
    } else if (this.fromCurrency === localCode) {
      inUSD = numericAmount / activeRate;
    } else if (this.fromCurrency === 'EUR') {
      const euroRate = rates.euro ? rates.euro.value : (activeRate * 1.088);
      inUSD = (numericAmount * euroRate) / activeRate;
    } else {
      inUSD = numericAmount;
    }

    // Convertir de USD a destino
    let finalResult = 0;
    if (this.toCurrency === 'USD' || this.toCurrency === 'USDT') {
      finalResult = inUSD;
    } else if (this.toCurrency === localCode) {
      finalResult = inUSD * activeRate;
    } else if (this.toCurrency === 'EUR') {
      const euroRate = rates.euro ? rates.euro.value : (activeRate * 1.088);
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
      infoEl.textContent = `1 USD = ${activeRate.toFixed(activeRate < 10 ? 4 : 2)} ${localCode} (${activeRateObj ? activeRateObj.name : ''})`;
    }
  }

  destroy() {}
}
