'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const SW_PATH = path.join(ROOT_DIR, 'sw.js');
const PARTIS_HTML_PATH = path.join(ROOT_DIR, 'partis-politiques.html');

function createMockCaches(initialStore = {}) {
  const store = new Map();
  for (const [cacheName, entries] of Object.entries(initialStore)) {
    const inner = new Map();
    for (const [reqKey, resVal] of Object.entries(entries)) {
      inner.set(reqKey, resVal);
    }
    store.set(cacheName, inner);
  }

  function makeCacheWrapper(innerMap) {
    return {
      async match(req) {
        const key = typeof req === 'string' ? req : req.url;
        return innerMap.get(key) || undefined;
      },
      async put(req, res) {
        const key = typeof req === 'string' ? req : req.url;
        innerMap.set(key, res);
      },
      async add(url) {
        innerMap.set(url, { url, status: 200, clone() { return this; } });
      },
      async keys() {
        return Array.from(innerMap.keys()).map((u) => ({ url: u }));
      },
    };
  }

  return {
    _store: store,
    async open(name) {
      if (!store.has(name)) {
        store.set(name, new Map());
      }
      return makeCacheWrapper(store.get(name));
    },
    async keys() {
      return Array.from(store.keys());
    },
    async delete(name) {
      return store.delete(name);
    },
    async match(req) {
      const key = typeof req === 'string' ? req : req.url;
      for (const inner of store.values()) {
        if (inner.has(key)) return inner.get(key);
      }
      return undefined;
    },
  };
}

function loadServiceWorkerSandbox({ fetchImpl, initialCaches = {} } = {}) {
  const listeners = new Map();
  let claimed = false;
  let skippedWaiting = false;
  const mockCaches = createMockCaches(initialCaches);

  class MockResponse {
    constructor(body, init = {}) {
      this._body = body;
      this.status = init.status ?? 200;
      this.statusText = init.statusText ?? '';
      this.headers = new Map(Object.entries(init.headers || {}));
    }
    clone() {
      return new MockResponse(this._body, {
        status: this.status,
        statusText: this.statusText,
        headers: Object.fromEntries(this.headers.entries()),
      });
    }
    async text() {
      return String(this._body);
    }
    async json() {
      return JSON.parse(String(this._body));
    }
  }

  const selfObj = {
    location: {
      origin: 'https://beta.solitiquo.com',
      hostname: 'beta.solitiquo.com',
    },
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    skipWaiting() {
      skippedWaiting = true;
      return Promise.resolve();
    },
    clients: {
      claim() {
        claimed = true;
        return Promise.resolve();
      },
    },
  };

  const sandbox = {
    self: selfObj,
    caches: mockCaches,
    fetch:
      fetchImpl ||
      (async () => {
        throw new Error('Unexpected network call in test');
      }),
    Response: MockResponse,
    URL,
    Promise,
    Set,
    console: { warn: () => {}, log: () => {}, error: () => {} },
  };

  const swCode = fs.readFileSync(SW_PATH, 'utf8');
  vm.runInNewContext(`${swCode}\n;__SW_EXPORTS__ = { CACHE_NAME };`, sandbox, {
    filename: 'sw.js',
  });

  function dispatchFetch({ url, method = 'GET', mode = 'cors', headers = {} }) {
    const handler = listeners.get('fetch');
    assert.ok(handler, 'fetch listener must be registered in sw.js');

    let respondedWith = null;
    const request = {
      url,
      method,
      mode,
      headers: {
        get(name) {
          const lower = name.toLowerCase();
          for (const [k, v] of Object.entries(headers)) {
            if (k.toLowerCase() === lower) return v;
          }
          return null;
        },
      },
    };
    const event = {
      request,
      respondWith(promiseOrResponse) {
        respondedWith = promiseOrResponse;
      },
    };
    handler(event);
    return respondedWith;
  }

  async function dispatchLifecycle(type) {
    const handler = listeners.get(type);
    assert.ok(handler, `${type} listener must be registered in sw.js`);
    let pending = Promise.resolve();
    handler({
      waitUntil(p) {
        pending = Promise.resolve(p);
      },
    });
    await pending;
  }

  return {
    cacheName: sandbox.__SW_EXPORTS__.CACHE_NAME,
    mockCaches,
    dispatchFetch,
    dispatchLifecycle,
    getState: () => ({ claimed, skippedWaiting }),
  };
}

