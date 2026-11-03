const fs = require('fs');
const path = require('path');

const tpl = fs.readFileSync('./src/template.html', 'utf8');
const data = fs.readFileSync('./data/rail.json', 'utf8');

const out = tpl.replace('__DATA_JSON__', data);
const target = path.join(process.cwd(), '广州地铁票价地图.html');
fs.writeFileSync(target, out, 'utf8');

const kb = (fs.statSync(target).size / 1024).toFixed(1);
console.log('已生成:', target, kb + ' KB');
// 自检：不应有任何外链
const bad = out.match(/(src|href)\s*=\s*["']https?:/gi) || [];
console.log('外部资源引用:', bad.length);

// 发布目录：只放一个 index.html，别把 shots/ data/ 一起传上去
const dist = path.join(process.cwd(), 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), out, 'utf8');
console.log('已生成:', path.join(dist, 'index.html'));
