/**
 * Catálogo de Países y Tasas Financieras por País
 */

export const COUNTRIES_DATA = [
  {
    id: 'VE',
    name: 'Venezuela',
    flag: '🇻🇪',
    flagUrl: 'https://flagcdn.com/w40/ve.png',
    region: 'latam',
    officialSchedule: '5:00 PM VET (Cierre BCV Oficial)',
    currency: { code: 'VES', symbol: 'Bs', name: 'Bolívar Digital' },
    defaultRateId: 'bcv',
    rates: {
      bcv: {
        id: 'bcv',
        name: 'Dólar Oficial (BCV)',
        code: 'USD/VES',
        value: 804.81,
        change: 0.12,
        currency: 'VES',
        type: 'official',
        icon: 'building-2',
        nextDay: {
          published: false,
          value: 807.39,
          change: 0.32,
          date: 'Fecha Valor no emitida aún',
          scheduleText: 'Publicada oficialmente por el Banco Central en la tarde'
        }
      },
      paralelo: {
        id: 'paralelo',
        name: 'Dólar Paralelo',
        code: 'USD/VES',
        value: 948.04,
        change: 0.75,
        currency: 'VES',
        type: 'parallel',
        icon: 'trending-up'
      },
      euro: {
        id: 'euro',
        name: 'Euro Oficial (BCV)',
        code: 'EUR/VES',
        value: 938.45,
        change: 0.08,
        currency: 'VES',
        type: 'official',
        icon: 'euro',
        nextDay: {
          published: false,
          value: 938.45,
          change: 0.32,
          date: 'Fecha Valor no emitida aún',
          scheduleText: 'Publicada oficialmente por el Banco Central en la tarde'
        }
      },
      usdt: {
        id: 'usdt',
        name: 'Binance USDT (P2P)',
        code: 'USDT/VES',
        value: 952.78,
        change: 0.45,
        currency: 'VES',
        type: 'crypto',
        icon: 'coins'
      }
    }
  }
];
