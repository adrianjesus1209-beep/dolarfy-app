/**
 * Envía una notificación push de prueba real vía Firebase Cloud Messaging al tema 'bcv_rates'
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { getMessaging } = require('firebase-admin/messaging');

async function sendTest() {
  let serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    const localKeys = fs.readdirSync(path.join(__dirname, '..')).filter(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
    if (localKeys.length > 0) {
      serviceAccountJson = fs.readFileSync(path.join(__dirname, '..', localKeys[0]), 'utf8');
    }
  }

  if (!serviceAccountJson) {
    console.error('❌ No se encontró la clave de Firebase Service Account');
    process.exit(1);
  }

  const serviceAccount = typeof serviceAccountJson === 'object' ? serviceAccountJson : JSON.parse(serviceAccountJson);
  const app = admin.initializeApp({ credential: admin.cert(serviceAccount) });

  const usd = "891.11";
  const eur = "997.92";
  const fecha = "03/11/2026";
  const collapsedText = `USD = Bs. ${usd} | EUR = Bs. ${eur} Fecha: ${fecha}`;
  const expandedText = `USD = Bs. ${usd} | EUR = Bs. ${eur}\nFecha: ${fecha}`;

  const message = {
    topic: 'bcv_rates',
    notification: {
      title: '📢 Nueva Tasa BCV Disponible',
      body: collapsedText
    },
    data: {
      usd: usd,
      eur: eur,
      isoDate: '2026-11-03',
      shortDate: fecha,
      expandedText: expandedText,
      force: 'true',
      test: 'true'
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'dolarfy_bcv_alerts',
        icon: 'ic_notification',
        color: '#10b981',
        sound: 'default'
      }
    }
  };

  console.log('🚀 Enviando notificación de prueba a través de Firebase...');
  const res = await getMessaging(app).send(message);
  console.log('✅ Notificación de prueba enviada exitosamente con Message ID:', res);
}

sendTest().catch(console.error);
