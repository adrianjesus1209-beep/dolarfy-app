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

    // Operación matemática pendiente (opcional)
    this.previousValue = null;
    this.pendingOp = null;
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

    const activeRateObj = rates[this.selectedRateId] || Object.values(rates)[0];
    const activeRateVal = activeRateObj ? activeRateObj.value : 1;

    this.container.innerHTML = `
      <div class="space-y-3 pb-20 animate-fade-in max-w-md mx-auto">
        
        <!-- Pestañas de Filtros Superiores (Pills Bar) -->
        <div class="flex items-center justify-between">
          <!-- Píldoras de Tasas -->
          <div class="flex bg-[#131B2A] p-1 rounded-2xl border border-white/5 space-x-1" id="rate-pills-group">
            ${rateKeys.slice(0, 3).map(key => {
              const r = rates[key];
              const isSelected = this.selectedRateId === key;
              const shortName = r.name.split(' ')[0];
              return `
                <button data-rate="${key}" type="button" class="rate-pill-btn px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${isSelected ? 'bg-[#10B981] text-white shadow-md shadow-emerald-500/20' : 'text-gray-400 hover:text-white'}">
                  ${shortName}
                </button>
              `;
            }).join('')}
          </div>

          <!-- Píldoras de Fecha / Estado -->
          <div class="flex bg-[#131B2A] p-1 rounded-2xl border border-white/5 space-x-1">
            <button type="button" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1B2537] text-emerald-400">Hoy</button>
            <button type="button" class="px-2.5 py-1.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white flex items-center gap-1">
              <span>Lun.</span>
              <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            </button>
          </div>
        </div>

        <!-- Pantalla Digital de la Calculadora (Estilo Mockup) -->
        <div class="calc-mockup-card rounded-3xl p-4 relative space-y-4 shadow-2xl">
          
          <!-- Fila Superior de la Pantalla: Badge Tasa + Iconos -->
          <div class="flex items-center justify-between">
            <span id="rate-badge-pill" class="bg-[#1B2537] border border-white/5 text-cyan-300 text-xs font-bold px-3 py-1 rounded-full cursor-pointer hover:bg-[#25334A] transition-all">
              Tasa: ${activeRateVal.toFixed(2).replace('.', ',')}
            </span>

            <div class="flex items-center space-x-3 text-gray-400">
              <button id="toggle-symbols-btn" type="button" title="Ver divisas" class="hover:text-white text-xs font-bold transition-all">
                &lt;&gt;
              </button>
              <button id="swap-currencies-top" type="button" title="Intercambiar divisas" class="hover:text-emerald-400 text-cyan-400 transition-all">
                <i data-lucide="arrow-up-down" class="w-4 h-4"></i>
              </button>
              <button id="rate-history-icon" type="button" title="Historial" class="hover:text-white transition-all">
                <i data-lucide="history" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <!-- Monto Ingresado (Arriba a la Derecha) -->
          <div class="text-right pt-1">
            <span id="calc-input-display" class="text-3xl font-extrabold text-white tracking-tight leading-none">${this.amountStr} ${this.fromCurrency === 'USD' ? '$' : this.fromCurrency}</span>
          </div>

          <!-- Conversión Verde Central (Gran Texto Verde $0,00 = 0,00 Bs) -->
          <div class="text-center py-2">
            <p id="calc-green-result" class="text-2xl sm:text-3xl font-black text-[#10B981] tracking-tight leading-none">
              $0,00 = 0,00 Bs
            </p>
          </div>

          <!-- Pie de Pantalla: Badge de Moneda Activa -->
          <div class="flex justify-end items-center text-[11px] text-gray-400 space-x-1">
            <span id="active-rate-name-tag" class="font-bold text-gray-300 uppercase">${activeRateObj ? activeRateObj.name.split(' ')[0] : 'BCV'} ${this.fromCurrency}</span>
            <i data-lucide="arrow-up-down" class="w-3 h-3 text-emerald-400 cursor-pointer" id="swap-badge-icon"></i>
          </div>

        </div>

        <!-- Teclado Numérico Estilo Mockup Exacto -->
        <div class="grid grid-cols-4 gap-2 pt-1" id="calc-keypad">
          
          <!-- Fila 1: C, ÷, ×, Backspace -->
          <button data-key="C" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-xl font-black text-[#F59E0B]">C</button>
          <button data-key="/" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-2xl font-black text-[#10B981] flex items-center justify-center">÷</button>
          <button data-key="*" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-2xl font-black text-[#10B981] flex items-center justify-center">×</button>
          <button data-key="BACKSPACE" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-sm font-bold text-[#F97316] flex items-center justify-center">
            <i data-lucide="delete" class="w-5 h-5"></i>
          </button>

          <!-- Fila 2: 7, 8, 9 | - -->
          <button data-key="7" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-xl text-white">7</button>
          <button data-key="8" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-xl text-white">8</button>
          <button data-key="9" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-xl text-white">9</button>
          <button data-key="-" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-2xl font-black text-[#10B981] flex items-center justify-center">-</button>

          <!-- Fila 3: 4, 5, 6 | + -->
          <button data-key="4" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-xl text-white">4</button>
          <button data-key="5" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-xl text-white">5</button>
          <button data-key="6" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-xl text-white">6</button>
          <button data-key="+" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-2xl font-black text-[#10B981] flex items-center justify-center">+</button>

          <!-- Fila 4: 1, 2, 3 | = (Botón Verde Principal) -->
          <button data-key="1" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-xl text-white">1</button>
          <button data-key="2" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-xl text-white">2</button>
          <button data-key="3" type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-xl text-white">3</button>
          <button data-key="CALCULATE" type="button" class="calc-mockup-equal-btn row-span-2 py-3.5 rounded-2xl text-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer">=</button>

          <!-- Fila 5: 0, , -->
          <button data-key="0" type="button" class="calc-mockup-btn col-span-2 py-3.5 rounded-2xl text-xl text-white">0</button>
          <button data-key="," type="button" class="calc-mockup-btn py-3.5 rounded-2xl text-2xl text-white font-black">,</button>

        </div>

      </div>
    `;

    this.attachEvents();
    this.calculate();
    if (window.lucide) window.lucide.createIcons();
  }

  attachEvents() {
    const ratePills = document.querySelectorAll('.rate-pill-btn');
    const swapTop = document.getElementById('swap-currencies-top');
    const swapBadge = document.getElementById('swap-badge-icon');
    const keypadKeys = document.querySelectorAll('#calc-keypad button');

    const triggerSwap = () => {
      const localCode = this.currentCountry.currency.code;
      if (this.fromCurrency === 'USD') {
        this.fromCurrency = localCode;
        this.toCurrency = 'USD';
      } else {
        this.fromCurrency = 'USD';
        this.toCurrency = localCode;
      }
      this.calculate();
    };

    swapTop?.addEventListener('click', triggerSwap);
    swapBadge?.addEventListener('click', triggerSwap);

    ratePills.forEach(pill => {
      pill.addEventListener('click', () => {
        this.selectedRateId = pill.getAttribute('data-rate');
        this.render();
      });
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
    } else if (key === ',' || key === '.') {
      if (!this.amountStr.includes(',')) {
        this.amountStr += ',';
      }
    } else if (key === 'C') {
      this.amountStr = '0';
      this.previousValue = null;
      this.pendingOp = null;
    } else if (key === 'BACKSPACE') {
      if (this.amountStr.length > 1) {
        this.amountStr = this.amountStr.slice(0, -1);
      } else {
        this.amountStr = '0';
      }
    } else if (key === '+' || key === '-' || key === '*' || key === '/') {
      this.previousValue = parseFloat(this.amountStr.replace(',', '.')) || 0;
      this.pendingOp = key;
      this.amountStr = '0';
    } else if (key === 'CALCULATE') {
      if (this.pendingOp && this.previousValue !== null) {
        const currentVal = parseFloat(this.amountStr.replace(',', '.')) || 0;
        let res = currentVal;
        if (this.pendingOp === '+') res = this.previousValue + currentVal;
        if (this.pendingOp === '-') res = this.previousValue - currentVal;
        if (this.pendingOp === '*') res = this.previousValue * currentVal;
        if (this.pendingOp === '/') res = currentVal !== 0 ? this.previousValue / currentVal : 0;

        this.amountStr = res.toFixed(2).replace('.', ',');
        this.pendingOp = null;
        this.previousValue = null;
      }
    }

    const displayInput = document.getElementById('calc-input-display');
    if (displayInput) {
      displayInput.textContent = `${this.amountStr} ${this.fromCurrency === 'USD' ? '$' : this.fromCurrency}`;
    }

    this.calculate();
  }

  calculate() {
    const rates = this.currentCountry.rates;
    const activeRateObj = rates[this.selectedRateId] || Object.values(rates)[0];
    const activeRate = activeRateObj ? activeRateObj.value : 1;
    const localCode = this.currentCountry.currency.code;
    const localSymbol = this.currentCountry.currency.symbol;

    const numericAmount = parseFloat(this.amountStr.replace(',', '.')) || 0;

    // Convertir de origen a USD equivalente
    let inUSD = 0;
    if (this.fromCurrency === 'USD' || this.fromCurrency === 'USDT') {
      inUSD = numericAmount;
    } else {
      inUSD = numericAmount / activeRate;
    }

    // Convertir de USD a destino
    let finalResult = 0;
    if (this.toCurrency === 'USD' || this.toCurrency === 'USDT') {
      finalResult = inUSD;
    } else {
      finalResult = inUSD * activeRate;
    }

    const greenResultEl = document.getElementById('calc-green-result');
    const rateBadgeEl = document.getElementById('rate-badge-pill');
    const nameTagEl = document.getElementById('active-rate-name-tag');

    const formattedFrom = numericAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedTo = finalResult.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (greenResultEl) {
      if (this.fromCurrency === 'USD') {
        greenResultEl.textContent = `$${formattedFrom} = ${formattedTo} ${localSymbol}`;
      } else {
        greenResultEl.textContent = `${formattedFrom} ${localSymbol} = $${formattedTo}`;
      }
    }

    if (rateBadgeEl) {
      rateBadgeEl.textContent = `Tasa: ${activeRate.toFixed(2).replace('.', ',')}`;
    }

    if (nameTagEl) {
      nameTagEl.textContent = `${activeRateObj ? activeRateObj.name.split(' ')[0] : 'BCV'} ${this.fromCurrency}`;
    }
  }

  destroy() {}
}
