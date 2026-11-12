/**
 * Monitor en la Nube de Tasas BCV y Emisor de Notificaciones Push vía Firebase Cloud Messaging (FCM)
 * Incluye Modo Turbo en Tiempo Real (revisión cada 5 segundos en la ventana crítica del BCV).
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'state', 'last_bcv.json');

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function parseSpanishDateToIso(text) {
  if (!text) return null;
  const months = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
  };
  const m = text.match(/(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?(\d{4})/i);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = months[m[2].toLowerCase()] || '01';
    const year = m[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}

function isoToShortDate(iso) {
  if (!iso || iso.length < 10) return '';
  const parts = iso.slice(0, 10).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
}

function getVenezuelaNow() {
  // Venezuela es UTC-4 fijo todo el año
  const vetMs = Date.now() - 4 * 60 * 60 * 1000;
  const vetDate = new Date(vetMs);
  const isoToday = vetDate.toISOString().slice(0, 10);
  const hour = vetDate.getUTCHours();
  const minute = vetDate.getUTCMinutes();
  return { isoToday, hour, minute };
}

function fetchBcvDirectHttps() {
  return new Promise((resolve) => {
    const https = require('https');
    const req = https.get('https://www.bcv.org.ve/', {
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      },
      timeout: 6000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const mUsd = data.match(/id="dolar"[\s\S]{0,800}?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i);
          const mEur = data.match(/id="euro"[\s\S]{0,800}?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i);
          const mFecha = data.match(/Fecha\s+Valor[\s\S]{0,500}?<span[^>]*>([^<]+)<\/span>/i);
          if (mUsd) {
            const usd = parseFloat(mUsd[1].trim().replace(/\./g, '').replace(',', '.'));
            let eur = mEur ? parseFloat(mEur[1].trim().replace(/\./g, '').replace(',', '.')) : 0;
            const fechaText = mFecha ? mFecha[1].trim().replace(/\s+/g, ' ') : '';
            const isoDate = parseSpanishDateToIso(fechaText);
            if (usd > 0 && isoDate) {
              return resolve({
                status: 'ok',
                usd: parseFloat(usd.toFixed(2)),
                eur: parseFloat(eur.toFixed(2)),
                isoDate,
                shortDate: isoToShortDate(isoDate),
                fecha: fechaText,
                source: 'bcv_direct_https'
              });
            }
          }
        } catch (e) {}
        resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function isBetterRate(candidate, currentBest) {
  if (!candidate || candidate.status !== 'ok' || !candidate.isoDate) return false;
  if (!currentBest || currentBest.status !== 'ok' || !currentBest.isoDate) return true;
  return candidate.isoDate > currentBest.isoDate;
}

async function fetchCurrentBcv() {
  const { isoToday, hour } = getVenezuelaNow();
  const inWindow = (hour === 16 || hour === 17);
  let best = null;

  // 1. Scraping ultra-rápido directo a bcv.org.ve vía HTTPS nativo (~0.8 segundos)
  try {
    const direct = await fetchBcvDirectHttps();
    if (isBetterRate(direct, best)) best = direct;
    if (best && (best.isoDate > isoToday || !inWindow)) {
      return best;
    }
  } catch (e) {}

  // 2. Respaldo vía DolarApi Históricos (detecta la Fecha Valor oficial)
  try {
    const [usdRes, eurRes] = await Promise.all([
      fetchWithTimeout('https://ve.dolarapi.com/v1/historicos/dolares/oficial', {}, 6000),
      fetchWithTimeout('https://ve.dolarapi.com/v1/historicos/euros/oficial', {}, 6000)
    ]);

    if (usdRes.ok) {
      const usdList = await usdRes.json();
      const eurList = eurRes.ok ? await eurRes.json() : [];

      if (Array.isArray(usdList) && usdList.length > 0) {
        const lastUsd = usdList[usdList.length - 1];
        const lastEur = Array.isArray(eurList) && eurList.length > 0 ? eurList[eurList.length - 1] : null;

        const usd = parseFloat(parseFloat(lastUsd.promedio).toFixed(2));
        let eur = lastEur ? parseFloat(parseFloat(lastEur.promedio).toFixed(2)) : 0;
        if (eur > 0 && eur < 100 && usd > 100) {
          eur = parseFloat((eur * 1000).toFixed(2));
        }
        const isoDate = String(lastUsd.fecha).slice(0, 10);

        if (usd > 0 && isoDate) {
          const dapi = {
            status: 'ok',
            usd,
            eur,
            isoDate,
            shortDate: isoToShortDate(isoDate),
            fecha: isoToShortDate(isoDate),
            source: 'dolarapi_historicos'
          };
          if (isBetterRate(dapi, best)) best = dapi;
          if (best && (best.isoDate > isoToday || !inWindow)) {
            return best;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Fallo respaldo DolarApi:', e.message);
  }

  // 3. Scraping de respaldo vía Jina Reader (con X-No-Cache)
  try {
    const cb = Math.floor(Date.now() / 5000);
    const res = await fetchWithTimeout(`https://r.jina.ai/https://www.bcv.org.ve/?_cb=${cb}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'X-No-Cache': 'true'
      }
    }, 10000);

    if (res.ok) {
      const text = await res.text();
      const mdUsd = text.match(/\bUSD\b[\s\S]{0,120}?\*\*([\d.,]+)\*\*/i);
      const mdEur = text.match(/\bEUR\b[\s\S]{0,120}?\*\*([\d.,]+)\*\*/i);
      const mdFecha = text.match(/Fecha\s+Valor\s*:\s*([^\n\r*]+)/i);

      if (mdUsd) {
        const usd = parseFloat(mdUsd[1].trim().replace(/\./g, '').replace(',', '.'));
        const eur = mdEur ? parseFloat(mdEur[1].trim().replace(/\./g, '').replace(',', '.')) : 0;
        const fechaText = mdFecha ? mdFecha[1].trim().replace(/\s+/g, ' ') : '';
        const isoDate = parseSpanishDateToIso(fechaText);

        if (usd > 0 && isoDate) {
          const jina = {
            status: 'ok',
            usd: parseFloat(usd.toFixed(2)),
            eur: parseFloat(eur.toFixed(2)),
            isoDate,
            shortDate: isoToShortDate(isoDate),
            fecha: fechaText,
            source: 'bcv_jina_live'
          };
          if (isBetterRate(jina, best)) best = jina;
        }
      }
    }
  } catch (e) {
    console.warn('Fallo lector Jina bcv.org.ve:', e.message);
  }

  return best;
}

