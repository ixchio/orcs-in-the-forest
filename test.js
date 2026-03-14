import puppeteer from 'puppeteer';
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() !== 'warning') console.log('PAGE LOG:', msg.text());
  });
  await page.goto('http://localhost:8080');
  
  // Click to start
  await page.waitForSelector('canvas');
  await page.mouse.click(500, 500);
  
  await new Promise(r => setTimeout(r, 4000));
  
  // Dump player health
  const hp = await page.evaluate(() => window.__G ? window.__G.player.health : 'no G');
  console.log('Player HP After 4s:', hp);
  
  await browser.close();
})();
