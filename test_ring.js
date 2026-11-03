// playwright 可选装：npm i -D playwright && npx playwright install chromium
// 也可以用 PLAYWRIGHT_PATH 指向已装位置（CI / 离线环境）
const PW = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PW);
const { pathToFileURL } = require('url');
const { join } = require('path');
const PAGE = pathToFileURL(join(__dirname, '广州地铁票价地图.html')).href;
const URL = PAGE;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.4 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await page.goto(URL);
  await page.waitForTimeout(900);

  const out = {};
  // 切起点的整体耗时（含重建场 + 重算最短路）
  out.switchMs = await page.evaluate(() => {
    const m = window.__m;
    const t0 = performance.now();
    m.setOrigin('广州南站', true, true, true);
    return +(performance.now() - t0).toFixed(1);
  });
  await page.evaluate(() => window.__m.setOrigin('体育西路', true, true, true));
  await page.waitForTimeout(600);

  // 用 SVG 原生 isPointInFill 判断每个站落在圈的哪一侧
  out.check = await page.evaluate(() => {
    const m = window.__m;
    const NS = 'http://www.w3.org/2000/svg';
    const host = document.getElementById('gPath');
    const svg = document.getElementById('map');
    const res = {};
    for (const t of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12]) {
      const r = m.getIsoRing(t);
      if (!r.d) { res[t] = 'no-ring'; continue; }
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', r.d);
      host.appendChild(el);
      let insideButOut = 0, outsideButIn = 0;
      const bad = [];
      for (const p of m.stationEls) {
        if (p.s.n === m.state.origin) continue;
        const pt = svg.createSVGPoint(); pt.x = m.wx(p.mx); pt.y = m.wy(p.my);
        const inRing = el.isPointInFill(pt);
        if (p.price <= t && !inRing) { insideButOut++; if (bad.length < 4) bad.push(p.s.n + '(' + p.price + ')'); }
        if (p.price > t && inRing) outsideButIn++;
      }
      el.remove();
      res[t] = { pts: (r.d.match(/C/g) || []).length, insideButOut, outsideButIn, bad };
    }
    return res;
  });

  for (const t of [2, 3, 4, 6, 9]) {
    await page.click(`.tier[data-p="${t}"] .trow`);
    await page.waitForTimeout(750);
    await page.screenshot({ path: `shots/ring_${t}.png` });
  }

  console.log(JSON.stringify(out, null, 1));
  console.log('errors:', errs.length ? errs.slice(0, 3) : 'none');
  await browser.close();
})();
