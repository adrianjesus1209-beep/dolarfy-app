/**
 * Catálogo de Países y Tasas Financieras por País
 */

export const COUNTRIES_DATA = [
  // --- LATAM ---
  {
    id: 'VE',
    name: 'Venezuela',
    flag: '🇻🇪',
    flagUrl: 'https://flagcdn.com/w40/ve.png',
    region: 'latam',
    currency: { code: 'VES', symbol: 'Bs', name: 'Bolívar Digital' },
    defaultRateId: 'bcv',
    rates: {
      bcv: {
        id: 'bcv',
        name: 'Dólar Oficial (BCV)',
        code: 'USD/VES',
        value: 791.67,
        change: 0.12,
        currency: 'VES',
        type: 'official',
        icon: 'building-2'
      },
      paralelo: {
        id: 'paralelo',
        name: 'Dólar Paralelo',
        code: 'USD/VES',
        value: 922.24,
        change: 0.75,
        currency: 'VES',
        type: 'parallel',
        icon: 'trending-up'
      },
      euro: {
        id: 'euro',
        name: 'Euro Oficial (BCV)',
        code: 'EUR/VES',
        value: 861.34,
        change: 0.08,
        currency: 'VES',
        type: 'official',
        icon: 'euro'
      },
      usdt: {
        id: 'usdt',
        name: 'Binance USDT (P2P)',
        code: 'USDT/VES',
        value: 926.85,
        change: 0.45,
        currency: 'VES',
        type: 'crypto',
        icon: 'coins'
      }
    }
  },
  {
    id: 'CO',
    name: 'Colombia',
    flag: '🇨🇴',
    flagUrl: 'https://flagcdn.com/w40/co.png',
    region: 'latam',
    currency: { code: 'COP', symbol: '$', name: 'Peso Colombiano' },
    defaultRateId: 'trm',
    rates: {
      trm: {
        id: 'trm',
        name: 'Dólar TRM (Oficial)',
        code: 'USD/COP',
        value: 3107.65,
        change: -0.35,
        currency: 'COP',
        type: 'official',
        icon: 'building-2'
      },
      callejero: {
        id: 'callejero',
        name: 'Dólar Casa de Cambio',
        code: 'USD/COP',
        value: 3155.00,
        change: 0.20,
        currency: 'COP',
        type: 'parallel',
        icon: 'trending-up'
      },
      euro: {
        id: 'euro',
        name: 'Euro Oficial (TRM)',
        code: 'EUR/COP',
        value: 3607.75,
        change: -0.15,
        currency: 'COP',
        type: 'official',
        icon: 'euro'
      },
      usdt: {
        id: 'usdt',
        name: 'Binance USDT (P2P)',
        code: 'USDT/COP',
        value: 3138.70,
        change: 0.10,
        currency: 'COP',
        type: 'crypto',
        icon: 'coins'
      }
    }
  },
  {
    id: 'AR',
    name: 'Argentina',
    flag: '🇦🇷',
    flagUrl: 'https://flagcdn.com/w40/ar.png',
    region: 'latam',
    currency: { code: 'ARS', symbol: '$', name: 'Peso Argentino' },
    defaultRateId: 'blue',
    rates: {
      oficial: {
        id: 'oficial',
        name: 'Dólar Oficial (BNA)',
        code: 'USD/ARS',
        value: 1535.00,
        change: 0.05,
        currency: 'ARS',
        type: 'official',
        icon: 'building-2'
      },
      blue: {
        id: 'blue',
        name: 'Dólar Blue (Informal)',
        code: 'USD/ARS',
        value: 1555.00,
        change: 1.15,
        currency: 'ARS',
        type: 'parallel',
        icon: 'trending-up'
      },
      mep: {
        id: 'mep',
        name: 'Dólar MEP / Bolsa',
        code: 'USD/ARS',
        value: 1544.10,
        change: 0.40,
        currency: 'ARS',
        type: 'market',
        icon: 'line-chart'
      },
      usdt: {
        id: 'usdt',
        name: 'Dólar Cripto (USDT)',
        code: 'USDT/ARS',
        value: 1595.96,
        change: 0.80,
        currency: 'ARS',
        type: 'crypto',
        icon: 'coins'
      }
    }
  },
  {
    id: 'MX',
    name: 'México',
    flag: '🇲🇽',
    flagUrl: 'https://flagcdn.com/w40/mx.png',
    region: 'latam',
    currency: { code: 'MXN', symbol: '$', name: 'Peso Mexicano' },
    defaultRateId: 'banxico',
    rates: {
      banxico: {
        id: 'banxico',
        name: 'Dólar Fix (Banxico)',
        code: 'USD/MXN',
        value: 17.01,
        change: -0.18,
        currency: 'MXN',
        type: 'official',
        icon: 'building-2'
      },
      ventanilla: {
        id: 'ventanilla',
        name: 'Dólar Ventanilla (Banco)',
        code: 'USD/MXN',
        value: 17.35,
        change: 0.10,
        currency: 'MXN',
        type: 'market',
        icon: 'landmark'
      },
      euro: {
        id: 'euro',
        name: 'Euro (Banxico)',
        code: 'EUR/MXN',
        value: 19.75,
        change: -0.05,
        currency: 'MXN',
        type: 'official',
        icon: 'euro'
      },
      usdt: {
        id: 'usdt',
        name: 'USDT P2P México',
        code: 'USDT/MXN',
        value: 17.12,
        change: 0.25,
        currency: 'MXN',
        type: 'crypto',
        icon: 'coins'
      }
    }
  },
  {
    id: 'CL',
    name: 'Chile',
    flag: '🇨🇱',
    flagUrl: 'https://flagcdn.com/w40/cl.png',
    region: 'latam',
    currency: { code: 'CLP', symbol: '$', name: 'Peso Chileno' },
    defaultRateId: 'observado',
    rates: {
      observado: {
        id: 'observado',
        name: 'Dólar Observado (BCCh)',
        code: 'USD/CLP',
        value: 925.20,
        change: 0.30,
        currency: 'CLP',
        type: 'official',
        icon: 'building-2'
      },
      informal: {
        id: 'informal',
        name: 'Dólar Informal',
        code: 'USD/CLP',
        value: 938.00,
        change: 0.50,
        currency: 'CLP',
        type: 'parallel',
        icon: 'trending-up'
      },
      euro: {
        id: 'euro',
        name: 'Euro Observado',
        code: 'EUR/CLP',
        value: 1074.12,
        change: 0.12,
        currency: 'CLP',
        type: 'official',
        icon: 'euro'
      },
      usdt: {
        id: 'usdt',
        name: 'USDT P2P Chile',
        code: 'USDT/CLP',
        value: 930.00,
        change: 0.20,
        currency: 'CLP',
        type: 'crypto',
        icon: 'coins'
      }
    }
  },
  {
    id: 'PE',
    name: 'Perú',
    flag: '🇵🇪',
    flagUrl: 'https://flagcdn.com/w40/pe.png',
    region: 'latam',
    currency: { code: 'PEN', symbol: 'S/', name: 'Sol Peruano' },
    defaultRateId: 'sunat',
    rates: {
      sunat: {
        id: 'sunat',
        name: 'Dólar Oficial (SUNAT/BCRP)',
        code: 'USD/PEN',
        value: 3.35,
        change: -0.08,
        currency: 'PEN',
        type: 'official',
        icon: 'building-2'
      },
      ocona: {
        id: 'ocona',
        name: 'Dólar Paralelo (Ocoña)',
        code: 'USD/PEN',
        value: 3.38,
        change: 0.15,
        currency: 'PEN',
        type: 'parallel',
        icon: 'trending-up'
      },
      euro: {
        id: 'euro',
        name: 'Euro (BCRP)',
        code: 'EUR/PEN',
        value: 3.89,
        change: -0.02,
        currency: 'PEN',
        type: 'official',
        icon: 'euro'
      },
      usdt: {
        id: 'usdt',
        name: 'USDT P2P Perú',
        code: 'USDT/PEN',
        value: 3.37,
        change: 0.10,
        currency: 'PEN',
        type: 'crypto',
        icon: 'coins'
      }
    }
  },
  {
    id: 'BR',
    name: 'Brasil',
    flag: '🇧🇷',
    flagUrl: 'https://flagcdn.com/w40/br.png',
    region: 'latam',
    currency: { code: 'BRL', symbol: 'R$', name: 'Real Brasileño' },
    defaultRateId: 'comercial',
    rates: {
      comercial: {
        id: 'comercial',
        name: 'Dólar Comercial (BCB)',
        code: 'USD/BRL',
        value: 5.16,
        change: 0.22,
        currency: 'BRL',
        type: 'official',
        icon: 'building-2'
      },
      turismo: {
        id: 'turismo',
        name: 'Dólar Turismo',
        code: 'USD/BRL',
        value: 5.38,
        change: 0.35,
        currency: 'BRL',
        type: 'market',
        icon: 'plane'
      },
      euro: {
        id: 'euro',
        name: 'Euro Comercial',
        code: 'EUR/BRL',
        value: 5.99,
        change: 0.15,
        currency: 'BRL',
        type: 'official',
        icon: 'euro'
      },
      usdt: {
        id: 'usdt',
        name: 'USDT P2P Brasil',
        code: 'USDT/BRL',
        value: 5.20,
        change: 0.18,
        currency: 'BRL',
        type: 'crypto',
        icon: 'coins'
      }
    }
  },
  {
    id: 'DO',
    name: 'Rep. Dominicana',
    flag: '🇩🇴',
    flagUrl: 'https://flagcdn.com/w40/do.png',
    region: 'latam',
    currency: { code: 'DOP', symbol: 'RD$', name: 'Peso Dominicano' },
    defaultRateId: 'bancentral',
    rates: {
      bancentral: {
        id: 'bancentral',
        name: 'Dólar Banco Central',
        code: 'USD/DOP',
        value: 58.22,
        change: 0.05,
        currency: 'DOP',
        type: 'official',
        icon: 'building-2'
      },
      mercado: {
        id: 'mercado',
        name: 'Dólar Mercado Libre',
        code: 'USD/DOP',
        value: 58.85,
        change: 0.15,
        currency: 'DOP',
        type: 'parallel',
        icon: 'trending-up'
      },
      euro: {
        id: 'euro',
        name: 'Euro Oficial',
        code: 'EUR/DOP',
        value: 67.59,
        change: -0.10,
        currency: 'DOP',
        type: 'official',
        icon: 'euro'
      },
      usdt: {
        id: 'usdt',
        name: 'USDT P2P Dominicana',
        code: 'USDT/DOP',
        value: 58.60,
        change: 0.08,
        currency: 'DOP',
        type: 'crypto',
        icon: 'coins'
      }
    }
  },

  // --- EXTERIOR / GLOBAL ---
  {
    id: 'US',
    name: 'Estados Unidos',
    flag: '🇺🇸',
    flagUrl: 'https://flagcdn.com/w40/us.png',
    region: 'exterior',
    currency: { code: 'USD', symbol: '$', name: 'Dólar Estadounidense' },
    defaultRateId: 'eurusd',
    rates: {
      base: {
        id: 'base',
        name: 'Dólar Base (USD)',
        code: 'USD/USD',
        value: 1.00,
        change: 0.00,
        currency: 'USD',
        type: 'official',
        icon: 'dollar-sign'
      },
      eurusd: {
        id: 'eurusd',
        name: 'EUR / USD Forex',
        code: 'EUR/USD',
        value: 1.161,
        change: -0.04,
        currency: 'USD',
        type: 'forex',
        icon: 'globe'
      },
      gbpusd: {
        id: 'gbpusd',
        name: 'GBP / USD Forex',
        code: 'GBP/USD',
        value: 1.355,
        change: 0.12,
        currency: 'USD',
        type: 'forex',
        icon: 'line-chart'
      },
      usdt: {
        id: 'usdt',
        name: 'Tether USDT Global',
        code: 'USDT/USD',
        value: 1.001,
        change: 0.01,
        currency: 'USD',
        type: 'crypto',
        icon: 'coins'
      }
    }
  },
  {
    id: 'ES',
    name: 'España (Eurozona)',
    flag: '🇪🇸',
    flagUrl: 'https://flagcdn.com/w40/es.png',
    region: 'exterior',
    currency: { code: 'EUR', symbol: '€', name: 'Euro' },
    defaultRateId: 'usdeur',
    rates: {
      base: {
        id: 'base',
        name: 'Euro Base (BCE)',
        code: 'EUR/EUR',
        value: 1.00,
        change: 0.00,
        currency: 'EUR',
        type: 'official',
        icon: 'euro'
      },
      usdeur: {
        id: 'usdeur',
        name: 'USD / EUR Forex',
        code: 'USD/EUR',
        value: 0.8614,
        change: 0.04,
        currency: 'EUR',
        type: 'forex',
        icon: 'globe'
      },
      gbpeur: {
        id: 'gbpeur',
        name: 'GBP / EUR Forex',
        code: 'GBP/EUR',
        value: 0.856,
        change: 0.08,
        currency: 'EUR',
        type: 'forex',
        icon: 'line-chart'
      },
      usdt: {
        id: 'usdt',
        name: 'USDT P2P Europa',
        code: 'USDT/EUR',
        value: 0.8650,
        change: 0.02,
        currency: 'EUR',
        type: 'crypto',
        icon: 'coins'
      }
    }
  }
];
