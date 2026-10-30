const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

async function generateAll() {
  const logoApk = path.join(root, 'assets/img/logo-apk.webp');
  const logoSinFondo = path.join(root, 'assets/img/logo-sin-fondo.webp');
  const bgColor = { r: 16, g: 24, b: 28, alpha: 1 };

  // 1. Web icons
  await sharp(logoApk).resize(16, 16).png().toFile(path.join(root, 'assets/icons/favicon-16.png'));
  await sharp(logoApk).resize(32, 32).png().toFile(path.join(root, 'assets/icons/favicon-32.png'));
  await sharp(logoApk).resize(180, 180).png().toFile(path.join(root, 'assets/icons/apple-touch-icon.png'));
  await sharp(logoApk).resize(192, 192).png().toFile(path.join(root, 'assets/icons/icon-192.png'));
  await sharp(logoApk).resize(512, 512).png().toFile(path.join(root, 'assets/icons/icon-512.png'));
  console.log('✅ Web icons generated');

  // 2. Android mipmaps
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

    // ic_launcher.png (legacy square icon with dark background)
    await sharp(logoApk).resize(d.size, d.size).png().toFile(path.join(dir, 'ic_launcher.png'));

    // ic_launcher_round.png (round masked icon)
    const circleSvg = Buffer.from(
      `<svg width="${d.size}" height="${d.size}"><circle cx="${d.size/2}" cy="${d.size/2}" r="${d.size/2}" fill="#fff"/></svg>`
    );
    await sharp(logoApk)
      .resize(d.size, d.size)
      .composite([{ input: circleSvg, blend: 'dest-in' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    // ic_launcher_foreground.png (transparent foreground, icon inside safe 66% zone)
    const innerSize = Math.round(d.foreSize * 0.66);
    const innerBuffer = await sharp(logoSinFondo)
      .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const top = Math.round((d.foreSize - innerSize) / 2);
    const left = Math.round((d.foreSize - innerSize) / 2);

    await sharp({
      create: {
        width: d.foreSize,
        height: d.foreSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: innerBuffer, top, left }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }
  console.log('✅ Android mipmaps generated');

  // 3. Splash screens
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
    const markSize = Math.min(s.w, s.h) * 0.35;
    const markBuffer = await sharp(logoSinFondo)
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
  console.log('✅ Android splash screens generated');
}

generateAll()
  .then(() => console.log('🎉 Todos los assets generados exitosamente.'))
  .catch(err => {
    console.error('Error generando assets:', err);
    process.exit(1);
  });
