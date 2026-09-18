const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const files = [
  'js/constants.js',
  'js/utils/formatters.js',
  'js/utils/mathEval.js',
  'js/countriesData.js',
  'js/themeService.js',
  'js/calcHistoryService.js',
  'js/apiService.js',
  'js/notificationService.js',
  'js/mockData.js',
  'js/components/notificationModal.js',
  'js/components/dashboard.js',
  'js/components/calculator.js',
  'js/components/analytics.js',
  'js/components/settings.js',
  'js/app.js'
];

let bundleContent = '/* Dolarfy Standalone Bundle */\n(function() {\n  "use strict";\n\n';

for (const file of files) {
  const filePath = path.join(root, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Strip ES module imports
  content = content.replace(/^import\s+[\s\S]*?from\s+['"].*?['"];?/gm, '');

  // Replace export keywords
  content = content.replace(/^export\s+async\s+function\s+/gm, 'async function ');
  content = content.replace(/^export\s+function\s+/gm, 'function ');
  content = content.replace(/^export\s+const\s+/gm, 'const ');
  content = content.replace(/^export\s+let\s+/gm, 'let ');
  content = content.replace(/^export\s+class\s+/gm, 'class ');
  content = content.replace(/^export\s+default\s+/gm, '');
  content = content.replace(/^export\s+\{[\s\S]*?\};?/gm, '');

  bundleContent += `  // --- ${file} ---\n` + content + '\n\n';
}

bundleContent += '})();\n';

const outPath = path.join(root, 'js/app.bundle.js');
fs.writeFileSync(outPath, bundleContent, 'utf8');
console.log('==> Bundle JS creado:', outPath, `(${(bundleContent.length / 1024).toFixed(1)} KB)`);
