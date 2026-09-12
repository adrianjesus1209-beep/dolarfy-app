/**
 * Catálogo de países y tasas financieras de Dolarfy
 * Los valores son placeholders de arranque; se sobreescriben con datos reales en runtime.
 */

export const COUNTRIES_DATA = [
  {
    id: 'VE',
    name: 'Venezuela',
    flag: '🇻🇪',
    flagUrl: 'https://flagcdn.com/w40/ve.png',
    officialSchedule: '5:00 PM VET (Cierre BCV Oficial)',
    currency: { code: 'VES', symbol: 'Bs', name: 'Bolívar Digital' },
    defaultRateId: 'bcv',
    rates: {
      bcv: {
        id: 'bcv',
        name: 'Dólar Oficial (BCV)',
        code: 'USD/VES',
        value: null,
        change: 0,
        currency: 'VES',
        type: 'official',
        icon: 'building-2',
        nextDay: null
      },
      paralelo: {
        id: 'paralelo',
        name: 'USDT (Binance P2P)',
        code: 'USDT/VES',
        value: null,
        change: 0,
        currency: 'VES',
        type: 'crypto',
        icon: 'coins',
        nextDay: null
      },
      euro: {
        id: 'euro',
        name: 'Euro Oficial (BCV)',
        code: 'EUR/VES',
        value: null,
        change: 0,
        currency: 'VES',
        type: 'official',
        icon: 'euro',
        nextDay: null
      }
    }
  }
];
