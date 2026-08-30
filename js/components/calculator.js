import { mockEngine } from '../mockData.js';
import { formatCurrency } from '../utils/formatters.js';

export class CalculatorView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.amountStr = '0'; // Inicializa en 0
    this.currentCountry = mockEngine.getCurrentCountry();
    
    // Monedas por defecto según país activo
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
      <div class="space-y-4 pb-24 animate-fade-in">
        
        <!-- Header de la Calculadora con icono y país -->
        <div class="flex justify-between items-center">
          <div class="flex items-center space-x-2">
            <div class="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <i data-lucide="calculator" class="w-5 h-5"></i>
            </div>
            <div>
              <h2 class="text-base font-extrabold text-white leading-none">Calculadora Financiera</h2>
              <p class="text-[11px] text-gray-400 mt-0.5">Conversión en vivo para ${this.currentCountry.name}</p>
            </div>
          </div>

          <button type="button" class="country-selector-trigger bg-white/5 border border-white/10 text-cyan-300 text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center space-x-1.5 active:scale-95 transition-all">
            <img src="${this.currentCountry.flagUrl}" alt="${this.currentCountry.name}" class="w-4 h-4 rounded-full object-cover">
            <span>${this.currentCountry.currency.code}</span>
            <i data-lucide="chevron-down" class="w-3 h-3 text-cyan-400"></i>
          </button>
        </div>

        <!-- Filtros de Tasas del País (Píldoras) -->
        <div class="glass-card rounded-2xl p-2 space-y-1.5">
          <div class="flex items-center justify-between px-1">
            <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <i data-lucide="sliders" class="w-3 h-3 text-cyan-400"></i> Tasa de Referencia
            </span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5" id="rate-selector-group">
            ${rateKeys.map(key => {
              const r = rates[key];
              const isSelected = this.selectedRateId === key;
              return `
                <button data-rate="${key}" type="button" class="rate-btn py-1.5 px-2 rounded-xl border text-[11px] font-bold text-center transition-all truncate ${isSelected ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-500/10' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}">
                  ${r.name.split(' ')[0]} (${r.value.toFixed(r.value < 10 ? 2 : 2)})
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Pantalla Digital de la Calculadora -->
        <div class="glass-card rounded-3xl p-4 relative space-y-3 shadow-2xl border border-white/10">
          
          <!-- Origen / Tú envías -->
          <div class="bg-black/40 border border-white/10 rounded-2xl p-3.5">
            <div class="flex justify-between items-center mb-1">
              <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <i data-lucide="arrow-up-right" class="w-3 h-3 text-cyan-400"></i> Tú envías / Origen
              </span>
              <select id="from-currency-select" class="bg-black/60 border border-white/10 rounded-lg px-2 py-0.5 text-xs font-bold text-cyan-300 outline-none cursor-pointer">
                ${availableCurrencies.map(c => `
                  <option value="${c.code}" class="bg-[#0B0E14] text-white" ${this.fromCurrency === c.code ? 'selected' : ''}>${c.name}</option>
                `).join('')}
              </select>
            </div>
            <div class="flex items-center justify-between">
              <span id="calc-display-input" class="text-3xl font-black text-white tracking-tight break-all leading-none">${this.amountStr}</span>
              <span class="text-sm font-bold text-cyan-400 ml-2" id="from-symbol">${this.fromCurrency}</span>
            </div>
          </div>

          <!-- Botón de Intercambio Flotante (Swap) -->
          <div class="flex justify-center -my-2 relative z-10">
            <button id="swap-currency-btn" type="button" aria-label="Intercambiar divisas" class="p-2.5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-lg shadow-cyan-500/30 active:scale-95 transition-all cursor-pointer">
              <i data-lucide="arrow-up-down" class="w-4 h-4"></i>
            </button>
          </div>

          <!-- Destino / Tú recibes -->
          <div class="bg-black/40 border border-white/10 rounded-2xl p-3.5">
            <div class="flex justify-between items-center mb-1">
              <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <i data-lucide="arrow-down-left" class="w-3 h-3 text-emerald-400"></i> Tú recibes / Destino
              </span>
              <select id="to-currency-select" class="bg-black/60 border border-white/10 rounded-lg px-2 py-0.5 text-xs font-bold text-cyan-300 outline-none cursor-pointer">
                ${availableCurrencies.map(c => `
                  <option value="${c.code}" class="bg-[#0B0E14] text-white" ${this.toCurrency === c.code ? 'selected' : ''}>${c.name}</option>
                `).join('')}
              </select>
            </div>
            <div class="flex items-center justify-between">
              <p id="calc-result-amount" class="text-3xl font-black text-emerald-400 tracking-tight leading-none">0.00</p>
              <span class="text-sm font-bold text-emerald-400 ml-2" id="to-symbol">${this.toCurrency}</span>
            </div>
          </div>

          <!-- Leyenda de Tasa Aplicada -->
          <div class="flex justify-between items-center text-[11px] text-gray-400 px-1 pt-1">
            <span class="flex items-center gap-1"><i data-lucide="info" class="w-3 h-3 text-cyan-400"></i> Tasa aplicada:</span>
            <span id="applied-rate-info" class="font-bold text-gray-200">1 USD = 0.00</span>
          </div>

        </div>

        <!-- Teclado Numérico Real de Calculadora (Keypad) -->
        <div class="grid grid-cols-4 gap-2 pt-1" id="calc-keypad">
          <button data-key="C" type="button" class="calc-key-btn calc-key-clear py-3.5 rounded-2xl text-base font-extrabold flex items-center justify-center">C</button>
          <button data-key="BACKSPACE" type="button" class="calc-key-btn calc-key-action py-3.5 rounded-2xl text-sm font-extrabold flex items-center justify-center">
            <i data-lucide="delete" class="w-5 h-5"></i>
          </button>
          <button data-key="00" type="button" class="calc-key-btn calc-key-action py-3.5 rounded-2xl text-sm font-extrabold">00</button>
          <button data-key="SWAP" type="button" class="calc-key-btn calc-key-action py-3.5 rounded-2xl text-sm font-extrabold flex items-center justify-center">
            <i data-lucide="arrow-up-down" class="w-4 h-4"></i>
          </button>

          <button data-key="7" type="button" class="calc-key-btn py-3.5 rounded-2xl text-lg text-white">7</button>
          <button data-key="8" type="button" class="calc-key-btn py-3.5 rounded-2xl text-lg text-white">8</button>
          <button data-key="9" type="button" class="calc-key-btn py-3.5 rounded-2xl text-lg text-white">9</button>
          <button data-key="RATE_NEXT" type="button" class="calc-key-btn calc-key-action py-3.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center">
            <i data-lucide="repeat" class="w-4 h-4"></i>
          </button>

          <button data-key="4" type="button" class="calc-key-btn py-3.5 rounded-2xl text-lg text-white">4</button>
          <button data-key="5" type="button" class="calc-key-btn py-3.5 rounded-2xl text-lg text-white">5</button>
          <button data-key="6" type="button" class="calc-key-btn py-3.5 rounded-2xl text-lg text-white">6</button>
          <button data-key="CLEAR_ENTRY" type="button" class="calc-key-btn calc-key-action py-3.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center">CE</button>

          <button data-key="1" type="button" class="calc-key-btn py-3.5 rounded-2xl text-lg text-white">1</button>
          <button data-key="2" type="button" class="calc-key-btn py-3.5 rounded-2xl text-lg text-white">2</button>
          <button data-key="3" type="button" class="calc-key-btn py-3.5 rounded-2xl text-lg text-white">3</button>
          <button data-key="." type="button" class="calc-key-btn py-3.5 rounded-2xl text-xl text-cyan-400 font-black">.</button>

          <button data-key="0" type="button" class="calc-key-btn col-span-2 py-3.5 rounded-2xl text-lg text-white">0</button>
          <button data-key="CALCULATE" type="button" class="calc-key-btn col-span-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-black py-3.5 rounded-2xl text-base font-extrabold flex items-center justify-center space-x-1 shadow-lg shadow-cyan-500/20 active:scale-95">
            <i data-lucide="check" class="w-5 h-5"></i>
            <span>Calcular</span>
          </button>
        </div>

      </div>
    `;

    this.attachEvents();
    this.calculate();
    if (window.lucide) window.lucide.createIcons();
  }

  attachEvents() {
    const fromSelect = document.getElementById('from-currency-select');
    const toSelect = document.getElementById('to-currency-select');
    const swapBtn = document.getElementById('swap-currency-btn');
    const rateBtns = document.querySelectorAll('.rate-btn');
    const keypadKeys = document.querySelectorAll('#calc-keypad button');

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

    const triggerSwap = () => {
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
    };

    swapBtn?.addEventListener('click', triggerSwap);

    rateBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedRateId = btn.getAttribute('data-rate');
        rateBtns.forEach(b => {
          const isSelected = b.getAttribute('data-rate') === this.selectedRateId;
          b.className = `rate-btn py-1.5 px-2 rounded-xl border text-[11px] font-bold text-center transition-all truncate ${isSelected ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-500/10' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`;
        });
        this.calculate();
      });
    });

    // Eventos del Teclado Numérico
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
        if (this.amountStr.length < 12) {
          this.amountStr += key;
        }
      }
    } else if (key === '00') {
      if (this.amountStr !== '0' && this.amountStr.length < 10) {
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
    } else if (key === 'RATE_NEXT') {
      const rates = this.currentCountry.rates;
      const keys = Object.keys(rates);
      const idx = keys.indexOf(this.selectedRateId);
      const nextIdx = (idx + 1) % keys.length;
      this.selectedRateId = keys[nextIdx];
      this.render();
      return;
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
