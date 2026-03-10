const express = require('express');
const app = express();
const db = require('./backend/config/database');
const analyticsRoute = require('./backend/routes/analytics');

// Mock `isAdmin` for testing
jest = { mock: true }; // Just kidding, we'll patch the route

const originalGet = express.Router.prototype.get;
express.Router.prototype.get = function (path, ...handlers) {
    if (handlers.length > 1) {
        handlers = handlers.filter(h => h.name !== 'isAdmin'); // remove auth middleware
    }
    return originalGet.call(this, path, ...handlers);
};

// Re-require with patched router
delete require.cache[require.resolve('./backend/routes/analytics')];
const patchedAnalyticsRoute = require('./backend/routes/analytics');
app.use('/api/analytics', patchedAnalyticsRoute);

const request = require('supertest');
(async () => {
    try {
        console.log('Testing /api/analytics/overview');
        let res = await request(app).get('/api/analytics/overview');
        console.log('Overview:', res.body);

        console.log('Testing /api/analytics/reading-progress');
        res = await request(app).get('/api/analytics/reading-progress');
        console.log('Progress:', res.body);

        console.log('Testing /api/analytics/top-articles');
        res = await request(app).get('/api/analytics/top-articles');
        console.log('Top:', res.body);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
})();
