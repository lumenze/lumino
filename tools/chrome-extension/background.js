// ── Lumino Demo Injector — Background Service Worker ──────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fetchSdk') {
    fetchSdkCode(message.url)
      .then((code) => sendResponse({ code }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.action === 'injectSdk') {
    injectSdk(message.tabId, message.sdkCode, message.config)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.action === 'removeSdk') {
    removeSdk(message.tabId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

// ── Auto-reinject on navigation ──────────────────────────────────────────

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const data = await chrome.storage.session.get(['injectionActive', 'injectionConfig', 'sdkCodeCache']);
  if (!data.injectionActive || !data.injectionConfig || !data.sdkCodeCache) return;

  const tabId = details.tabId;
  console.log('[Lumino Demo] Auto-reinjecting on navigation:', details.url);

  try {
    // Step 1: Read saved recording steps from sessionStorage BEFORE reinject wipes it
    let savedSteps = null;
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          const steps = sessionStorage.getItem('__lumino_recording_steps__');
          const active = sessionStorage.getItem('__lumino_recording_active__');
          console.log('[Lumino Demo] sessionStorage check — active:', active, 'steps:', steps ? 'found (' + JSON.parse(steps).length + ')' : 'none');
          return (active === 'true' && steps) ? steps : null;
        },
      });
      savedSteps = result?.result ? JSON.parse(result.result) : null;
      console.log('[Lumino Demo] Saved steps from sessionStorage:', savedSteps ? savedSteps.length : 0);
    } catch (e) {
      console.warn('[Lumino Demo] Could not read saved recording state:', e);
    }

    // Step 2: Reinject the SDK
    await injectSdk(tabId, data.sdkCodeCache, data.injectionConfig);

    // Step 3: If there were saved steps, resume recording (polls for SDK readiness)
    if (savedSteps && savedSteps.length > 0) {
      console.log('[Lumino Demo] Found', savedSteps.length, 'saved steps — will resume recording');
      await resumeRecording(tabId, savedSteps);
    }
  } catch (err) {
    console.error('[Lumino Demo] Auto-reinject failed:', err);
  }
});

async function fetchSdkCode(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch SDK: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * Inject the Lumino SDK into a tab, bypassing CSP.
 */
async function injectSdk(tabId, sdkCode, config) {
  // Step 1: Clean up existing Lumino
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const existing = document.querySelector('#lumino-shadow-host');
      if (existing) existing.remove();
      if (window.Lumino) {
        try { window.Lumino.destroy(); } catch {}
      }
      document.querySelectorAll('script[data-lumino-injected]').forEach((s) => s.remove());
    },
  });

  // Step 2: Build init code
  // The init code also sets up a step-capture hook that saves to sessionStorage
  // on every new step, so recording state survives full page navigations.
  const initCode = `
;(async function __luminoDemoInit__() {
  try {
    var cfg = ${JSON.stringify(config)};
    await new Promise(function(r) { setTimeout(r, 50); });

    var mod = window.LuminoSDK;
    var LuminoClass = mod && (mod.default || mod.Lumino);
    if (LuminoClass && LuminoClass.init) {
      var sdk = await LuminoClass.init({
        appId: cfg.appId,
        auth: function() { return cfg.token; },
        apiUrl: cfg.serverUrl,
        environment: 'production',
        debug: true,
      });

      // ── Recording state persistence ──────────────────────────────
      // Poll every 500ms and save current recording steps to sessionStorage.
      // This is synchronous storage that survives full page navigations,
      // so the background worker can read it back after reinjecting.
      window.__luminoStepSaver = setInterval(function() {
        try {
          if (!sdk || !sdk.getRecordingState) return;
          var state = sdk.getRecordingState();
          if (state.recording && state.steps.length > 0) {
            sessionStorage.setItem('__lumino_recording_steps__', JSON.stringify(state.steps));
            sessionStorage.setItem('__lumino_recording_active__', 'true');
          } else if (!state.recording) {
            // Recording stopped — clear saved state
            sessionStorage.removeItem('__lumino_recording_steps__');
            sessionStorage.removeItem('__lumino_recording_active__');
          }
        } catch(e) {}
      }, 500);

      console.log('%c[Lumino Demo] SDK initialized as ' + cfg.role, 'color: #e07a2f; font-weight: bold; font-size: 14px;');
    } else {
      console.error('[Lumino Demo] Lumino class not found. window.LuminoSDK =', mod);
    }
  } catch (err) {
    console.error('[Lumino Demo] Init failed:', err);
  }
})();
`;

  const wrappedSdk = `
    Object.defineProperty(document, 'currentScript', { value: null, configurable: true, writable: true });
    ${sdkCode}
    delete document.currentScript;
  `;

  const fullCode = wrappedSdk + '\n' + initCode;

  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (code) => {
      var blob = new Blob([code], { type: 'application/javascript' });
      var url = URL.createObjectURL(blob);
      var script = document.createElement('script');
      script.src = url;
      script.setAttribute('data-lumino-injected', 'true');
      script.onload = function () {
        URL.revokeObjectURL(url);
        console.log('%c[Lumino Demo] SDK script loaded via Blob URL', 'color: #e07a2f;');
      };
      script.onerror = function () {
        URL.revokeObjectURL(url);
        console.error('[Lumino Demo] Blob script failed — CSP may block blob: URLs too');
        try {
          new Function(code)();
          console.log('%c[Lumino Demo] SDK loaded via Function fallback', 'color: #e07a2f;');
        } catch (e2) {
          console.error('[Lumino Demo] Function fallback also blocked by CSP:', e2.message);
        }
      };
      document.head.appendChild(script);
    },
    args: [fullCode],
  });
}