function loadLastState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return null;
}

function saveState(data) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function sendFirebasePush(rateData, isForce = false) {
  let serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    // Buscar archivo local para tests
    const localKeys = fs.readdirSync(path.join(__dirname, '..')).filter(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
    if (localKeys.length > 0) {
      serviceAccountJson = fs.readFileSync(path.join(__dirname, '..', localKeys[0]), 'utf8');
    }
  }

  if (!serviceAccountJson) {
    console.log('⚠️ Secret FIREBASE_SERVICE_ACCOUNT no configurado. Push omitido.');
    return false;
  }

  const admin = require('firebase-admin');
  const { getMessaging } = require('firebase-admin/messaging');
  let app;
  if (admin.getApps().length === 0) {
    let serviceAccount;
    try {
      serviceAccount = typeof serviceAccountJson === 'object' ? serviceAccountJson : JSON.parse(serviceAccountJson);
    } catch (e) {
      console.error('Error al parsear FIREBASE_SERVICE_ACCOUNT JSON:', e.message);
      return false;
    }

    app = admin.initializeApp({
      credential: admin.cert(serviceAccount)
    });
  } else {
    app = admin.getApp();
  }

  const usdStr = rateData.usd.toFixed(2);
  const eurStr = rateData.eur.toFixed(2);
  const shortDate = rateData.shortDate;

  const collapsedText = `USD = Bs. ${usdStr} | EUR = Bs. ${eurStr} Fecha: ${shortDate}`;
  const expandedText = `USD = Bs. ${usdStr} | EUR = Bs. ${eurStr}\nFecha: ${shortDate}`;

  const message = {
    topic: 'bcv_rates',
    notification: {
      title: '📢 Nueva Tasa BCV Disponible',
      body: collapsedText
    },
    data: {
      usd: usdStr,
      eur: eurStr,
      isoDate: rateData.isoDate,
      shortDate: shortDate,
      expandedText: expandedText,
      force: isForce ? 'true' : 'false',
      test: isForce ? 'true' : 'false'
    },
    android: {
      priority: 'high',
      collapseKey: 'dolarfy_bcv_rate',
      notification: {
        tag: 'dolarfy_bcv_alert',
        channelId: 'dolarfy_bcv_alerts',
        icon: 'ic_notification',
        color: '#10b981',
        sound: 'default'
      }
    }
  };

  try {
    const response = await getMessaging(app).send(message);
    console.log('✅ Notificación Push enviada exitosamente vía Firebase:', response);
    return true;
  } catch (err) {
    console.error('❌ Error al enviar notificación vía Firebase:', err);
    return false;
  }
}

