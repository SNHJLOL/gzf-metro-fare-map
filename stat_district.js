// 按行政区统计地铁站：用各区边界多边形做点在多边形内判断
const fs = require('fs');
const D = JSON.parse(fs.readFileSync('./data/rail.json', 'utf8'));

const AREAS = [];
for (const city of ['gz', 'fs']) {
  const g = JSON.parse(fs.readFileSync(`./data/geo/${city}.json`, 'utf8'));
  for (const f of g.features) {
    const rings = [];
    for (const poly of f.geometry.coordinates) {
      rings.push(poly); // poly[0]=外环，后续为内环
    }
    AREAS.push({ name: f.properties.name, city, rings });
  }
}

// 射线法
function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inArea(pt, area) {
  for (const poly of area.rings) {
    if (!inRing(pt, poly[0])) continue;
    let inHole = false;
    for (let k = 1; k < poly.length; k++) if (inRing(pt, poly[k])) { inHole = true; break; }
    if (!inHole) return true;
  }
  return false;
}

// 点到多边形边的最短距离（近似，用于归属修正）
function distToRing(pt, ring) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + t * dx, py = a[1] + t * dy;
    const d = Math.hypot(pt[0] - px, pt[1] - py);
    if (d < best) best = d;
  }
  return best;
}
function distToArea(pt, area) {
  let best = Infinity;
  for (const poly of area.rings) for (const r of poly) best = Math.min(best, distToRing(pt, r));
  return best;
}

const out = [];
let miss = 0;
for (const s of D.stations) {
  const pt = [s.lon, s.lat];
  let hit = AREAS.find(a => inArea(pt, a));
  if (!hit) {
    miss++;
    let bd = Infinity;
    for (const a of AREAS) { const d = distToArea(pt, a); if (d < bd) { bd = d; hit = a; } }
    out.push({ n: s.n, ln: s.ln, d: hit.name, near: +(bd * 111).toFixed(2) });
  } else {
    out.push({ n: s.n, ln: s.ln, d: hit.name, near: 0 });
  }
}

const group = new Map();
for (const r of out) {
  if (!group.has(r.d)) group.set(r.d, []);
  group.get(r.d).push(r);
}
const rows = [...group.entries()].sort((a, b) => b[1].length - a[1].length);
console.log('==== 各区站数 ====');
let tot = 0;
for (const [k, v] of rows) { tot += v.length; console.log(k, v.length); }
console.log('合计', tot, '| 边界外靠最近修正', miss);
console.log('\n==== 修正的站（落在所有区外）====');
out.filter(r => r.near > 0).forEach(r => console.log(' ', r.n, '→', r.d, '距边界约', r.near, 'km'));

fs.writeFileSync('./data/districts.json', JSON.stringify(out, null, 0));
