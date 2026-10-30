const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

async function generateAll() {
  const logoSinFondoPath = path.join(root, 'assets/img/logo-sin-fondo.webp');
  const bgColor = { r: 16, g: 24, b: 28, alpha: 1 }; // #10181C

  // Obtenemos el gráfico limpio recortando cualquier espacio transparente sobrante
  const trimmedGraphicBuffer = await sharp(logoSinFondoPath).trim().png().toBuffer();
  console.log('✅ Gráfico del logo recortado y optimizado');

  // 1. Iconos Web y PWA con suficiente margen y aire (alejado y estético)
  const webIcons = [
    { file: 'assets/icons/favicon-16.png', size: 16, fillRatio: 0.70 },
    { file: 'assets/icons/favicon-32.png', size: 32, fillRatio: 0.65 },
    { file: 'assets/icons/apple-touch-icon.png', size: 180, fillRatio: 0.58 },
    { file: 'assets/icons/icon-192.png', size: 192, fillRatio: 0.58 },
    { file: 'assets/icons/icon-512.png', size: 512, fillRatio: 0.58 }
  ];

  for (const icon of webIcons) {
    const graphicSize = Math.round(icon.size * icon.fillRatio);
    const graphic = await sharp(trimmedGraphicBuffer)
      .resize(graphicSize, graphicSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const top = Math.round((icon.size - graphicSize) / 2);
    const left = Math.round((icon.size - graphicSize) / 2);

    await sharp({
      create: {
        width: icon.size,
        height: icon.size,
        channels: 4,
        background: bgColor
      }
    })
      .composite([{ input: graphic, top, left }])
      .png()
      .toFile(path.join(root, icon.file));
  }
  console.log('✅ Web icons generados con márgenes equilibrados');

  // 2. Android Mipmaps (Legacy, Round y Foreground Adaptativo)
  const densities = [
    { name: 'mipmap-mdpi', size: 48, foreSize: 108 },
    { name: 'mipmap-hdpi', size: 72, foreSize: 162 },
    { name: 'mipmap-xhdpi', size: 96, foreSize: 216 },
    { name: 'mipmap-xxhdpi', size: 144, foreSize: 324 },
    { name: 'mipmap-xxxhdpi', size: 192, foreSize: 432 }
  ];

  for (const d of densities) {
    const dir = path.join(root, 'android/app/src/main/res', d.name);
    fs.mkdirSync(dir, { recursive: true });

    // A) ic_launcher.png (Legacy square con margen amplio, limpio y elegante)
    const legacyGraphicSize = Math.round(d.size * 0.58);
    const legacyGraphic = await sharp(trimmedGraphicBuffer)
      .resize(legacyGraphicSize, legacyGraphicSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const legacyTop = Math.round((d.size - legacyGraphicSize) / 2);
    const legacyLeft = Math.round((d.size - legacyGraphicSize) / 2);

    await sharp({
      create: {
        width: d.size,
        height: d.size,
        channels: 4,
        background: bgColor
      }
    })
      .composite([{ input: legacyGraphic, top: legacyTop, left: legacyLeft }])
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'));

    // B) ic_launcher_round.png (Circular con margen seguro)
    const circleSvg = Buffer.from(
      `<svg width="${d.size}" height="${d.size}"><circle cx="${d.size/2}" cy="${d.size/2}" r="${d.size/2}" fill="#fff"/></svg>`
    );
    const roundGraphicSize = Math.round(d.size * 0.54);
    const roundGraphic = await sharp(trimmedGraphicBuffer)
      .resize(roundGraphicSize, roundGraphicSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const roundTop = Math.round((d.size - roundGraphicSize) / 2);
    const roundLeft = Math.round((d.size - roundGraphicSize) / 2);

    await sharp({
      create: {
        width: d.size,
        height: d.size,
        channels: 4,
        background: bgColor
      }
    })
      .composite([
        { input: roundGraphic, top: roundTop, left: roundLeft },
        { input: circleSvg, blend: 'dest-in' }
      ])
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    // C) ic_launcher_foreground.png (Capa frontal adaptativa: 40% del lienzo total de 108dp, con perfecto aire y sin cortes en squircle/círculo)
    const foreGraphicSize = Math.round(d.foreSize * 0.40);
    const foreGraphic = await sharp(trimmedGraphicBuffer)
      .resize(foreGraphicSize, foreGraphicSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const foreTop = Math.round((d.foreSize - foreGraphicSize) / 2);
    const foreLeft = Math.round((d.foreSize - foreGraphicSize) / 2);

    await sharp({
      create: {
        width: d.foreSize,
        height: d.foreSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: foreGraphic, top: foreTop, left: foreLeft }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }
  console.log('✅ Android mipmaps generados con logo alejado y proporcionado');

  // 3. Splash Screens
  const splashes = [
    { dir: 'drawable', w: 480, h: 320 },
    { dir: 'drawable-port-mdpi', w: 320, h: 480 },
    { dir: 'drawable-port-hdpi', w: 480, h: 800 },
    { dir: 'drawable-port-xhdpi', w: 720, h: 1280 },
    { dir: 'drawable-port-xxhdpi', w: 960, h: 1600 },
    { dir: 'drawable-port-xxxhdpi', w: 1280, h: 1920 },
    { dir: 'drawable-land-mdpi', w: 480, h: 320 },
    { dir: 'drawable-land-hdpi', w: 800, h: 480 },
    { dir: 'drawable-land-xhdpi', w: 1280, h: 720 },
    { dir: 'drawable-land-xxhdpi', w: 1600, h: 960 },
    { dir: 'drawable-land-xxxhdpi', w: 1920, h: 1280 }
  ];

  for (const s of splashes) {
    const sDir = path.join(root, 'android/app/src/main/res', s.dir);
    fs.mkdirSync(sDir, { recursive: true });
    const markSize = Math.min(s.w, s.h) * 0.28;
    const markBuffer = await sharp(trimmedGraphicBuffer)
      .resize(Math.round(markSize), Math.round(markSize), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const top = Math.round((s.h - markSize) / 2);
    const left = Math.round((s.w - markSize) / 2);

    await sharp({
      create: {
        width: s.w,
        height: s.h,
        channels: 4,
        background: bgColor
      }
    })
      .composite([{ input: markBuffer, top, left }])
      .png()
      .toFile(path.join(sDir, 'splash.png'));
  }
  console.log('✅ Android splash screens generados');
}

generateAll()
  .then(() => console.log('🎉 Todos los recursos visuales generados exitosamente.'))
  .catch(err => {
    console.error('Error generando assets:', err);
    process.exit(1);
  });