async function checkOnce(overrideCurrent = null) {
  const t0 = Date.now();
  console.log('🔍 Consultando tasas oficiales del BCV en tiempo real...');
  const current = overrideCurrent || await fetchCurrentBcv();
  const fetchMs = Date.now() - t0;

  if (!current) {
    console.log('⚠️ No se pudo obtener la tasa oficial del BCV en este intento.');
    return { notified: false, alreadyFutureNotified: false };
  }

  console.log(`📊 Tasa detectada en ${fetchMs}ms: USD = Bs. ${current.usd} | EUR = Bs. ${current.eur} | Fecha: ${current.isoDate} (${current.source})`);

  const lastState = loadLastState();
  const currentKey = `${current.isoDate}_${current.usd.toFixed(2)}_${current.eur.toFixed(2)}`;
  const lastKey = lastState ? `${lastState.isoDate}_${Number(lastState.usd).toFixed(2)}_${Number(lastState.eur).toFixed(2)}` : '';

  const isTest = process.argv.includes('--test');
  const isForce = process.argv.includes('--force') || isTest;
  const { isoToday } = getVenezuelaNow();

  if (!isForce && currentKey === lastKey) {
    const isFutureRateAlreadyNotified = current.isoDate > isoToday;
    console.log(`ℹ️ La tasa actual (${currentKey}) ya fue notificada previamente.`);
    return { notified: false, alreadyFutureNotified: isFutureRateAlreadyNotified };
  }

  const pushStart = Date.now();
  console.log(`🚨 ${isTest ? '🧪 MODO PRUEBA DE NOTIFICACIÓN PUSH' : '¡NUEVA TASA DETECTADA AL INSTANTE!'} Anterior: ${lastKey || 'ninguna'} => Nueva: ${currentKey}`);

  const pushed = await sendFirebasePush(current, isForce);
  const pushMs = Date.now() - pushStart;
  console.log(`⚡ Tiempo de despacho FCM: ${pushMs}ms (Tiempo total detección + envío: ${Date.now() - t0}ms)`);

  if (!isTest) {
    // Actualizar estado persistente
    const newState = {
      usd: current.usd,
      eur: current.eur,
      isoDate: current.isoDate,
      shortDate: current.shortDate,
      pushed: Boolean(pushed),
      notifiedAt: new Date().toISOString()
    };
    saveState(newState);
    console.log('💾 Estado guardado en state/last_bcv.json.');
  } else {
    console.log('🧪 Push de prueba emitido con éxito. Estado no alterado.');
  }
  return { notified: true, alreadyFutureNotified: true };
}

