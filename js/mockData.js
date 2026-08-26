/**
 * Mock Data Engine reactivo con fluctuación simulada en tiempo real
 */

class MockDataEngine {
  constructor() {
    this.rates = {
      bcv: {
        id: 'bcv',
        name: 'Dólar Oficial (BCV)',
        code: 'USD/VES',
        value: 785.07,
        change: 0.12,
        currency: 'VES',
        type: 'official',
        icon: 'building-2',
        updatedAt: new Date()
      },
      paralelo: {
        id: 'paralelo',
        name: 'Dólar Paralelo',
        code: 'USD/VES',
        value: 917.50,
        change: 0.75,
        currency: 'VES',
        type: 'parallel',
        icon: 'trending-up',
        updatedAt: new Date()
      },
      euro: {
        id: 'euro',
        name: 'Euro Oficial (BCV)',
        code: 'EUR/VES',
        value: 854.15,
        change: 0.08,
        currency: 'VES',
        type: 'official',
        icon: 'euro',
        updatedAt: new Date()
      },
      usdt: {
        id: 'usdt',
        name: 'Binance USDT (P2P)',
        code: 'USDT/VES',
        value: 922.30,
        change: 0.45,
        currency: 'VES',
        type: 'crypto',
        icon: 'coins',
        updatedAt: new Date()
      },
      eurusd: {
        id: 'eurusd',
        name: 'EUR / USD Global',
        code: 'EUR/USD',
        value: 1.088,
        change: -0.04,
        currency: 'USD',
        type: 'forex',
        icon: 'globe',
        updatedAt: new Date()
      }
    };

    this.listeners = [];
    // Desactivado: variaciones automáticas deshabilitadas
    // this.startLiveFluctuations();
  }

  getRates() {
    return { ...this.rates };
  }

  getRate(id) {
    return this.rates[id];
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notifyListeners(updatedRateId, direction) {
    this.listeners.forEach(listener => listener(this.rates, updatedRateId, direction));
  }

  startLiveFluctuations() {
    // Simular variaciones ligeras de tasas cada 30 segundos
    setInterval(() => {
      const rateKeys = Object.keys(this.rates);
      const randomKey = rateKeys[Math.floor(Math.random() * rateKeys.length)];
      const targetRate = this.rates[randomKey];

      // Variación pequeña de -0.15% a +0.15%
      const deltaPercent = (Math.random() * 0.3 - 0.15);
      const factor = 1 + (deltaPercent / 100);
      const newValue = parseFloat((targetRate.value * factor).toFixed(targetRate.id === 'eurusd' ? 4 : 2));
      
      const direction = newValue >= targetRate.value ? 'up' : 'down';
      
      targetRate.value = newValue;
      targetRate.change = parseFloat((targetRate.change + deltaPercent).toFixed(2));
      targetRate.updatedAt = new Date();

      this.notifyListeners(randomKey, direction);
    }, 30000);
  }
}

export const mockEngine = new MockDataEngine();
