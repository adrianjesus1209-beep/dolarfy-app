/**
 * Catálogo de Países y Tasas Financieras por País
 * Solo fuentes oficiales venezolanas: BCV (USD y EUR)
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
        value: null,
        change: 0,
        currency: 'VES',
        type: 'official',
        icon: 'building-2',
        nextDay: {
          published: false,
          value: null,
          change: 0,
          date: 'Consultando BCV Oficial...',
          scheduleText: 'Cotización emitida por el Banco Central de Venezuela'
        }
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
        nextDay: {
          published: false,
          value: null,
          change: 0,
          date: 'Consultando BCV Oficial...',
          scheduleText: 'Cotización emitida por el Banco Central de Venezuela'
        }
      },
      usdt: {
        id: 'usdt',
        name: 'Binance USDT (P2P)',
        code: 'USDT/VES',
        value: null,
        change: 0,
        currency: 'VES',
        type: 'crypto',
        icon: 'coins',
        nextDay: {
          published: true,
          value: null,
          change: 0,
          date: 'Pronóstico Binance P2P',
          scheduleText: 'Proyección estimada del mercado P2P'
        }
      }
    }
  }
];
