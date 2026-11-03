// 遗漏检测：内部一致性 + 数据源覆盖差集
const fs = require('fs');
const D = JSON.parse(fs.readFileSync('./data/rail.json', 'utf8'));
const AM = JSON.parse(fs.readFileSync('./data/amap_gz.json', 'utf8'));   // 高德 4401 广州
const FS = JSON.parse(fs.readFileSync('./data/foshan.json', 'utf8'));    // 高德 4406 佛山
const R = 6371, rad = x => x * Math.PI / 180;
const hav = (a, b) => {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

const by = new Map(D.stations.map(s => [s.n, s]));
const names = D.stations.map(s => s.n);
console.log('【1】总量');
console.log('  rail.json 站点', D.stations.length, '| 唯一站名', new Set(names).size, '| 线路', D.lines.length);

// 分区合计核对
if (fs.existsSync('./data/districts.json')) {
  const R2 = JSON.parse(fs.readFileSync('./data/districts.json', 'utf8'));
  const uniq = new Set(R2.map(r => r.n));
  console.log('  分区结果条数', R2.length, '| 唯一站名', uniq.size);
  console.log('  分区↔站点 差集:', names.filter(n => !uniq.has(n)).join(',') || '无', '/', [...uniq].filter(n => !by.has(n)).join(',') || '无');
}

// 每线完整性
console.log('\n【2】线路站点存在性');
const used = new Set();
let bad = 0;
for (const L of D.lines) {
  const miss = L.s.filter(n => !by.has(n));
  if (miss.length) { bad++; console.log('  ✗', L.n, '缺站:', miss.join(',')); }
  const dup = L.s.filter((n, i) => L.s.indexOf(n) !== i);
  if (dup.length) { bad++; console.log('  ✗', L.n, '站序重复:', [...new Set(dup)].join(',')); }
  L.s.forEach(n => used.add(n));
}
console.log('  线路全部站可解析:', bad === 0 ? '是' : '否');
console.log('  未被任何线路引用的站:', D.stations.filter(s => !used.has(s.n)).map(s => s.n).join(',') || '无');
console.log('  线路为空/length<2:', D.lines.filter(l => l.s.length < 2).map(l => l.n).join(',') || '无');
console.log('  站点 ln 为空:', D.stations.filter(s => !s.ln || !s.ln.length).map(s => s.n).join(',') || '无');

// 线路站数一览
console.log('\n【3】各线站数');
D.lines.forEach(L => console.log('  ' + L.n.padEnd(14) + String(L.s.length).padStart(3) + '  ' + L.s[0] + ' → ' + L.s[L.s.length - 1]));

// 【4】数据源差集：高德文件里有、但我们没进图里的
console.log('\n【4】数据源覆盖差集');
function srcStations(src, label) {
  const m = new Map();
  for (const L of src.l) for (const s of (L.st || [])) {
    if (!s.sl) continue;
    const [lon, lat] = s.sl.split(',').map(Number);
    const n = s.n.trim();
    if (!m.has(n)) m.set(n, { lat, lon, lines: [L.ln] });
    else m.get(n).lines.push(L.ln);
  }
  console.log('  ' + label + '：' + src.l.length + ' 条线 / ' + m.size + ' 站');
  return m;
}
const mAm = srcStations(AM, '高德广州 4401');
const mFs = srcStations(FS, '高德佛山 4406');

const notIn = m => [...m.keys()].filter(n => !by.has(n));
console.log('  4401 有、rail.json 没有:', notIn(mAm).join(',') || '无');
console.log('  4406 有、rail.json 没有:', notIn(mFs).join(',') || '无');
console.log('  rail.json 有、两个源都没有:', D.stations.filter(s => !mAm.has(s.n) && !mFs.has(s.n)).map(s => s.n).join(',') || '无');

// 4406 里我们跳过的线路
console.log('\n  4406 线路清单（标注是否已并入）:');
const inRail = new Set(D.lines.map(l => l.n));
for (const L of FS.l) {
  const st = (L.st || []).filter(s => s.sl);
  const overlap = st.filter(s => by.has(s.n.trim())).length;
  console.log('    ' + L.ln.padEnd(20) + '站' + String(st.length).padStart(3) + '  已收录' + String(overlap).padStart(3) +
    (inRail.has(L.ln) ? '  [已并入]' : '  [未并入]'));
}

// 【5】坐标重合但站名不同（疑似同一站被拆开）
console.log('\n【5】坐标极近但站名不同（<150m，疑似同站异名）');
const list = D.stations.slice().sort((a, b) => a.lon - b.lon);
let pairs = 0;
for (let i = 0; i < list.length; i++) {
  for (let j = i + 1; j < list.length && list[j].lon - list[i].lon < 0.01; j++) {
    const d = hav(list[i], list[j]);
    if (d < 0.15) { pairs++; console.log('  ' + list[i].n + ' ≈ ' + list[j].n + '  ' + (d * 1000).toFixed(0) + 'm  [' + list[i].ln.join('/') + '] vs [' + list[j].ln.join('/') + ']'); }
  }
}
if (!pairs) console.log('  无');

// 【6】同名站在相距很远的两个位置（同站名不同站，会被错误合并）
console.log('\n【6】同名跨线路坐标偏差 >0.5km（同名但可能不是同一站）');
let cnt = 0;
for (const L of AM.l) for (const s of (L.st || [])) {
  if (!s.sl || !by.has(s.n.trim())) continue;
  const [lon, lat] = s.sl.split(',').map(Number);
  const d = hav({ lat, lon }, by.get(s.n.trim()));
  if (d > 0.5) { cnt++; console.log('  ' + s.n + ' @' + L.ln + ' 偏离 ' + d.toFixed(2) + 'km  [' + by.get(s.n).ln.join('/') + ']'); }
}
if (!cnt) console.log('  无');
