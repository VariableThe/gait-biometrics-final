import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:8791/gait-biometrics-results-review.html?print=4014d85', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
// Force light theme so colored charts print on white (avoid dark-mode PDF)
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await page.waitForTimeout(500);
// sanity: confirm the new report rendered (commit hash + charts + threshold)
const check = await page.evaluate(() => ({
  commit: (document.body.textContent.match(/4014d85|cfbb8c6/) || [])[0],
  marks: document.querySelectorAll('.chart rect,.chart path,.chart line').length,
  threshold: document.body.textContent.includes('0.7250201527062856')
}));
console.log('render-check', JSON.stringify(check));
if (check.commit !== '4014d85' || check.marks < 200 || !check.threshold) {
  throw new Error('Report did not render correctly: ' + JSON.stringify(check));
}
await page.pdf({ path: 'gait-biometrics-results-review.pdf', format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
console.log('PDF written');
await browser.close();
