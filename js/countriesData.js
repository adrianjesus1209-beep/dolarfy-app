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
        value: 807.39,
        change: 0.15,
        currency: 'VES',
        type: 'official',
        icon: 'building-2',
        nextDay: {
          published: true,
          isOfficial: true,
          value: 813.74,
          change: 0.79,
          date: 'Fecha Valor: Lunes, 07 Septiembre 2026',
          scheduleText: 'Cotización oficial emitida en bcv.org.ve'
        }
      },
      euro: {
        id: 'euro',
        name: 'Euro Oficial (BCV)',
        code: 'EUR/VES',
        value: 938.19,
        change: 0.12,
        currency: 'VES',
        type: 'official',
        icon: 'euro',
        nextDay: {
          published: true,
          isOfficial: true,
          value: 945.65,
          change: 0.80,
          date: 'Fecha Valor: Lunes, 07 Septiembre 2026',
          scheduleText: 'Cotización oficial emitida en bcv.org.ve'
        }
      },
      usdt: {
        id: 'usdt',
        name: 'Binance USDT (P2P)',
        code: 'USDT/VES',
        value: 940.16,
        change: 0.22,
        currency: 'VES',
        type: 'crypto',
        icon: 'coins',
        nextDay: {
          published: true,
          isOfficial: false,
          value: 940.16,
          change: 0.22,
          date: 'Mercado Binance P2P',
          scheduleText: 'Cotización P2P en vivo'
        }
      }
    }
  }
];
