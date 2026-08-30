import { mockEngine } from '../mockData.js';
import { formatCurrency } from '../utils/formatters.js';
import { calcHistoryService } from '../calcHistoryService.js';

export class CalculatorView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.expression = '0';
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

  getPillLabel(rateKey, rateObj) {
    if (!rateObj) return rateKey || '';
    const nameLower = rateObj.name.toLowerCase();
    if (rateKey === 'usdc' || rateObj.id === 'usdc' || nameLower.includes('usdc')) {
      return 'USDC';
    }
    if (rateKey === 'usdt' || rateObj.id === 'usdt' || nameLower.includes('binance') || nameLower.includes('usdt')) {
      return 'USDT';
    }
    if (rateKey === 'bcv') return 'BCV';
    if (rateKey === 'paralelo') return 'Paralelo';
    if (rateKey === 'blue') return 'Blue';
    if (rateKey === 'oficial') return 'Oficial';
    if (rateKey === 'trm') return 'TRM';
    if (rateKey === 'callejero') return 'Callejero';
    if (rateKey === 'banxico') return 'Banxico';
    if (rateKey === 'ventanilla') return 'Ventanilla';
    if (rateKey === 'observado') return 'Observado';
    if (rateKey === 'informal') return 'Informal';
    if (rateKey === 'sunat') return 'SUNAT';
    if (rateKey === 'ocona') return 'Ocoña';
    if (rateKey === 'comercial') return 'Comercial';
    if (rateKey === 'turismo') return 'Turismo';
    if (rateKey === 'bancentral') return 'BCRD';
    if (rateKey === 'mercado') return 'Mercado';
    if (rateKey === 'mep') return 'MEP';
    if (rateKey === 'euro') return 'Euro';
    if (rateKey === 'eurusd') return 'EUR';
    if (rateKey === 'gbpusd' || rateKey === 'gbpeur') return 'GBP';
    if (rateKey === 'usdeur') return 'USD';
    if (rateKey === 'base') return rateObj.currency === 'USD' ? 'Dólar' : 'Euro';

    return rateObj.name.split(' ')[0];
  }

  getCurrencySymbol(code) {
    const symbols = {
      USD: '$', VES: 'Bs.', COP: '$', ARS: '$', MXN: '$', CLP: '$',
      PEN: 'S/', BRL: 'R$', DOP: 'RD$', EUR: '€', USDT: '₮', USDC: '₮', GBP: '£'
    };
    return symbols[code] || '$';
  }

  render() {
    this.currentCountry = mockEngine.getCurrentCountry();
    const rates = this.currentCountry.rates;
    const rateKeys = Object.keys(rates);

    if (!rates[this.selectedRateId]) {
      this.selectedRateId = this.currentCountry.defaultRateId && rates[this.selectedRateId]
        ? this.currentCountry.defaultRateId
        : rateKeys[0];
    }

    const activeRateObj = rates[this.selectedRateId] || Object.values(rates)[0];
    const activeRate = activeRateObj ? activeRateObj.value : 1;
    const [baseCode, targetCode] = activeRateObj && activeRateObj.code ? activeRateObj.code.split('/') : ['USD', this.currentCountry.currency.code];
    const ratePair = [baseCode, targetCode];

    // Ajustar monedas de origen y destino si alguna no pertenece al par de la tasa activa
    if (!ratePair.includes(this.fromCurrency) || !ratePair.includes(this.toCurrency)) {
      if (targetCode === 'USD' && baseCode !== 'USD') {
        this.fromCurrency = 'USD';
        this.toCurrency = baseCode;
      } else {
        this.fromCurrency = baseCode;
        this.toCurrency = targetCode;
      }
    }

    const fromSym = this.getCurrencySymbol(this.fromCurrency);
    const toSym = this.getCurrencySymbol(this.toCurrency);

    this.container.innerHTML = `
      <div class="space-y-3 pb-24 animate-fade-in max-w-md mx-auto">
        
        <!-- 1. Barra Superior de Píldoras (Tasas del país) -->
        <div class="w-full text-xs">
          <!-- Píldoras de Tasas del País (Distribución perfecta en grid a todo el ancho) -->
          <div class="grid grid-cols-4 gap-1 bg-black/40 p-1 rounded-2xl border border-white/10 w-full items-center" id="rate-pills-group">
            ${rateKeys.map(key => {
              const r = rates[key];
              const isSelected = this.selectedRateId === key;
              const pillLabel = this.getPillLabel(key, r);
              return `
                <button data-rate="${key}" type="button" class="rate-pill-btn w-full py-1.5 px-1 rounded-xl font-bold text-center transition-all text-xs truncate flex items-center justify-center ${isSelected ? 'bg-emerald-500 text-black shadow-sm font-extrabold' : 'text-gray-400 hover:text-white'}">
                  ${pillLabel}
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 2. Pantalla Digital de Conversión Integrada -->
        <div class="glass-card rounded-3xl p-4 relative space-y-3 shadow-2xl border border-white/10 bg-[#111622]/95">
          
          <!-- Top info bar inside card -->
          <div class="flex items-center justify-between">
            <span id="rate-badge-pill" class="bg-black/50 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold px-2.5 py-1 rounded-full">
              Tasa: ${activeRate.toFixed(activeRate < 10 ? 4 : 2)}
            </span>
            <div class="flex items-center space-x-3 text-cyan-400">
              <button id="calc-shift-btn" type="button" title="Shift / Swap" class="hover:text-white transition-all cursor-pointer"><i data-lucide="code-2" class="w-4 h-4"></i></button>
              <button id="swap-currency-btn" type="button" title="Intercambiar divisas" class="hover:text-white transition-all cursor-pointer"><i data-lucide="arrow-up-down" class="w-4 h-4"></i></button>
              <button id="calc-history-btn" type="button" title="Historial de conversiones" class="hover:text-emerald-400 transition-all cursor-pointer"><i data-lucide="history" class="w-4 h-4 text-emerald-400"></i></button>
            </div>
          </div>

          <!-- User typed amount display (Middle Right) -->
          <div class="text-right py-1">
            <span id="calc-display-input" class="text-3xl sm:text-4xl font-black text-white tracking-tight break-all">${this.expression} ${fromSym}</span>
          </div>

          <!-- Large Green Equality Result Display (Center) -->
          <div class="text-left border-t border-white/5 pt-2 flex justify-between items-center">
            <p id="calc-equality-display" class="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight leading-tight">
              ${fromSym}0,00 = 0,00 ${toSym}
            </p>
            <button id="copy-result-btn" type="button" title="Copiar resultado" class="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-emerald-400 active:scale-95 transition-all cursor-pointer">
              <i data-lucide="copy" class="w-4 h-4"></i>
            </button>
          </div>

          <!-- Mode Badge at Bottom Right of card -->
          <div class="flex justify-end items-center space-x-1 text-[10px] text-gray-400 font-bold uppercase tracking-wider pt-1">
            <span id="calc-mode-badge">${this.fromCurrency} → ${this.toCurrency}</span>
            <i data-lucide="arrow-left-right" class="w-3 h-3 text-cyan-400"></i>
          </div>

        </div>

        <!-- 3. Teclado Numérico de 5 Filas -->
        <div class="grid grid-cols-4 gap-2 pt-1" id="calc-keypad">
          <!-- Row 1 -->
          <button data-key="C" type="button" class="calc-key-btn calc-key-clear py-3.5 rounded-2xl text-xl font-black text-amber-400">C</button>
          <button data-key="/" type="button" class="calc-key-btn calc-key-op py-3.5 rounded-2xl text-2xl font-bold flex items-center justify-center text-emerald-400">÷</button>
          <button data-key="*" type="button" class="calc-key-btn calc-key-op py-3.5 rounded-2xl text-2xl font-bold flex items-center justify-center text-emerald-400">×</button>
          <button data-key="BACKSPACE" type="button" class="calc-key-btn py-3.5 rounded-2xl text-sm font-extrabold flex items-center justify-center text-amber-400 border-amber-500/30">
            <i data-lucide="delete" class="w-5 h-5"></i>
          </button>

          <!-- Row 2 -->
          <button data-key="7" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">7</button>
          <button data-key="8" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">8</button>
          <button data-key="9" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">9</button>
          <button data-key="-" type="button" class="calc-key-btn calc-key-op py-3.5 rounded-2xl text-3xl font-bold flex items-center justify-center text-emerald-400">-</button>

          <!-- Row 3 -->
          <button data-key="4" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">4</button>
          <button data-key="5" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">5</button>
          <button data-key="6" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">6</button>
          <button data-key="+" type="button" class="calc-key-btn calc-key-op py-3.5 rounded-2xl text-2xl font-bold flex items-center justify-center text-emerald-400">+</button>

          <!-- Row 4 & 5 (with row-span-2 Equals button) -->
          <button data-key="1" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">1</button>
          <button data-key="2" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">2</button>
          <button data-key="3" type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">3</button>
          <button data-key="=" type="button" class="calc-key-btn calc-key-equals row-span-2 rounded-2xl text-3xl font-black flex items-center justify-center shadow-lg shadow-emerald-500/30">=</button>

          <button data-key="0" type="button" class="calc-key-btn col-span-2 py-3.5 rounded-2xl text-2xl text-white font-bold">0</button>
          <button data-key="," type="button" class="calc-key-btn py-3.5 rounded-2xl text-2xl text-white font-bold">,</button>
        </div>

      </div>
    `;

    this.attachEvents();
    this.calculate();
    if (window.lucide) window.lucide.createIcons();
  }

  attachEvents() {
    const ratePills = document.querySelectorAll('.rate-pill-btn');
    const swapBtn = document.getElementById('swap-currency-btn');
    const shiftBtn = document.getElementById('calc-shift-btn');
    const copyBtn = document.getElementById('copy-result-btn');
    const historyBtn = document.getElementById('calc-history-btn');
    const keypadKeys = document.querySelectorAll('#calc-keypad button');

    ratePills.forEach(btn => {
      btn.addEventListener('click', () => {
        const newRateId = btn.getAttribute('data-rate');
        if (this.selectedRateId !== newRateId) {
          this.selectedRateId = newRateId;
          const rates = this.currentCountry.rates;
          const newRateObj = rates[newRateId];
          if (newRateObj && newRateObj.code) {
            const [baseCode, targetCode] = newRateObj.code.split('/');
            if (targetCode === 'USD' && baseCode !== 'USD') {
              this.fromCurrency = 'USD';
              this.toCurrency = baseCode;
            } else {
              this.fromCurrency = baseCode;
              this.toCurrency = targetCode;
            }
          }
          this.render();
        }
      });
    });

    const triggerSwap = () => {
      const temp = this.fromCurrency;
      this.fromCurrency = this.toCurrency;
      this.toCurrency = temp;
      this.calculate();
    };

    swapBtn?.addEventListener('click', triggerSwap);
    shiftBtn?.addEventListener('click', triggerSwap);

    copyBtn?.addEventListener('click', () => {
      const displayEl = document.getElementById('calc-equality-display');
      if (!displayEl) return;
      const textToCopy = displayEl.textContent.trim();

      navigator.clipboard.writeText(textToCopy).then(() => {
        copyBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4 text-emerald-400"></i>`;
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => {
          copyBtn.innerHTML = `<i data-lucide="copy" class="w-4 h-4 text-gray-400"></i>`;
          if (window.lucide) window.lucide.createIcons();
        }, 2000);
      }).catch(e => console.warn('Clipboard write error:', e));
    });

    historyBtn?.addEventListener('click', () => {
      this.openHistoryModal();
    });

    keypadKeys.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        this.handleKeyPress(key);
      });
    });
  }

  handleKeyPress(key) {
    if (key >= '0' && key <= '9') {
      if (this.expression === '0') {
        this.expression = key;
      } else {
        if (this.expression.length < 14) {
          this.expression += key;
        }
      }
    } else if (key === ',' || key === '.') {
      const lastToken = this.expression.split(/[\s+\-*\/]/).pop();
      if (!lastToken.includes('.') && !lastToken.includes(',')) {
        this.expression += ',';
      }
    } else if (key === '+' || key === '-' || key === '*' || key === '/') {
      const trimmed = this.expression.trim();
      const lastChar = trimmed.slice(-1);
      if (['+', '-', '*', '/'].includes(lastChar)) {
        this.expression = trimmed.slice(0, -1) + key;
      } else {
        this.expression += ` ${key} `;
      }
    } else if (key === 'C') {
      this.expression = '0';
    } else if (key === 'BACKSPACE') {
      const trimmed = this.expression.trim();
      if (trimmed.length > 1) {
        this.expression = trimmed.slice(0, -1).trim();
        if (this.expression === '') this.expression = '0';
      } else {
        this.expression = '0';
      }
    } else if (key === '=') {
      this.evaluateExpression();
      this.saveToHistory();
    }

    const rates = this.currentCountry.rates;
    const activeRateObj = rates[this.selectedRateId] || Object.values(rates)[0];
    const [baseCode, targetCode] = activeRateObj && activeRateObj.code ? activeRateObj.code.split('/') : ['USD', this.currentCountry.currency.code];
    const currentSym = this.fromCurrency === baseCode ? (baseCode === 'EUR' ? '€' : (baseCode === 'GBP' ? '£' : '$')) : (this.fromCurrency === 'USD' ? '$' : '$');

    const displayInput = document.getElementById('calc-display-input');
    if (displayInput) {
      displayInput.textContent = `${this.expression} ${currentSym}`;
    }

    const modeBadge = document.getElementById('calc-mode-badge');
    if (modeBadge) {
      modeBadge.textContent = `${this.fromCurrency} → ${this.toCurrency}`;
    }

    this.calculate();
  }

  evaluateExpression() {
    try {
      const mathExpr = this.expression.replace(/,/g, '.');
      const fn = new Function(`return ${mathExpr}`);
      const evalResult = fn();
      if (!isNaN(evalResult) && isFinite(evalResult)) {
        this.expression = evalResult.toString().replace(/\./g, ',');
      }
    } catch (e) {}
  }

  saveToHistory() {
    const equalityEl = document.getElementById('calc-equality-display');
    if (!equalityEl) return;
    const rates = this.currentCountry.rates;
    const activeRateObj = rates[this.selectedRateId] || Object.values(rates)[0];

    calcHistoryService.addEntry({
      expression: this.expression,
      resultText: equalityEl.textContent.trim(),
      countryId: this.currentCountry.id,
      countryName: this.currentCountry.name,
      flagUrl: this.currentCountry.flagUrl,
      rateName: activeRateObj ? activeRateObj.name : '',
      rateId: this.selectedRateId,
      rateValue: activeRateObj ? activeRateObj.value : 1,
      fromCurrency: this.fromCurrency,
      toCurrency: this.toCurrency
    });
  }

  openHistoryModal() {
    let container = document.getElementById('calc-history-modal-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'calc-history-modal-container';
      document.body.appendChild(container);
    }

    const history = calcHistoryService.getHistory();

    container.innerHTML = `
      <div id="calc-history-backdrop" class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 animate-fade-in">
        <div class="w-full max-w-md bg-[#0F141C] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
          
          <!-- Modal Header -->
          <div class="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
            <div class="flex items-center space-x-2">
              <i data-lucide="history" class="w-5 h-5 text-emerald-400"></i>
              <h3 class="text-base font-extrabold text-white">Historial de Conversiones</h3>
            </div>
            <div class="flex items-center space-x-2">
              ${history.length > 0 ? `
                <button id="clear-calc-history-btn" type="button" class="text-xs text-red-400 hover:text-red-300 font-bold px-2 py-1 bg-red-500/10 rounded-lg border border-red-500/20">
                  Borrar todo
                </button>
              ` : ''}
              <button id="close-calc-history-btn" type="button" class="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white">
                <i data-lucide="x" class="w-5 h-5"></i>
              </button>
            </div>
          </div>

          <!-- History Content -->
          <div class="p-4 overflow-y-auto space-y-2.5 max-h-[65vh] custom-scroll">
            ${history.length === 0 ? `
              <div class="text-center py-10 bg-black/20 rounded-2xl border border-white/5 space-y-2">
                <i data-lucide="calculator" class="w-8 h-8 text-gray-600 mx-auto"></i>
                <p class="text-xs text-gray-400 font-semibold">Sin conversiones en el historial</p>
                <p class="text-[10px] text-gray-500">Realiza un cálculo y presiona = para guardarlo aquí.</p>
              </div>
            ` : `
              ${history.map(item => `
                <div data-id="${item.id}" class="calc-history-item glass-card-interactive rounded-2xl p-3 border border-white/10 flex items-center justify-between cursor-pointer hover:border-emerald-500/40">
                  <div class="flex items-center space-x-3">
                    <img src="${item.flagUrl}" alt="${item.countryName}" class="w-6 h-6 rounded-full object-cover">
                    <div>
                      <p class="text-xs font-black text-emerald-400">${item.resultText}</p>
                      <p class="text-[10px] text-gray-400">${item.rateName} • ${item.timestamp}</p>
                    </div>
                  </div>
                  <i data-lucide="arrow-up-right" class="w-4 h-4 text-cyan-400"></i>
                </div>
              `).join('')}
            `}
          </div>

        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Eventos del Modal
    const backdrop = document.getElementById('calc-history-backdrop');
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) container.innerHTML = '';
    });

    document.getElementById('close-calc-history-btn')?.addEventListener('click', () => {
      container.innerHTML = '';
    });

    document.getElementById('clear-calc-history-btn')?.addEventListener('click', () => {
      calcHistoryService.clearHistory();
      this.openHistoryModal();
    });

    const items = container.querySelectorAll('.calc-history-item');
    items.forEach(itemEl => {
      itemEl.addEventListener('click', () => {
        const id = parseInt(itemEl.getAttribute('data-id'));
        const entry = history.find(h => h.id === id);
        if (entry) {
          this.expression = entry.expression;
          this.selectedRateId = entry.rateId;
          this.fromCurrency = entry.fromCurrency;
          this.toCurrency = entry.toCurrency;
          container.innerHTML = '';
          this.render();
        }
      });
    });
  }

  calculate() {
    const rates = this.currentCountry.rates;
    const activeRateObj = rates[this.selectedRateId] || Object.values(rates)[0];
    if (!activeRateObj) return;

    const activeRate = activeRateObj.value || 1;
    const [baseCode, targetCode] = activeRateObj.code ? activeRateObj.code.split('/') : ['USD', this.currentCountry.currency.code];

    let numericAmount = 0;
    try {
      const mathExpr = this.expression.replace(/,/g, '.');
      const fn = new Function(`return ${mathExpr}`);
      const res = fn();
      if (!isNaN(res) && isFinite(res)) {
        numericAmount = res;
      }
    } catch (e) {
      numericAmount = parseFloat(this.expression.replace(/,/g, '.')) || 0;
    }

    let finalResult = 0;
    if (this.fromCurrency === baseCode && this.toCurrency === targetCode) {
      finalResult = numericAmount * activeRate;
    } else if (this.fromCurrency === targetCode && this.toCurrency === baseCode) {
      finalResult = numericAmount / activeRate;
    } else if (this.fromCurrency === this.toCurrency) {
      finalResult = numericAmount;
    } else {
      if (this.fromCurrency === baseCode) {
        finalResult = numericAmount * activeRate;
      } else {
        finalResult = numericAmount / activeRate;
      }
    }

    const equalityEl = document.getElementById('calc-equality-display');
    if (equalityEl) {
      const symbols = {
        USD: '$', VES: 'Bs.', COP: '$', ARS: '$', MXN: '$', CLP: '$',
        PEN: 'S/', BRL: 'R$', DOP: 'RD$', EUR: '€', USDT: '₮', GBP: '£'
      };
      const fromSym = symbols[this.fromCurrency] || '$';
      const toSym = symbols[this.toCurrency] || '$';

      const fromFormatted = numericAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const toFormatted = finalResult.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: finalResult < 10 ? 4 : 2 });

      equalityEl.textContent = `${fromSym}${fromFormatted} = ${toFormatted} ${toSym}`;
    }
  }

  destroy() {}
}
