// Stamps golf-sw.js with a version made from the contents of every file the app caches,
// so a phone downloads a complete new version whenever anything changes.
// Run before each commit: node tools/stamp-sw.js
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..'), swPath = path.join(root, 'golf-sw.js');
const sw = fs.readFileSync(swPath, 'utf8'), html = fs.readFileSync(path.join(root, 'golf-improvement-app.html'), 'utf8');
const extra = JSON.parse(sw.match(/const EXTRA = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
const files = [...new Set(['golf-improvement-app.html', ...[...html.matchAll(/(?:src|href)="(golf\/[^"]+)"/g)].map(m => m[1]), ...extra])];
const hash = crypto.createHash('sha256');
for (const f of files.sort()) { hash.update(f); hash.update(fs.readFileSync(path.join(root, f))); }
// the worker's own logic counts too (everything but the stamp line)
hash.update(sw.replace(/const VERSION = '[^']*';/, ''));
const version = hash.digest('hex').slice(0, 12);
const out = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
if (out !== sw) fs.writeFileSync(swPath, out);
console.log(`golf-sw.js version ${version} (${files.length} files)`);
