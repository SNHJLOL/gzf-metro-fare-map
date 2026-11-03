// 用真实经纬度构建线网拓扑，站间里程 = 相邻站球面距离累加（保留绕行，去掉起终点直线的低估）
const fs = require('fs');
const gz = JSON.parse(fs.readFileSync('./data/amap_gz.json', 'utf8'));
const fo = JSON.parse(fs.readFileSync('./data/foshan.json', 'utf8'));

const R = 6371;
const rad = x => x * Math.PI / 180;
function hav(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 高德广州数据里已含 佛山2号线 / 广佛线 / 7号线西延段，佛山数据只需补 3 号线
const FS_ADD = { '3号线': '佛山3号线' };
// APM 线（珠江新城旅客自动输送系统）独立票制 2 元，不并入按里程计价的网络
const EXCLUDE = new Set(['APM线']);

const src = [];
for (const L of gz.l) src.push({ n: L.ln, c: '#' + L.cl, st: L.st });
for (const L of fo.l) {
  const alias = FS_ADD[L.ln];
  if (alias) src.push({ n: alias, c: '#' + L.cl, st: L.st });
}

const stations = new Map();
const lines = [];

for (const L of src) {
  if (EXCLUDE.has(L.n)) continue;
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
    if (!rec.ln.includes(L.n)) rec.ln.push(L.n);
  }
  lines.push({ n: L.n, c: L.c, s: seq });
}

// 线路分段去重（3号线/12号线各有两个交路，站点序列不同，都保留）
const seen = new Set();
const outLines = [];
for (const L of lines) {
  const k = L.n + '|' + L.s.join(',');
  if (seen.has(k)) continue;
  seen.add(k);
  outLines.push(L);
}

// 环线标记：11 号线是闭合环线（官方 31 站，减暂缓开通的广州火车站 = 30 站，
// 站序首尾「大塘—龙潭」是一段真实相邻区间，必须补边才闭合）
const RING_LINES = new Set(['11号线']);
for (const L of outLines) {
  if (RING_LINES.has(L.n) && L.s.length > 2) L.ring = true;
}

// 建边并统计
const deg = new Map();
const edges = [];
const addEdge = (L, x, y) => {
  const a = stations.get(x), b = stations.get(y);
  if (!a || !b) return;
  const w = hav(a, b);
  edges.push({ a: x, b: y, w: +w.toFixed(3), line: L.n });
  deg.set(x, (deg.get(x) || 0) + 1);
  deg.set(y, (deg.get(y) || 0) + 1);
};
for (const L of outLines) {
  for (let i = 0; i < L.s.length - 1; i++) addEdge(L, L.s[i], L.s[i + 1]);
  if (L.ring) addEdge(L, L.s[L.s.length - 1], L.s[0]);
}

// ---- Dijkstra ----
const adj = new Map();
for (const s of stations.keys()) adj.set(s, []);
for (const e of edges) {
  adj.get(e.a).push([e.b, e.w]);
  adj.get(e.b).push([e.a, e.w]);
}
function dijkstra(src) {
  const dist = new Map(), used = new Set();
  for (const k of adj.keys()) dist.set(k, Infinity);
  dist.set(src, 0);
  const q = [[0, src]];
  while (q.length) {
    q.sort((x, y) => x[0] - y[0]);
    const [du, u] = q.shift();
    if (used.has(u)) continue;
    used.add(u);
    for (const [v, w] of adj.get(u)) {
      if (dist.get(u) + w < dist.get(v)) {
        dist.set(v, dist.get(u) + w);
        q.push([dist.get(v), v]);
      }
    }
  }
  return dist;
}

// ---- 线路全长校验（对比官方里程）----
const OFFICIAL = {
  '1号线': 18.5, '2号线': 31.8, '3号线': null, '4号线': 56.2, '5号线': 40.6,
  '6号线': 41.3, '8号线': 32.0, '广佛线': 32.4, '9号线': 20.1,
  '13号线': 27.0, '14号线': 54.4, '21号线': 61.5, '18号线': 61.3, '22号线': 30.8,
  '7号线': 30.0,
  // 11号线官方 44.2 km 含广州火车站；本站暂缓开通，数据里少该站及其两段，故偏小约 8%
  '11号线': 44.2,
};
const lineLen = new Map();
for (const e of edges) {
  const k = e.line;
  lineLen.set(k, (lineLen.get(k) || 0) + e.w);
}
console.log('=== 线路全长（相邻站直线累加）');
for (const [n, len] of [...lineLen.entries()].sort()) {
  const off = OFFICIAL[n];
  const cmp = off ? `  官方 ${off} km  偏差 ${((len / off - 1) * 100).toFixed(1)}%` : '';
  console.log(`${n.padEnd(18)} ${len.toFixed(1).padStart(6)} km${cmp}`);
}

// 3号线是两条交路分别统计，合并看
const t3 = [...lineLen.entries()].filter(([n]) => n === '3号线').reduce((a, b) => a + b[1], 0);

// ---- 票价样本校验 ----
function priceOf(km) {
  if (km <= 4) return 2;
  if (km <= 8) return 3;
  if (km <= 12) return 4;
  if (km <= 18) return 5;
  if (km <= 24) return 6;
  return Math.min(20, 7 + Math.floor((km - 24 - 1e-9) / 8));
}
const samples = [
  ['沙河', '燕岗', 4], ['沙河', '赤沙', 4], ['赤沙', '燕岗', 4],
  ['体育西路', '广州南站', 6], ['体育西路', '珠江新城', 2],
  ['公园前', '市桥', null], ['体育西路', '机场南', 7],
  ['体育西路', '东风', null], ['广州南站', '广州东站', null],
  ['广州南站', '顺德学院站', null], ['体育西路', '佛山大学', null],
  ['祖庙', '北滘公园', null], ['佛山大学', '顺德学院站', null],
];
console.log('\n=== 票价样本');
for (const [a, b, real] of samples) {
  if (!stations.has(a) || !stations.has(b)) { console.log(a, b, '缺站'); continue; }
  const d2 = dijkstra(a);
  const km = d2.get(b);
  const p = priceOf(km);
  console.log(`${a} → ${b}  轨道 ${km.toFixed(1)} km  估算 ${p} 元${real ? `  实际 ${real} 元 ${p === real ? '✓' : '✗'}` : ''}`);
}

fs.writeFileSync('./data/rail.json', JSON.stringify({
  stations: [...stations.values()],
  lines: outLines,
}));
const apmOnly = ['体育中心南', '天河南', '黄埔大道', '妇儿中心', '花城大道', '大剧院', '海心沙'];
console.log('\n已排除：APM 线（独立票制 2 元）及仅由它服务的 ' + apmOnly.length + ' 站：' + apmOnly.join(' '));
console.log('已并入：佛山3号线（' + (fo.l.find(x => x.ln === '3号线')?.st.length || 0) + ' 站，与 湾华/东平/桂城/北滘公园 换乘）');
console.log('站点', stations.size, '线路', outLines.length, '边', edges.length, '3号线合计', t3.toFixed(1));
