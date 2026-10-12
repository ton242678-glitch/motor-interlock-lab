const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
for (const name of ['index.html', 'style.css', 'controller.js', 'app.js']) fs.copyFileSync(path.join(root, name), path.join(dist, name));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
console.log('Built dist/: four independent demo files and .nojekyll');
