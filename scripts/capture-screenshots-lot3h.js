'use strict';

const puppeteer = require('puppeteer-core');
const http = require('http');
const app = require('../server');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, '../tests/screenshots');

async function capture() {
  console.log('=== CAPTURE DES ECRANS LOT 3H (INTELLIGIBILITE & QUALITE) ===');
  
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Serveur de test démarré sur ${baseUrl}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // 1. Page Partis Politiques
    console.log('1. Capture de partis-politiques.html...');
    await page.goto(`${baseUrl}/partis-politiques.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));
    const partiesPath = path.join(SCREENSHOT_DIR, 'partis_politiques_lot3h.png');
    await page.screenshot({ path: partiesPath, fullPage: false });
    console.log(`✓ Enregistré : ${partiesPath}`);

    // 2. Page DATA Explorer
    console.log('2. Capture de data.html...');
    await page.goto(`${baseUrl}/data.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));
    const dataPath = path.join(SCREENSHOT_DIR, 'data_explorer_lot3h.png');
    await page.screenshot({ path: dataPath, fullPage: false });
    console.log(`✓ Enregistré : ${dataPath}`);

    // 3. Modale Indicateur avec les 5 Repères Citoyens
    console.log('3. Capture de la modale indicateur avec 5 repères citoyens...');
    await page.evaluate(() => {
      const btn = document.querySelector('.btn-open-modal');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    const modalPath = path.join(SCREENSHOT_DIR, 'data_modal_citizen_guide_lot3h.png');
    await page.screenshot({ path: modalPath, fullPage: false });
    console.log(`✓ Enregistré : ${modalPath}`);

  } finally {
    await browser.close();
    server.close();
  }

  console.log('=== CAPTURES TERMINEES AVEC SUCCES ===');
  process.exit(0);
}

capture().catch(err => {
  console.error('Erreur captures:', err);
  process.exit(1);
});
