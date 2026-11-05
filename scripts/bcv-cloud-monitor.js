/**
 * Monitor en la Nube de Tasas BCV y Emisor de Notificaciones Push vía Firebase Cloud Messaging (FCM)
 * Se ejecuta automáticamente en GitHub Actions cada 5 minutos durante la ventana del BCV (3:45 PM - 6:00 PM VET).
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

function fetchBcvDirectHttps() {
  return new Promise((resolve) => {
    const https = require('https');
    const req = https.get('https://www.bcv.org.ve/', {
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 7000
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

async function fetchCurrentBcv() {
  // 1. Scraping ultra-rápido directo a bcv.org.ve vía HTTPS nativo (1.5 segundos)
  try {
    const direct = await fetchBcvDirectHttps();
    if (direct) return direct;
  } catch (e) {}

  // 2. Scraping de respaldo vía Jina Reader
  try {
    const cb = Math.floor(Date.now() / 15000);
    const res = await fetchWithTimeout(`https://r.jina.ai/https://www.bcv.org.ve/?_cb=${cb}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, 12000);

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
          return {
            status: 'ok',
            usd: parseFloat(usd.toFixed(2)),
            eur: parseFloat(eur.toFixed(2)),
            isoDate,
            shortDate: isoToShortDate(isoDate),
            fecha: fechaText,
            source: 'bcv_direct'
          };
        }
      }
    }
  } catch (e) {
    console.warn('Fallo lector directo bcv.org.ve:', e.message);
  }

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
          return {
            status: 'ok',
            usd,
            eur,
            isoDate,
            shortDate: isoToShortDate(isoDate),
            fecha: isoToShortDate(isoDate),
            source: 'dolarapi_historicos'
          };
        }
      }
    }
  } catch (e) {
    console.warn('Fallo respaldo DolarApi:', e.message);
  }

  return null;
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

async function sendFirebasePush(rateData) {
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
      expandedText: expandedText
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

async function checkOnce() {
  console.log('🔍 Consultando tasas oficiales del BCV en tiempo real...');
  const current = await fetchCurrentBcv();

  if (!current) {
    console.log('⚠️ No se pudo obtener la tasa oficial del BCV en este intento.');
    return false;
  }

  console.log(`📊 Tasa detectada: USD = Bs. ${current.usd} | EUR = Bs. ${current.eur} | Fecha: ${current.isoDate} (${current.source})`);

  const lastState = loadLastState();
  const currentKey = `${current.isoDate}_${current.usd.toFixed(2)}_${current.eur.toFixed(2)}`;
  const lastKey = lastState ? `${lastState.isoDate}_${Number(lastState.usd).toFixed(2)}_${Number(lastState.eur).toFixed(2)}` : '';

  if (currentKey === lastKey) {
    console.log(`ℹ️ La tasa actual (${currentKey}) ya fue notificada previamente.`);
    return false;
  }

  console.log(`🚨 ¡NUEVA TASA DETECTADA! Anterior: ${lastKey || 'ninguna'} => Nueva: ${currentKey}`);

  const pushed = await sendFirebasePush(current);

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
  return true;
}

async function main() {
  const isWatch = process.argv.includes('--watch');
  if (!isWatch) {
    await checkOnce();
    return;
  }

  const MAX_MINUTES = 35;
  const INTERVAL_MS = 25000; // cada 25 segundos
  const startTime = Date.now();
  console.log(`👀 Modo Vigilancia Activa iniciado (hasta ${MAX_MINUTES} minutos, revisión cada ${INTERVAL_MS / 1000}s)...`);

  while (Date.now() - startTime < MAX_MINUTES * 60 * 1000) {
    try {
      const notified = await checkOnce();
      if (notified) {
        console.log('🎉 Nueva tasa notificada con éxito. Vigilancia finalizada.');
        return;
      }
    } catch (e) {
      console.warn('Error en ciclo de vigilancia:', e.message);
    }
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }

  console.log('⏱️ Tiempo máximo de vigilancia cumplido sin nueva tasa.');
}

main().catch(err => {
  console.error('Error fatal en monitor:', err);
  process.exit(1);
});
