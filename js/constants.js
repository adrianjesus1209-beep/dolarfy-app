/**
 * Constantes globales de Dolarfy
 */

export const APP_VERSION = '1.0.10';

// Clave de caché de tasas en localStorage. v4: soporte directo BCV en vivo + notificaciones exactas.
export const RATES_CACHE_VERSION = 'v4';
export const RATES_CACHE_KEY_PREFIX = `dolarfy_rates_cache_${RATES_CACHE_VERSION}`;