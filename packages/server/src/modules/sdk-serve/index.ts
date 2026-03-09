import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * SDK Serve Module
 *
 * Serves the built lumino.js file from the server.
 * In production, this is the on-prem hosted SDK the host app loads via script tag.
 */

const SDK_CANDIDATES = [
  (cwd: string) => resolve(cwd, '../sdk/dist/lumino.js'),        // dev: cwd = packages/server
  (cwd: string) => resolve(cwd, 'packages/sdk/dist/lumino.js'),  // Docker: cwd = /app
];

const MAP_CANDIDATES = [
  (cwd: string) => resolve(cwd, '../sdk/dist/lumino.js.map'),
  (cwd: string) => resolve(cwd, 'packages/sdk/dist/lumino.js.map'),
];

async function readFirstAvailable(candidates: Array<(cwd: string) => string>): Promise<string | null> {
  const cwd = process.cwd();
  for (const getPath of candidates) {
    try {
      return await readFile(getPath(cwd), 'utf-8');
    } catch { /* try next */ }
  }
  return null;
}

export async function registerSdkServeModule(app: FastifyInstance): Promise<void> {
  // Serve SDK bundle
  app.get('/sdk/v1/lumino.js', async (_request, reply) => {
    const content = await readFirstAvailable(SDK_CANDIDATES);
    if (content) {
      reply
        .header('Content-Type', 'application/javascript')
        .header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
        .header('Access-Control-Allow-Origin', '*')
        .send(content);
    } else {
      // Fallback: send a minimal SDK shim for development
      reply
        .header('Content-Type', 'application/javascript')
        .header('Access-Control-Allow-Origin', '*')
        .send(DEV_SDK_SHIM);
    }
  });

  // Serve source map
  app.get('/sdk/v1/lumino.js.map', async (_request, reply) => {
    const content = await readFirstAvailable(MAP_CANDIDATES);
    if (content) {
      reply
        .header('Content-Type', 'application/json')
        .header('Access-Control-Allow-Origin', '*')
        .send(content);
    } else {
      reply.code(404).send('');
    }
  });

  app.log.info('SDK serve module registered at /sdk/v1/lumino.js');
}

/**
 * Development SDK shim.
 * Used when the full SDK hasn't been built yet.
 * Provides the same Lumino.init() API surface.
 */
const DEV_SDK_SHIM = `
(function() {
  'use strict';

  console.log('[Lumino Dev Shim] Loading...');

  var Lumino = {
    _initialized: false,
    _config: null,

    init: function(config) {
      if (this._initialized) {
        console.warn('[Lumino] Already initialized');
        return Promise.resolve(this);
      }

      this._config = config;
      console.log('[Lumino Dev Shim] init() called', { appId: config.appId, env: config.environment });

      var self = this;
      return Promise.resolve()
        .then(function() {
          return typeof config.auth === 'function' ? config.auth() : config.auth;
        })
        .then(function(token) {
          console.log('[Lumino Dev Shim] Authenticated');
          var baseUrl = config.apiUrl || (window.location.origin + '/lumino');
          return fetch(baseUrl + '/api/v1/walkthroughs/published?appId=' + config.appId, {
            headers: {
              'Authorization': 'Bearer ' + token,
              'X-Lumino-App': config.appId,
            }
          }).then(function(r) { return r.json(); });
        })
        .then(function(data) {
          self._initialized = true;
          var items = data.data ? data.data.items : [];
          console.log('[Lumino Dev Shim] Loaded ' + items.length + ' walkthroughs');
          if (items.length > 0) {
            self._showDevNotification(items[0]);
          }
          return self;
        })
        .catch(function(err) {
          console.warn('[Lumino Dev Shim] Init failed (server may not be running):', err.message);
          self._initialized = true;
          return self;
        });
    },

    _showDevNotification: function(wt) {
      var version = wt.versions && wt.versions[0];
      if (!version) return;
      var def = version.definition;

      var el = document.createElement('div');
      el.id = 'lumino-dev-notif';
      el.style.cssText = 'position:fixed;top:20px;right:20px;width:340px;background:#FFF;border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,0.12);z-index:100001;border-left:4px solid #E07A2F;font-family:-apple-system,BlinkMacSystemFont,sans-serif;transform:translateY(-20px);opacity:0;transition:all 0.5s cubic-bezier(0.16,1,0.3,1)';

      el.innerHTML = '<div style="display:inline-flex;align-items:center;gap:5px;background:rgba(224,122,47,0.15);color:#E07A2F;font-size:10px;font-weight:700;padding:4px 10px;border-radius:100px">Lumino Guide</div>'
        + '<h4 style="font-size:15px;font-weight:700;margin:10px 0 6px;color:#1F2937">' + def.title + '</h4>'
        + '<p style="font-size:12px;color:#6B7280;line-height:1.6;margin-bottom:16px">' + def.description + '</p>'
        + '<div style="display:flex;gap:8px">'
        + '<button id="lm-dev-start" style="flex:1;padding:10px 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#E07A2F,#F5A623);color:#FFF;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(224,122,47,0.3)">Show Me How</button>'
        + '<button id="lm-dev-dismiss" style="padding:10px 16px;border-radius:10px;border:1px solid #E5E7EB;background:transparent;color:#6B7280;font-size:13px;font-weight:600;cursor:pointer">Later</button>'
        + '</div>';

      document.body.appendChild(el);
      requestAnimationFrame(function() {
        el.style.transform = 'translateY(0)';
        el.style.opacity = '1';
      });

      document.getElementById('lm-dev-dismiss').onclick = function() {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-20px)';
        setTimeout(function() { el.remove(); }, 500);
      };

      document.getElementById('lm-dev-start').onclick = function() {
        el.remove();
        console.log('[Lumino Dev Shim] Would start walkthrough:', wt.id);
        console.log('[Lumino Dev Shim] Build the SDK for full player experience.');
      };
    },

    destroy: function() {
      this._initialized = false;
      var el = document.getElementById('lumino-dev-notif');
      if (el) el.remove();
    },

    version: '0.1.0-dev-shim',
    isInitialized: false,

    startWalkthrough: function(id) { console.log('[Lumino Dev Shim] startWalkthrough:', id); },
    stopWalkthrough: function() { console.log('[Lumino Dev Shim] stopWalkthrough'); },
    startRecording: function() { console.log('[Lumino Dev Shim] startRecording'); },
    stopRecording: function() { console.log('[Lumino Dev Shim] stopRecording'); return []; },
    on: function() {},
    off: function() {},
  };

  window.Lumino = Lumino;
})();
`;
