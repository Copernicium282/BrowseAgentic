const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0]?.pages()[0];
  if (!page) { console.log('No page found'); process.exit(1); }

  const url = process.argv[2];

  if (url === 'list') {
    await page.goto('https://the-internet.herokuapp.com/');
    await page.waitForLoadState('networkidle');
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#content ul li a')).map(a => ({
        text: a.textContent.trim(),
        href: a.href
      }));
    });
    console.log(JSON.stringify(links, null, 2));
  } else {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    console.log('Title:', await page.title());
    console.log('URL:', page.url());
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('Body:', bodyText.substring(0, 1500));
  }

  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
