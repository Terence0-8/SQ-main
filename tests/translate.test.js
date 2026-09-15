'use strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-only';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');

describe('POST /api/translate/article/:id — protection', () => {
  test('refuse une demande anonyme sans token CSRF', async () => {
    const res = await request(app)
      .post('/api/translate/article/1')
      .send({ targetLang: 'en' });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  test('refuse une demande sans session même avec un token CSRF valide', async () => {
    const agent = request.agent(app);
    const csrf = await agent.get('/api/csrf-token');
    const res = await agent
      .post('/api/translate/article/1')
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ targetLang: 'en' });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });
});