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
  const errs = [];
  const VPS = [
    { w: 390, h: 844, n: 'm390' },
    { w: 360, h: 640, n: 'm360' },
    { w: 430, h: 932, n: 'm430' },
    { w: 844, h: 390, n: 'land' },
    { w: 768, h: 1024, n: 'tab' },
  ];
  for (const vp of VPS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(vp.n + ' PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(vp.n + ' CONSOLE: ' + m.text()); });
    await page.goto(URL);
    await page.waitForTimeout(1400);
    const info = await page.evaluate(() => {
      const de = document.documentElement;
      const mw = document.getElementById('mapwrap').getBoundingClientRect();
      const as = document.querySelector('aside').getBoundingClientRect();
      const over = [...document.querySelectorAll('body *')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
      }).slice(0, 6).map(el => (el.tagName + '.' + el.className).slice(0, 40) + ' r=' + Math.round(el.getBoundingClientRect().right));
      return {
        scrollH: de.scrollHeight, vh: window.innerHeight, scrollW: de.scrollWidth, vw: window.innerWidth,
        map: [Math.round(mw.width), Math.round(mw.height)],
        aside: [Math.round(as.width), Math.round(as.height)],
        tiers: Math.round(document.getElementById('tiers').getBoundingClientRect().height),
        over,
      };
    });
    console.log(vp.n, JSON.stringify(info));
    await page.screenshot({ path: `shots/mob-${vp.n}.png` });

    if (vp.n === 'm390') {
      // 点搜索 -> 热门 -> 选一个站
      await page.tap('#btnSearch');
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'shots/mob-search.png' });
      await page.tap('#sug div:nth-child(3)');
      await page.waitForTimeout(900);
      console.log('after search origin =', await page.textContent('#oName'));
      // 点一个票价档位
      await page.tap('.tier[data-p="3"] .trow');
      await page.waitForTimeout(900);
      console.log('tier3 badge =', (await page.textContent('#tierBadge')).replace(/\s+/g, ' ').trim());
      await page.screenshot({ path: 'shots/mob-tier.png' });
      // 全部车站 tab
      await page.tap('.tabs button[data-tab="all"]');
      await page.waitForTimeout(500);
      await page.tap('.srow:nth-child(4)');
      await page.waitForTimeout(900);
      await page.screenshot({ path: 'shots/mob-all.png' });
      // 规则弹层
      await page.tap('#btnInfo');
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'shots/mob-rules.png' });
      await page.tap('#mClose');
      await page.waitForTimeout(200);
      // 双指缩放
      const before = await page.textContent('#stxt').catch(() => '');
      const box = await page.locator('#mapwrap').boundingBox();
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.touchscreen.tap(cx, cy);
      const scaleBefore = await page.evaluate(() => window.__m.state.scale);
      // 用 CDP 派发双指
      const cdp = await ctx.newCDPSession(page);
      const pts = [{ x: cx - 40, y: cy }, { x: cx + 40, y: cy }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
      for (let k = 1; k <= 8; k++) {
        const d = 40 + k * 15;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - d, y: cy, id: 0 }, { x: cx + d, y: cy, id: 1 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
      const scaleAfter = await page.evaluate(() => window.__m.state.scale);
      console.log('pinch scale', scaleBefore.toFixed(4), '->', scaleAfter.toFixed(4), 'ratio', (scaleAfter / scaleBefore).toFixed(2));
      await page.screenshot({ path: 'shots/mob-pinch.png' });
    }
    await ctx.close();
  }
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
