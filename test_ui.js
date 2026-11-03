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

  await page.click('.tier[data-p="2"] .trow');
  await page.waitForTimeout(650);
  out.tier2 = await page.evaluate(() => ({
    cur: document.querySelector('.tier.cur')?.dataset.p,
    open: document.querySelector('.tier.open')?.dataset.p,
    chips: document.querySelectorAll('.slist button').length,
    scale: document.getElementById('stxt').textContent,
  }));

  await page.click('.tier[data-p="2"] .trow');
  await page.waitForTimeout(650);
  out.overview = await page.evaluate(() => ({
    anyCur: !!document.querySelector('.tier.cur'),
    ovOpen: document.querySelector('.tier.ovrow').classList.contains('open'),
  }));

  const box = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('#gStations circle')];
    for (const c of cs) {
      const r = c.getBoundingClientRect();
      if (r.width > 1.5 && r.left > 500 && r.left < 780 && r.top > 300 && r.top < 600) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  });
  if (box) { await page.mouse.click(box.x, box.y); await page.waitForTimeout(750); }
  out.clickOrigin = await page.evaluate(() => document.getElementById('oName').textContent);

  await page.fill('#q', 'zhujiang');
  await page.waitForTimeout(280);
  out.sug = await page.evaluate(() => document.getElementById('sug').innerText.replace(/\n/g, ' / '));
  await page.click('#sug div');
  await page.waitForTimeout(750);
  out.searchOrigin = await page.evaluate(() => document.getElementById('oName').textContent);

  await page.click('#hotChips button:nth-child(4)');
  await page.waitForTimeout(750);
  out.hotOrigin = await page.evaluate(() => document.getElementById('oName').textContent);

  const before = await page.evaluate(() => document.getElementById('stxt').textContent);
  await page.mouse.move(500, 450);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => document.getElementById('stxt').textContent);
  out.zoom = before + ' -> ' + after;

  out.sampleTier = await page.evaluate(() => {
    const t = document.querySelector('.tier[data-p="2"] .trow');
    return t ? t.innerText.replace(/\n/g, ' ') : null;
  });

  // ---- 平均票价与均价排行 ----
  out.stats = await page.evaluate(() => ({
    avg: document.getElementById('stAvg').innerText.replace(/\n/g, ' '),
    rank: document.getElementById('stRank').innerText.replace(/\n/g, ' '),
  }));

  await page.click('.tabs button[data-tab="rank"]');
  await page.waitForTimeout(600);
  out.rank = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.rkrow')];
    const avgs = rows.map(r => +r.querySelector('.rkavg b').textContent);
    let asc = true;
    for (let i = 1; i < avgs.length; i++) if (avgs[i] < avgs[i - 1] - 1e-9) asc = false;
    return {
      n: rows.length,
      asc,
      top: rows[0].innerText.replace(/\n/g, ' | '),
      cur: rows.find(r => r.classList.contains('cur'))?.dataset.n || null,
    };
  });

  await page.click('#rkSort');
  await page.waitForTimeout(250);
  out.rankDesc = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.rkrow')];
    const avgs = rows.map(r => +r.querySelector('.rkavg b').textContent);
    let desc = true;
    for (let i = 1; i < avgs.length; i++) if (avgs[i] > avgs[i - 1] + 1e-9) desc = false;
    return { desc, label: document.getElementById('rkSort').textContent, top: rows[0].dataset.n, topRank: rows[0].querySelector('.rkno').textContent };
  });

  // 点排行行换起点
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('.rkrow')].find(x => x.dataset.n === '公园前');
    r.click();
  });
  await page.waitForTimeout(900);
  out.rankClick = await page.evaluate(() => ({
    origin: document.getElementById('oName').textContent,
    avg: document.getElementById('stAvg').innerText.replace(/\n/g, ' '),
    cur: document.querySelector('.rkrow.cur')?.dataset.n || null,
  }));

  // 回到档位 tab，确认原有功能未被破坏
  await page.click('.tabs button[data-tab="tier"]');
  await page.waitForTimeout(300);
  out.backToTier = await page.evaluate(() => ({
    tierVisible: !document.getElementById('tiers').classList.contains('hide'),
    rankHidden: document.getElementById('rankPanel').classList.contains('hide'),
    rows: document.querySelectorAll('.tier[data-p]').length,
  }));

  // 全部车站：展开某站 → 地图高亮该段路径，收起后还原
  await page.click('.tabs button[data-tab="all"]');
  await page.waitForTimeout(400);
  const hlSnap = () => page.evaluate(() => ({
    path: document.querySelectorAll('#gPath polyline').length,
    lineOp: +document.querySelector('#gLines polyline').getAttribute('opacity'),
    labels: [...document.querySelectorAll('#gLabels text')].filter(t => t.textContent).length,
    open: document.querySelectorAll('.srow.open').length,
  }));
  out.hlBefore = await hlSnap();
  await page.evaluate(() => {
    [...document.querySelectorAll('.srow')].find(x => x.dataset.n === '广州南站').click();
  });
  await page.waitForTimeout(1000);
  out.hlOpen = await hlSnap();
  await page.evaluate(() => {
    [...document.querySelectorAll('.srow')].find(x => x.dataset.n === '广州南站').click();
  });
  await page.waitForTimeout(900);
  out.hlClosed = await hlSnap();

  console.log(JSON.stringify(out, null, 1));
  console.log('errors:', errs.length ? errs : 'none');
  await browser.close();
})();
