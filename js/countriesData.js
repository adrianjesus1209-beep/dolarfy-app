/**
 * Catálogo de Países y Tasas Financieras por País
 * Solo fuentes oficiales venezolanas: BCV (USD y EUR)
 * Los valores aquí son un snapshot de referencia (PLACEHOLDER); se sobreescriben
 * en runtime con las tasas reales de ve.dolarapi.com y bcv.org.ve.
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
        name: 'Dólar Paralelo',
        code: 'USD/VES',
        value: null,
        change: 0,
        currency: 'VES',
        type: 'parallel',
        icon: 'trending-up',
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
