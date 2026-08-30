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
      <div class="space-y-2.5 pb-20 animate-fade-in max-w-md mx-auto">
        
        <!-- Header compacto -->
        <div class="flex justify-between items-center px-0.5">
          <div class="flex items-center space-x-2">
            <div class="p-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <i data-lucide="calculator" class="w-4 h-4"></i>
            </div>
            <div>
              <h2 class="text-sm font-extrabold text-white leading-none">Calculadora Financiera</h2>
              <p class="text-[10px] text-gray-400 mt-0.5">Conversión en vivo para ${this.currentCountry.name}</p>
            </div>
          </div>

          <button type="button" class="country-selector-trigger bg-white/5 border border-white/10 text-cyan-300 text-xs font-bold px-2.5 py-1 rounded-xl flex items-center space-x-1.5 active:scale-95 transition-all cursor-pointer">
            <img src="${this.currentCountry.flagUrl}" alt="${this.currentCountry.name}" class="w-3.5 h-3.5 rounded-full object-cover">
            <span>${this.currentCountry.currency.code}</span>
            <i data-lucide="chevron-down" class="w-3 h-3 text-cyan-400"></i>
          </button>
        </div>

        <!-- Tasa de Referencia (Píldoras 2x2 compactas) -->
        <div class="glass-card rounded-2xl p-2 space-y-1">
          <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 px-0.5">
            <i data-lucide="sliders" class="w-3 h-3 text-cyan-400"></i> Tasa de Referencia
          </span>
          <div class="grid grid-cols-2 gap-1.5" id="rate-selector-group">
            ${rateKeys.map(key => {
              const r = rates[key];
              const isSelected = this.selectedRateId === key;
              const shortLabel = r.name.replace('Dólar ', '').replace(' (BCV)', '').replace(' (BNA)', '').replace(' (TRM)', '').replace(' (Banxico)', '');
              return `
                <button data-rate="${key}" type="button" class="rate-btn py-1.5 px-2 rounded-xl border text-[11px] font-bold text-center transition-all truncate ${isSelected ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-500/10' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}">
                  ${shortLabel} (${r.value.toFixed(r.value < 10 ? 2 : 2)})
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Bloque de Conversión con Selects y Resultado -->
        <div class="glass-card rounded-2xl p-2.5 relative space-y-2 border border-white/10 shadow-lg">
          
          <!-- Origen (Tú envías) -->
          <div class="bg-black/40 border border-white/10 rounded-xl p-2.5">
            <div class="flex justify-between items-center mb-0.5">
              <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <i data-lucide="arrow-up-right" class="w-3 h-3 text-cyan-400"></i> Tú envías / Origen
              </span>
              <select id="from-currency-select" class="bg-black/60 border border-white/10 rounded-lg px-2 py-0.5 text-xs font-bold text-cyan-300 outline-none cursor-pointer">
                ${availableCurrencies.map(c => `
                  <option value="${c.code}" class="bg-[#0F141C] text-white" ${this.fromCurrency === c.code ? 'selected' : ''}>${c.name}</option>
                `).join('')}
              </select>
            </div>
            <div class="flex items-center justify-between">
              <span id="calc-display-input" class="text-2xl font-black text-white tracking-tight break-all leading-none">${this.amountStr}</span>
              <span class="text-xs font-bold text-cyan-400 ml-2" id="from-symbol">${this.fromCurrency}</span>
            </div>
          </div>

          <!-- Botón de Swap Flotante -->
          <div class="flex justify-center -my-2 relative z-10">
            <button id="swap-currency-btn" type="button" aria-label="Intercambiar divisas" class="p-1.5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-md shadow-cyan-500/30 active:scale-95 transition-all cursor-pointer">
              <i data-lucide="arrow-up-down" class="w-3.5 h-3.5"></i>
            </button>
          </div>

          <!-- Destino (Tú recibes) -->
          <div class="bg-black/40 border border-white/10 rounded-xl p-2.5">
            <div class="flex justify-between items-center mb-0.5">
              <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <i data-lucide="arrow-down-left" class="w-3 h-3 text-emerald-400"></i> Tú recibes / Destino
              </span>
              <select id="to-currency-select" class="bg-black/60 border border-white/10 rounded-lg px-2 py-0.5 text-xs font-bold text-cyan-300 outline-none cursor-pointer">
                ${availableCurrencies.map(c => `
                  <option value="${c.code}" class="bg-[#0F141C] text-white" ${this.toCurrency === c.code ? 'selected' : ''}>${c.name}</option>
                `).join('')}
              </select>
            </div>
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <p id="calc-result-amount" class="text-2xl font-black text-emerald-400 tracking-tight leading-none">0,00</p>
                <button id="copy-result-btn" type="button" title="Copiar resultado" aria-label="Copiar resultado" class="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-emerald-400 active:scale-95 transition-all cursor-pointer">
                  <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                </button>
              </div>
              <span class="text-xs font-bold text-emerald-400 ml-2" id="to-symbol">${this.toCurrency}</span>
            </div>
          </div>

          <!-- Leyenda de Tasa Aplicada -->
          <div class="flex justify-between items-center text-[10px] text-gray-400 px-1 pt-0.5">
            <span class="flex items-center gap-1"><i data-lucide="info" class="w-3 h-3 text-cyan-400"></i> Tasa aplicada:</span>
            <span id="applied-rate-info" class="font-bold text-gray-200 truncate max-w-[70%]">1 USD = 0.00</span>
          </div>

        </div>

        <!-- Teclado Numérico Compacto de Calculadora (Keypad 4x4) -->
        <div class="grid grid-cols-4 gap-1.5" id="calc-keypad">
          <button data-key="C" type="button" class="calc-key-btn calc-key-clear py-2.5 rounded-xl text-sm font-extrabold">C</button>
          <button data-key="BACKSPACE" type="button" class="calc-key-btn calc-key-action py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center">
            <i data-lucide="delete" class="w-4 h-4"></i>
          </button>
          <button data-key="00" type="button" class="calc-key-btn calc-key-action py-2.5 rounded-xl text-xs font-extrabold">00</button>
          <button data-key="PERCENT" type="button" class="calc-key-btn calc-key-action py-2.5 rounded-xl text-xs font-extrabold">%</button>

          <button data-key="7" type="button" class="calc-key-btn py-2.5 rounded-xl text-base text-white">7</button>
          <button data-key="8" type="button" class="calc-key-btn py-2.5 rounded-xl text-base text-white">8</button>
          <button data-key="9" type="button" class="calc-key-btn py-2.5 rounded-xl text-base text-white">9</button>
          <button data-key="SWAP" type="button" class="calc-key-btn calc-key-action py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center">
            <i data-lucide="arrow-up-down" class="w-3.5 h-3.5"></i>
          </button>

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
    const rateBtns = document.querySelectorAll('.rate-btn');
    const fromSelect = document.getElementById('from-currency-select');
    const toSelect = document.getElementById('to-currency-select');
    const swapBtn = document.getElementById('swap-currency-btn');
    const copyBtn = document.getElementById('copy-result-btn');
    const keypadKeys = document.querySelectorAll('#calc-keypad button');

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

    copyBtn?.addEventListener('click', () => {
      const resultEl = document.getElementById('calc-result-amount');
      if (!resultEl) return;
      const textToCopy = resultEl.textContent;

      navigator.clipboard.writeText(textToCopy).then(() => {
        copyBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i>`;
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => {
          copyBtn.innerHTML = `<i data-lucide="copy" class="w-3.5 h-3.5 text-gray-400"></i>`;
          if (window.lucide) window.lucide.createIcons();
        }, 2000);
      }).catch(e => console.warn('Error al copiar:', e));
    });

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
    } else if (key === 'C') {
      this.amountStr = '0';
    } else if (key === 'PERCENT') {
      const val = parseFloat(this.amountStr) || 0;
      this.amountStr = (val / 100).toString();
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
