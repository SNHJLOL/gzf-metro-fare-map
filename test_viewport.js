// playwright 可选装：npm i -D playwright && npx playwright install chromium
// 也可以用 PLAYWRIGHT_PATH 指向已装位置（CI / 离线环境）
const PW = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PW);
const { pathToFileURL } = require('url');
const { join } = require('path');
const PAGE = pathToFileURL(join(__dirname, '广州地铁票价地图.html')).href;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  for (const vp of [{ w: 1440, h: 900 }, { w: 1024, h: 768 }, { w: 390, h: 844 }]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    await page.goto(PAGE);
    await page.waitForTimeout(700);
    const info = await page.evaluate(() => {
      const de = document.documentElement;
      const over = [...document.querySelectorAll('body *')]
        .filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
        })
        .slice(0, 8)
        .map(el => `${el.tagName}.${el.className}`.slice(0, 46) + ' right=' + Math.round(el.getBoundingClientRect().right));
      return {
        vw: window.innerWidth,
        scrollW: de.scrollWidth,
        bodyScrollW: document.body.scrollWidth,
        over,
      };
    });
    console.log(vp.w + 'x' + vp.h, JSON.stringify(info));
    await page.screenshot({ path: `shots/vp-${vp.w}.png` });
    await page.close();
  }
  await browser.close();
})();