/**
 * Resume recording on a tab with previously captured steps.
 * Polls for SDK readiness since Blob URL script load + init is async.
 */
async function resumeRecording(tabId, steps) {
  const maxAttempts = 20; // 20 x 500ms = 10 seconds max wait

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, 500));

    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (stepsJson, attemptNum) => {
        try {
          var mod = window.LuminoSDK;
          var LuminoClass = mod && (mod.default || mod.Lumino);
          var instance = LuminoClass && LuminoClass.getInstance && LuminoClass.getInstance();

          if (!instance || !instance.isInitialized) {
            console.log('[Lumino Demo] Waiting for SDK init... (attempt ' + (attemptNum + 1) + ')');
            return { ready: false };
          }

          if (!instance.resumeRecording) {
            console.warn('[Lumino Demo] SDK ready but resumeRecording not available');
            return { ready: true, error: 'no resumeRecording method' };
          }

          var steps = JSON.parse(stepsJson);
          instance.resumeRecording(steps);
          console.log('%c[Lumino Demo] Recording resumed with ' + steps.length + ' steps', 'color: #e07a2f; font-weight: bold;');
          return { ready: true, resumed: true };
        } catch (err) {
          console.error('[Lumino Demo] Resume attempt failed:', err.message);
          return { ready: false, error: err.message };
        }
      },
      args: [JSON.stringify(steps), attempt],
    });

    if (result?.result?.ready) {
      if (result.result.resumed) {
        console.log('[Lumino Demo] Recording resumed successfully on attempt', attempt + 1);
      }
      return;
    }
  }

  console.error('[Lumino Demo] Gave up waiting for SDK to initialize after', maxAttempts, 'attempts');
}

async function removeSdk(tabId) {
  await chrome.storage.session.remove(['injectionActive', 'injectionConfig', 'sdkCodeCache']);

  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      if (window.__luminoStepSaver) clearInterval(window.__luminoStepSaver);
      sessionStorage.removeItem('__lumino_recording_steps__');
      sessionStorage.removeItem('__lumino_recording_active__');
      if (window.Lumino) {
        try { window.Lumino.destroy(); } catch {}
      }
      const host = document.querySelector('#lumino-shadow-host');
      if (host) host.remove();
      document.querySelectorAll('script[data-lumino-injected]').forEach((s) => s.remove());
      console.log('%c[Lumino Demo] SDK removed', 'color: #ef4444; font-weight: bold;');
    },
  });
}
