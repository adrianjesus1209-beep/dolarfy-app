/**
 * Constantes globales de Dolarfy
 */

export const APP_VERSION = '1.0.0';

// Clave de caché de tasas en localStorage. v2: purga nextDay fabricados de versiones previas.
export const RATES_CACHE_VERSION = 'v3';
export const RATES_CACHE_KEY_PREFIX = `dolarfy_rates_cache_${RATES_CACHE_VERSION}`;