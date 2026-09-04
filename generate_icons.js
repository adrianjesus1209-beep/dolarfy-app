const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, 'assets', 'img', 'logo.webp');

const sizes = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 }
];

const resDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');

async function main() {
  console.log('Procesando logo.webp desde:', inputPath);
  
  for (const item of sizes) {
    const targetFolder = path.join(resDir, item.dir);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }
    
    const icLauncherPath = path.join(targetFolder, 'ic_launcher.png');
    const icRoundPath = path.join(targetFolder, 'ic_launcher_round.png');
    const icForegroundPath = path.join(targetFolder, 'ic_launcher_foreground.png');
    
    const resizedBuffer = await sharp(inputPath)
      .resize(item.size, item.size, { fit: 'contain', background: { r: 11, g: 14, b: 20, alpha: 1 } })
      .png()
      .toBuffer();
      
    fs.writeFileSync(icLauncherPath, resizedBuffer);
    fs.writeFileSync(icRoundPath, resizedBuffer);
    fs.writeFileSync(icForegroundPath, resizedBuffer);
    
    console.log(`Generados íconos para ${item.dir} (${item.size}x${item.size})`);
  }
  
  console.log('¡Todos los íconos de la aplicación Dolarfy han sido generados exitosamente!');
}

main().catch(err => {
  console.error('Error generando íconos:', err);
  process.exit(1);
});
