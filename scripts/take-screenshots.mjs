/**
 * Takes screenshots of the built app using Playwright.
 * Intended to run in CI after `npm run build`.
 *
 * Usage: node scripts/take-screenshots.mjs
 */

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'fs';

const SCREENSHOT_DIR = 'screenshots';
const PORT = 4173;

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Start a preview server for the built app
  const server = await createServer({
    configFile: 'vite.config.ts',
    preview: { port: PORT },
    server: { port: PORT, open: false },
  });
  const devServer = await server.listen(PORT);
  const url = `http://localhost:${PORT}`;
  console.log(`Server running at ${url}`);

  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(url, { waitUntil: 'networkidle' });

    // Wait for any async initialization
    await page.waitForTimeout(1000);

    // Full page screenshot
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/full-page.png`,
      fullPage: true,
    });
    console.log('Captured: full-page.png');

    // Canvas area only
    const canvas = page.locator('#canvas-container');
    if (await canvas.isVisible()) {
      await canvas.screenshot({
        path: `${SCREENSHOT_DIR}/canvas.png`,
      });
      console.log('Captured: canvas.png');
    }

    // Controls panel
    const controls = page.locator('#controls');
    if (await controls.isVisible()) {
      await controls.screenshot({
        path: `${SCREENSHOT_DIR}/controls.png`,
      });
      console.log('Captured: controls.png');
    }

    console.log(`Screenshots saved to ${SCREENSHOT_DIR}/`);
  } finally {
    await browser.close();
    await devServer.close();
  }
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
