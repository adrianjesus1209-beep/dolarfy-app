/**
 * Constantes globales de Dolarfy
 * Fuente única de verdad para la versión y las claves de almacenamiento.
 */

export const APP_VERSION = '1.2.2';

// Prefijo de la clave de caché de tasas en localStorage.
// Bump al cambiar el esquema del objeto de tasas (p. ej. v14).
export const RATES_CACHE_VERSION = 'v13';
export const RATES_CACHE_KEY_PREFIX = `dolarfy_rates_cache_${RATES_CACHE_VERSION}`;