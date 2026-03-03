const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Capturer les logs de la page
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    await page.goto('http://localhost:5000/index.html');
    console.log('Page chargée.');

    // Attendre que le bouton soit disponible
    await page.waitForSelector('#searchBtn');

    // État initial
    let isActive = await page.$eval('#searchContainer', el => el.classList.contains('active'));
    console.log('Avant clic, searchContainer a la class active ?', isActive);

    // Clic sur l'icône
    await page.click('#searchBtn');
    console.log('Clic effectué sur #searchBtn.');

    // Attente courte
    await new Promise(r => setTimeout(r, 500));

    // État après clic
    isActive = await page.$eval('#searchContainer', el => el.classList.contains('active'));
    console.log('Après clic, searchContainer a la class active ?', isActive);

    const displayState = await page.$eval('#searchContainer', el => window.getComputedStyle(el).display);
    const opacityState = await page.$eval('#searchContainer', el => window.getComputedStyle(el).opacity);
    const visibilityState = await page.$eval('#searchContainer', el => window.getComputedStyle(el).visibility);
    console.log('Styles calculés - display:', displayState, 'opacity:', opacityState, 'visibility:', visibilityState);

    await browser.close();
})();
