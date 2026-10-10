// Generates two corner patterns for the mackforge hero: halftone bubbles and isometric cubes, both
// largest in the top-right corner and shrinking away from it. The page uses the cubes.
// Usage: node gen_hero_patterns.cjs <out-dir> [--bubbles]
const fs = require('fs'), path = require('path');
const out = process.argv[2]; if (!out) throw Error('out dir required');
const W = 560, H = 440, CX = W, CY = 0, MAX = Math.hypot(W, H) * 0.78;
const grad = `<defs><linearGradient id="t" gradientUnits="userSpaceOnUse" x1="${W}" y1="0" x2="${W * 0.35}" y2="${H}"><stop offset="0" stop-color="#f6a85a"/><stop offset=".5" stop-color="#e8862e"/><stop offset="1" stop-color="#c8621c"/></linearGradient></defs>`;
const f = (x, y) => Math.max(0, 1 - Math.hypot(x - CX, y - CY) / MAX);
const n = v => +v.toFixed(1);

// bubbles: square grid, radius scales with distance to the corner
let dots = '';
const step = 22;
for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) {
  const r = 9.5 * Math.pow(f(x, y), 1.25);
  if (r >= 1.1) dots += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}"/>`;
}
if (process.argv.includes('--bubbles')) fs.writeFileSync(path.join(out, 'hero-bubbles.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${grad}<g fill="url(#t)">${dots}</g></svg>\n`);

// cubes: isometric grid, three shaded faces, size scales with distance to the corner
let cubes = '';
const cw = 26, ch = 15;
for (let row = 0, y = 8; y < H + ch; row++, y += ch) for (let x = (row % 2) * cw / 2; x < W + cw; x += cw) {
  const s = 11 * Math.pow(f(x, y), 1.1);
  if (s < 1.6) continue;
  const h = s * 0.577, top = `${n(x)},${n(y - h)} ${n(x + s)},${n(y)} ${n(x)},${n(y + h)} ${n(x - s)},${n(y)}`;
  const left = `${n(x - s)},${n(y)} ${n(x)},${n(y + h)} ${n(x)},${n(y + h + s * 1.1)} ${n(x - s)},${n(y + s * 1.1)}`;
  const right = `${n(x + s)},${n(y)} ${n(x)},${n(y + h)} ${n(x)},${n(y + h + s * 1.1)} ${n(x + s)},${n(y + s * 1.1)}`;
  cubes += `<polygon class="a" points="${top}"/><polygon class="b" points="${left}"/><polygon class="c" points="${right}"/>`;
}
fs.writeFileSync(path.join(out, 'hero-cubes.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><style>.a{fill:#f8b672}.b{fill:#e8862e}.c{fill:#b9581a}</style>${cubes}</svg>\n`);
console.log('wrote hero-cubes.svg' + (process.argv.includes('--bubbles') ? ' and hero-bubbles.svg' : ''));
