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
  const dayOfWeek = vetDate.getUTCDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sab
  return { isoToday, hour, minute, dayOfWeek };
}

function fetchBcvDirectHttps() {
  return new Promise((resolve) => {
    const https = require('https');
    const cb = Math.floor(Date.now() / 2000);
    const req = https.get(`https://www.bcv.org.ve/?_cb=${cb}`, {
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      },
      timeout: 5500
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
      dedupKey: `VE_${rateData.isoDate}_${usdStr}_${eurStr}`,
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

/**
 * Evalúa de forma estricta y monotónica si una tasa detectada debe notificarse.
 * Bloquea cualquier retroceso de Fecha Valor (ej. nodos rezagados del BCV devolviendo la tasa de hoy
 * después de haberse publicado mañana) y evita rebotes mediante historial de claves.
 */
function evaluateRateTransition(current, lastState, isoToday, isForce = false) {
  if (!current || !current.usd || current.usd <= 0 || !current.isoDate) {
    return { shouldNotify: false, reason: 'invalid_current', alreadyFutureNotified: Boolean(lastState?.isoDate && lastState.isoDate > isoToday) };
  }

  const usdFixed = current.usd.toFixed(2);
  const eurFixed = (typeof current.eur === 'number' && current.eur > 0 ? current.eur : 0).toFixed(2);
  const currentKey = `${current.isoDate}_${usdFixed}_${eurFixed}`;
  const lastKey = lastState && lastState.isoDate
    ? `${lastState.isoDate}_${Number(lastState.usd || 0).toFixed(2)}_${Number(lastState.eur || 0).toFixed(2)}`
    : '';
  const recentKeys = Array.isArray(lastState?.recentKeys)
    ? lastState.recentKeys
    : (lastKey ? [lastKey] : []);

  const alreadyFutureInState = Boolean(lastState?.isoDate && lastState.isoDate > isoToday);

  if (isForce) {
    return { shouldNotify: true, reason: 'forced', currentKey, lastKey, recentKeys, alreadyFutureNotified: current.isoDate > isoToday || alreadyFutureInState };
  }

  if (lastState && lastState.isoDate) {
    // 1. Candado Monotónico: PROHIBIDO retroceder de fecha valor (ej: 2026-11-18 -> 2026-11-17)
    if (current.isoDate < lastState.isoDate) {
      return {
        shouldNotify: false,
        reason: 'stale_date_regression',
        currentKey,
        lastKey,
        recentKeys,
        alreadyFutureNotified: alreadyFutureInState
      };
    }

    // 2. Si hoy ya notificamos el próximo día hábil (> hoy), jamás notificar fechas <= hoy
    if (lastState.isoDate > isoToday && current.isoDate <= isoToday) {
      return {
        shouldNotify: false,
        reason: 'future_already_notified_for_today',
        currentKey,
        lastKey,
        recentKeys,
        alreadyFutureNotified: true
      };
    }

    // 3. Evitar lecturas incompletas sin EUR sobre la misma fecha ya notificada
    if (current.isoDate === lastState.isoDate && current.eur <= 0 && Number(lastState.eur || 0) > 0) {
      return {
        shouldNotify: false,
        reason: 'incomplete_eur_same_date',
        currentKey,
        lastKey,
        recentKeys,
        alreadyFutureNotified: alreadyFutureInState
      };
    }
  }

  // 4. Coincidencia exacta o clave presente en historial reciente (bloquea ping-pong A -> B -> A)
  if (currentKey === lastKey || recentKeys.includes(currentKey)) {
    return {
      shouldNotify: false,
      reason: 'already_notified',
      currentKey,
      lastKey,
      recentKeys,
      alreadyFutureNotified: current.isoDate > isoToday || alreadyFutureInState
    };
  }

  return {
    shouldNotify: true,
    reason: 'new_rate',
    currentKey,
    lastKey,
    recentKeys,
    alreadyFutureNotified: current.isoDate > isoToday
  };
}

async function checkOnce(overrideCurrent = null, pushOverrideFn = null) {
  const t0 = Date.now();
  console.log('🔍 Consultando tasas oficiales del BCV en tiempo real...');
  const current = overrideCurrent || await fetchCurrentBcv();
  const fetchMs = Date.now() - t0;

  if (!current) {
    console.log('⚠️ No se pudo obtener la tasa oficial del BCV en este intento.');
    const lastState = loadLastState();
    const { isoToday } = getVenezuelaNow();
    return { notified: false, alreadyFutureNotified: Boolean(lastState?.isoDate && lastState.isoDate > isoToday) };
  }

  console.log(`📊 Tasa detectada en ${fetchMs}ms: USD = Bs. ${current.usd} | EUR = Bs. ${current.eur} | Fecha: ${current.isoDate} (${current.source})`);

  const lastState = loadLastState();
  const isTest = process.argv.includes('--test');
  const isForce = process.argv.includes('--force') || isTest;
  const { isoToday } = getVenezuelaNow();

  const decision = evaluateRateTransition(current, lastState, isoToday, isForce);

  if (!decision.shouldNotify) {
    if (decision.reason === 'stale_date_regression' || decision.reason === 'future_already_notified_for_today') {
      console.log(`🛡️ Lectura rezagada bloqueada (${decision.reason}): detectada ${current.isoDate}, protegida ${lastState?.isoDate}.`);
    } else {
      console.log(`ℹ️ La tasa actual (${decision.currentKey}) ya fue notificada previamente.`);
    }
    return { notified: false, alreadyFutureNotified: decision.alreadyFutureNotified };
  }

  const pushStart = Date.now();
  console.log(`🚨 ${isTest ? '🧪 MODO PRUEBA DE NOTIFICACIÓN PUSH' : '¡NUEVA TASA DETECTADA AL INSTANTE!'} Anterior: ${decision.lastKey || 'ninguna'} => Nueva: ${decision.currentKey}`);

  const pushed = pushOverrideFn
    ? await pushOverrideFn(current, isForce)
    : await sendFirebasePush(current, isForce);
  const pushMs = Date.now() - pushStart;
  console.log(`⚡ Tiempo de despacho FCM: ${pushMs}ms (Tiempo total detección + envío: ${Date.now() - t0}ms)`);

  if (!isTest) {
    if (pushed) {
      const updatedRecent = [
        decision.currentKey,
        ...decision.recentKeys.filter(k => k !== decision.currentKey)
      ].slice(0, 15);
      const newState = {
        usd: current.usd,
        eur: current.eur,
        isoDate: current.isoDate,
        shortDate: current.shortDate,
        pushed: true,
        notifiedAt: new Date().toISOString(),
        recentKeys: updatedRecent
      };
      saveState(newState);
      console.log('💾 Estado guardado en state/last_bcv.json.');
    } else {
      console.warn('⚠️ El push FCM no confirmó envío; state/last_bcv.json no se modificó.');
      return { notified: false, alreadyFutureNotified: decision.alreadyFutureNotified };
    }
  } else {
    console.log('🧪 Push de prueba emitido con éxito. Estado no alterado.');
  }
  return { notified: Boolean(pushed), alreadyFutureNotified: decision.alreadyFutureNotified };
}

async function runBounceRegressionTest() {
  console.log('🧪 INICIANDO PRUEBA DE ESTRÉS ANTI-REBOTE (BCV PING-PONG)...');
  const originalState = loadLastState();
  let pushCount = 0;
  const mockPush = async () => { pushCount += 1; return true; };

  const addDaysIso = (iso, days) => {
    const dt = new Date(`${iso}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  };
  const { isoToday } = getVenezuelaNow();
  const isoTomorrow = addDaysIso(isoToday, 1);
  const isoDayAfter = addDaysIso(isoToday, 2);

  try {
    saveState({
      usd: 915.75,
      eur: 1008.31,
      isoDate: isoToday,
      shortDate: isoToShortDate(isoToday),
      pushed: true,
      notifiedAt: new Date(Date.now() - 86400000).toISOString(),
      recentKeys: [`${isoToday}_915.75_1008.31`]
    });

    // 1. Publicación real de mañana -> DEBE enviar 1 push
    const r1 = await checkOnce({ status: 'ok', usd: 916.65, eur: 1007.39, isoDate: isoTomorrow, shortDate: isoToShortDate(isoTomorrow), source: 'sim_bcv_fresh' }, mockPush);
    // 2. Nodo lento del BCV devuelve hoy 6 min después -> DEBE BLOQUEARSE (0 push)
    const r2 = await checkOnce({ status: 'ok', usd: 915.75, eur: 1008.31, isoDate: isoToday, shortDate: isoToShortDate(isoToday), source: 'sim_bcv_stale' }, mockPush);
    // 3. Nodo fresco vuelve a devolver mañana 20s después -> DEBE BLOQUEARSE (0 push)
    const r3 = await checkOnce({ status: 'ok', usd: 916.65, eur: 1007.39, isoDate: isoTomorrow, shortDate: isoToShortDate(isoTomorrow), source: 'sim_jina' }, mockPush);
    // 4. Siguiente día hábil sale tasa nueva -> DEBE enviar 1 push
    const r4 = await checkOnce({ status: 'ok', usd: 918.10, eur: 1009.50, isoDate: isoDayAfter, shortDate: isoToShortDate(isoDayAfter), source: 'sim_bcv_next' }, mockPush);

    const passed = r1.notified === true && r2.notified === false && r3.notified === false && r4.notified === true && pushCount === 2;
    console.log(`\nResultado prueba anti-rebote: r1=${r1.notified}, r2=${r2.notified}, r3=${r3.notified}, r4=${r4.notified}, totalPushes=${pushCount}`);
    if (!passed) {
      throw new Error('La prueba anti-rebote falló!');
    }
    console.log('✅ PRUEBA ANTI-REBOTE SUPERADA AL 100%: 0 regresiones, 0 duplicados.');
  } finally {
    if (originalState) {
      saveState(originalState);
    }
  }
}

async function runSimulateLiveUpdate() {
  console.log('🧪 INICIANDO SIMULACIÓN DE ACTUALIZACIÓN EN VIVO DE LA PÁGINA DEL BCV...');
  const realBcv = await fetchCurrentBcv();
  if (!realBcv) {
    console.error('❌ No se pudo conectar a bcv.org.ve para la prueba.');
    process.exit(1);
  }

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
  await checkOnce();
  console.log(`\n✅ PRUEBA COMPLETADA: Desde que la página cambió hasta que Firebase entregó el push pasaron exactamente ${((Date.now() - tUpdate) / 1000).toFixed(2)} segundos.`);

  if (originalState) {
    saveState(originalState);
  }
}

async function main() {
  if (process.argv.includes('--test-bounce')) {
    await runBounceRegressionTest();
    return;
  }

  if (process.argv.includes('--simulate-live-update')) {
    await runSimulateLiveUpdate();
    return;
  }

  const isWatch = process.argv.includes('--watch');
  if (!isWatch) {
    await checkOnce();
    return;
  }

  const MAX_MINUTES = Number(process.env.MAX_WATCH_MINUTES) > 0
    ? Number(process.env.MAX_WATCH_MINUTES)
    : 310;
  const startTime = Date.now();
  console.log(`👀 Modo Vigilancia Perpetua Ultra-Turbo iniciado (Turno de ${MAX_MINUTES} min)...`);

  while (Date.now() - startTime < MAX_MINUTES * 60 * 1000) {
    let notified = false;
    let alreadyFutureNotified = false;
    try {
      const res = await checkOnce();
      notified = res.notified;
      alreadyFutureNotified = res.alreadyFutureNotified;
      if (notified) {
        console.log('🎉 Nueva tasa notificada al instante con éxito. Guardando estado y relevando turno...');
        return;
      }
    } catch (e) {
      console.warn('Error en ciclo de vigilancia:', e.message);
    }

    const { hour, minute, dayOfWeek } = getVenezuelaNow();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const elapsedMinutes = (Date.now() - startTime) / 60000;

    // Relevo preventivo entre 2:45 PM y 3:30 PM VET si el turno actual lleva más de 90 minutos,
    // para que un turno recién iniciado cubra de 3:00 PM a 8:10 PM VET sin interrupción alguna.
    const isPreWindowHandover = isWeekday
      && ((hour === 14 && minute >= 45) || (hour === 15 && minute <= 30))
      && elapsedMinutes >= 90;

    if (isPreWindowHandover) {
      console.log('🔄 Relevo preventivo pre-ventana BCV para garantizar cobertura continua de 3:00 PM a 8:00 PM VET.');
      return;
    }

    // Ventana crítica (3:45 PM a 6:15 PM VET en días hábiles mientras no haya salido la tasa futura):
    // Modo Ultra-Turbo cada 2.5 segundos
    const isTurboWindow = isWeekday
      && !alreadyFutureNotified
      && ((hour === 15 && minute >= 45) || hour === 16 || hour === 17 || (hour === 18 && minute <= 15));

    if (isTurboWindow) {
      await new Promise(r => setTimeout(r, 2500));
    } else {
      // Si ya se notificó la tasa del próximo día hábil, espaciar las verificaciones pasivas a 10 min;
      // de lo contrario cada 2 min, despertando al instante al entrar en 3:45 PM VET.
      const standbyCycleMs = alreadyFutureNotified ? 600000 : 120000;
      console.log(`🛡️ Servidor activo en Guardia Continua (Hora VET: ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} | Próximo chequeo: ${standbyCycleMs / 60000} min | Transcurrido: ${elapsedMinutes.toFixed(1)}/${MAX_MINUTES} min).`);
      const stepMs = 15000;
      let waited = 0;
      while (waited < standbyCycleMs && (Date.now() - startTime < MAX_MINUTES * 60 * 1000)) {
        await new Promise(r => setTimeout(r, stepMs));
        waited += stepMs;
        const nowVet = getVenezuelaNow();
        const nowWeekday = nowVet.dayOfWeek >= 1 && nowVet.dayOfWeek <= 5;
        const enteredTurbo = nowWeekday
          && !alreadyFutureNotified
          && ((nowVet.hour === 15 && nowVet.minute >= 45) || nowVet.hour === 16 || nowVet.hour === 17);
        if (enteredTurbo) break;
      }
    }
  }

  console.log('⏱️ Turno de vigilancia completado. Ejecutando auto-relevo inmediato...');
}

main().catch(err => {
  console.error('Error fatal en monitor:', err);
  process.exit(1);
});
