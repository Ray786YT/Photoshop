// Bundles index.html + game.js + three.js into one self-contained file: Arena1v1.html
// Usage: node build.js
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

let html = read('index.html');
for (const src of ['lib/three.min.js', 'game.js']) {
  const code = read(src);
  if (code.includes('</script')) throw new Error(`${src} contains "</script" and cannot be inlined`);
  const tag = `<script src="${src}"></script>`;
  if (!html.includes(tag)) throw new Error(`index.html is missing ${tag}`);
  html = html.replace(tag, () => `<script>\n${code}\n</script>`);
}
fs.writeFileSync(path.join(dir, 'Arena1v1.html'), html);
console.log(`Wrote Arena1v1.html (${(html.length / 1024).toFixed(0)} KB)`);