describe('Service Worker (sw.js) — Sondes de santé, passthrough & stratégie cache', () => {
  test('CACHE_NAME a été incrémenté par rapport à la version précédente', () => {
    const sw = loadServiceWorkerSandbox();
    assert.ok(sw.cacheName.startsWith('solitiquo-'));
    assert.notEqual(sw.cacheName, 'solitiquo-v20261108-fix-admin-lot3i');
  });

  test('Laisse passer directement sans interception les endpoints de santé (/api/ping, /api/health, /api/health/live, /api/health/ready)', () => {
    let networkCalls = 0;
    const sw = loadServiceWorkerSandbox({
      fetchImpl: async () => {
        networkCalls += 1;
        return { status: 200 };
      },
    });

    const healthPaths = [
      'https://beta.solitiquo.com/api/ping',
      'https://beta.solitiquo.com/api/ping/',
      'https://beta.solitiquo.com/api/health',
      'https://beta.solitiquo.com/api/health/live',
      'https://beta.solitiquo.com/api/health/ready',
      'https://beta.solitiquo.com/api/health/ready?utm_source=diagnostic',
    ];

    for (const url of healthPaths) {
      for (const mode of ['cors', 'same-origin', 'navigate']) {
        const resPromise = sw.dispatchFetch({
          url,
          method: 'GET',
          mode,
          headers: mode === 'navigate' ? { accept: 'text/html,application/xhtml+xml' } : {},
        });
        assert.equal(
          resPromise,
          null,
          `${url} (mode=${mode}) ne doit pas être intercepté par event.respondWith`
        );
      }
    }

    assert.equal(networkCalls, 0);
  });

  test('Laisse passer directement les navigations directes (mode=navigate) vers /api/* sans interception SW ni fallback HTML', () => {
    const sw = loadServiceWorkerSandbox();

    for (const url of [
      'https://beta.solitiquo.com/api/articles',
      'https://beta.solitiquo.com/api/auth/me',
      'https://beta.solitiquo.com/api/subscriptions/plans',
    ]) {
      const resPromise = sw.dispatchFetch({
        url,
        method: 'GET',
        mode: 'navigate',
        headers: { accept: 'text/html,application/xhtml+xml' },
      });
      assert.equal(
        resPromise,
        null,
        `Navigation directe vers ${url} ne doit pas être interceptée`
      );
    }
  });

  test('Conserve la stratégie Network-Only et le fallback 503 NetworkUnavailable pour les appels API standards (mode!=navigate)', async () => {
    const onlineSw = loadServiceWorkerSandbox({
      fetchImpl: async (req) => ({
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ ok: true, url: req.url }),
      }),
    });

    const onlineResPromise = onlineSw.dispatchFetch({
      url: 'https://beta.solitiquo.com/api/articles',
      method: 'GET',
      mode: 'cors',
    });
    assert.ok(onlineResPromise, 'GET /api/articles (cors) doit être géré par le SW');
    const onlineRes = await onlineResPromise;
    assert.equal(onlineRes.status, 200);
    assert.deepEqual(await onlineRes.json(), {
      ok: true,
      url: 'https://beta.solitiquo.com/api/articles',
    });

    const offlineSw = loadServiceWorkerSandbox({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const offlineResPromise = offlineSw.dispatchFetch({
      url: 'https://beta.solitiquo.com/api/articles',
      method: 'GET',
      mode: 'cors',
    });
    assert.ok(offlineResPromise, 'GET /api/articles hors-ligne doit être géré par le SW');
    const offlineRes = await offlineResPromise;
    assert.equal(offlineRes.status, 503);
    assert.equal(offlineRes.headers.get('Content-Type'), 'application/json');
    assert.deepEqual(await offlineRes.json(), {
      success: false,
      error: 'NetworkUnavailable',
      offline: true,
    });
  });

  test('Laisse passer les requêtes non-GET et les routes /admin ou /api/admin', () => {
    const sw = loadServiceWorkerSandbox();
    assert.equal(
      sw.dispatchFetch({ url: 'https://beta.solitiquo.com/api/articles', method: 'POST', mode: 'cors' }),
      null
    );
    assert.equal(
      sw.dispatchFetch({ url: 'https://beta.solitiquo.com/api/admin/stats', method: 'GET', mode: 'cors' }),
      null
    );
    assert.equal(
      sw.dispatchFetch({ url: 'https://beta.solitiquo.com/admin.html', method: 'GET', mode: 'navigate' }),
      null
    );
  });

  test('activate migre le cache hors-ligne utile, exclut admin et préserve solitiquo-offline-media', async () => {
    const makeRes = (body) => ({
      body,
      clone() {
        return makeRes(body);
      },
    });

    const sw = loadServiceWorkerSandbox({
      initialCaches: {
        'solitiquo-v20261108-fix-admin-lot3i': {
          'https://beta.solitiquo.com/offline.html': makeRes('offline'),
          'https://beta.solitiquo.com/css/shared.css': makeRes('css'),
          'https://beta.solitiquo.com/admin.html': makeRes('admin'),
          'https://beta.solitiquo.com/admin-data.html': makeRes('admin-data'),
        },
        'solitiquo-offline-media': {
          'https://beta.solitiquo.com/uploads/podcast-1.mp3': makeRes('audio'),
        },
      },
    });

    await sw.dispatchLifecycle('activate');

    assert.equal(sw.getState().claimed, true);
    assert.ok(
      sw.mockCaches._store.has('solitiquo-offline-media'),
      'Le cache média hors-ligne ne doit pas être supprimé'
    );
    assert.ok(
      sw.mockCaches._store
        .get('solitiquo-offline-media')
        .has('https://beta.solitiquo.com/uploads/podcast-1.mp3')
    );

    assert.equal(
      sw.mockCaches._store.has('solitiquo-v20261108-fix-admin-lot3i'),
      false,
      'L’ancien cache versionné doit être remplacé'
    );

    const newCache = sw.mockCaches._store.get(sw.cacheName);
    assert.ok(newCache, 'Le nouveau cache doit exister');
    assert.ok(newCache.has('https://beta.solitiquo.com/offline.html'));
    assert.ok(newCache.has('https://beta.solitiquo.com/css/shared.css'));
    assert.equal(newCache.has('https://beta.solitiquo.com/admin.html'), false);
    assert.equal(newCache.has('https://beta.solitiquo.com/admin-data.html'), false);
  });

  test("partis-politiques.html enregistre le Service Worker avec le chemin absolu '/sw.js'", () => {
    const html = fs.readFileSync(PARTIS_HTML_PATH, 'utf8');
    assert.match(html, /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
    assert.doesNotMatch(html, /navigator\.serviceWorker\.register\('sw\.js'\)/);
  });
});