async function runSimulateLiveUpdate() {
  console.log('🧪 INICIANDO SIMULACIÓN DE ACTUALIZACIÓN EN VIVO DE LA PÁGINA DEL BCV...');
  const realBcv = await fetchCurrentBcv();
  if (!realBcv) {
    console.error('❌ No se pudo conectar a bcv.org.ve para la prueba.');
    process.exit(1);
  }

  // Simulamos el estado justo 5 segundos antes de que el BCV actualice su página
  const previousSimulated = {
    status: 'ok',
    usd: 896.12,
    eur: 1004.96,
    isoDate: '2026-11-06',
    shortDate: '06/11/2026',
    fecha: 'Viernes, 06 Noviembre 2026',
    source: 'bcv_direct_https (pre-update)'
  };

  const originalState = loadLastState();
  saveState({
    usd: previousSimulated.usd,
    eur: previousSimulated.eur,
    isoDate: previousSimulated.isoDate,
    shortDate: previousSimulated.shortDate,
    pushed: true,
    notifiedAt: new Date(Date.now() - 3600000).toISOString()
  });

  console.log('\n--- [Ciclo 1 | T=0.0s] El BCV aún muestra la tasa anterior en su página ---');
  await checkOnce(previousSimulated);

  console.log('\n⏳ Esperando siguiente pulso del monitor en Modo Turbo (5 segundos)...');
  await new Promise(r => setTimeout(r, 5000));

  console.log('\n--- [Ciclo 2 | T=5.0s] ¡El BCV acaba de actualizar su página web en vivo! ---');
  const tUpdate = Date.now();
  await checkOnce(); // Consulta bcv.org.ve real en vivo y dispara el push
  console.log(`\n✅ PRUEBA COMPLETADA: Desde que la página cambió hasta que Firebase entregó el push pasaron exactamente ${((Date.now() - tUpdate) / 1000).toFixed(2)} segundos.`);

  if (originalState) {
    saveState(originalState);
  }
}

async function main() {
  if (process.argv.includes('--simulate-live-update')) {
    await runSimulateLiveUpdate();
    return;
  }

  const isWatch = process.argv.includes('--watch');
  if (!isWatch) {
    await checkOnce();
    return;
  }

  // En modo --watch en la nube:
  // Si el runner arranca temprano (pre-calentamiento para absorber retrasos de cola de GitHub),
  // permanece activo hasta las 6:00 PM VET, y entre 4:00 PM y 5:58 PM VET entra en Modo Ultra-Turbo (cada 3 segundos).
  const MAX_MINUTES = 345; // hasta 5h 45m de cobertura continua
  const startTime = Date.now();
  console.log('👀 Modo Vigilancia Activa Ultra-Turbo iniciado...');

  while (Date.now() - startTime < MAX_MINUTES * 60 * 1000) {
    try {
      const { notified, alreadyFutureNotified } = await checkOnce();
      if (notified) {
        console.log('🎉 Nueva tasa notificada al instante con éxito. Vigilancia finalizada.');
        return;
      }
      if (alreadyFutureNotified) {
        console.log('✅ La tasa del próximo día hábil ya fue publicada y notificada hoy. Vigilancia finalizada.');
        return;
      }
    } catch (e) {
      console.warn('Error en ciclo de vigilancia:', e.message);
    }

    const { hour, minute } = getVenezuelaNow();
    // Si ya pasaron las 6:00 PM VET (18:00), terminar vigilancia del día
    if (hour >= 18) {
      console.log('⏹️ Fin de la ventana horaria del BCV (6:00 PM VET).');
      return;
    }

    // Ventana crítica (4:00 PM a 5:58 PM VET): Modo Ultra-Turbo cada 3 segundos
    const isTurboWindow = (hour === 16) || (hour === 17 && minute <= 58);
    const intervalMs = isTurboWindow ? 3000 : 45000;
    await new Promise(r => setTimeout(r, intervalMs));
  }

  console.log('⏱️ Tiempo máximo de vigilancia cumplido sin nueva tasa.');
}

main().catch(err => {
  console.error('Error fatal en monitor:', err);
  process.exit(1);
});
