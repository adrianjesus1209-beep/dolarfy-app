const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const www = path.join(root, 'www');

// Limpiar o crear carpeta www
if (fs.existsSync(www)) {
  fs.rmSync(www, { recursive: true, force: true });
}
fs.mkdirSync(www, { recursive: true });

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// Copiar archivos esenciales para la app móvil
const itemsToCopy = [
  'index.html',
  'manifest.json',
  'sw.js',
  'assets',
  'js'
];

for (const item of itemsToCopy) {
  copyRecursive(path.join(root, item), path.join(www, item));
}

console.log('==> Carpeta www generada con éxito para empaquetado móvil.');
