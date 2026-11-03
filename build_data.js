const fs = require('fs');
const d = JSON.parse(fs.readFileSync('./data/amap_gz.json', 'utf8'));

const stations = new Map();
const lines = [];

for (const L of d.l) {
  const seq = [];
  for (const s of L.st) {
    if (!s.sl) continue;
    const [lon, lat] = s.sl.split(',').map(Number);
    const name = s.n.trim();
    seq.push(name);
    if (!stations.has(name)) {
      stations.set(name, { n: name, lat: +lat.toFixed(6), lon: +lon.toFixed(6), sp: s.sp || '', ln: [] });
    }
    const rec = stations.get(name);
    if (!rec.ln.includes(L.ln)) rec.ln.push(L.ln);
  }
  lines.push({ n: L.ln, c: '#' + L.cl, s: seq });
}

// 合并同名同线（3号线/12号线分段），保留唯一线路名
const uniq = new Map();
for (const L of lines) {
  const k = L.n + '|' + L.s.slice(0, 3).join(',');
  if (!uniq.has(k)) uniq.set(k, L);
}
const outLines = [...uniq.values()];

const out = {
  city: d.s,
  updated: new Date().toISOString().slice(0, 10),
  lines: outLines,
  stations: [...stations.values()].sort((a, b) => a.n.localeCompare(b.n, 'zh')),
};

fs.writeFileSync('./data/stations.json', JSON.stringify(out));

// 统计
const lats = out.stations.map(s => s.lat), lons = out.stations.map(s => s.lon);
console.log('线路数(去重后)', outLines.length, '车站', out.stations.length);
console.log('纬度范围', Math.min(...lats).toFixed(3), Math.max(...lats).toFixed(3));
console.log('经度范围', Math.min(...lons).toFixed(3), Math.max(...lons).toFixed(3));
console.log('大小 KB', (fs.statSync('./data/stations.json').size / 1024).toFixed(1));
console.log('换乘站', out.stations.filter(s => s.ln.length > 1).length);
console.log(outLines.map(l => l.n + ':' + l.s.length).join(' '));
