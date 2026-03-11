// ── Lumino Demo Injector — Popup Logic ────────────────────────────────────

const $ = (sel) => document.querySelector(sel);

// ── State ─────────────────────────────────────────────────────────────────

let selectedRole = 'author';

// ── Role badge selection ──────────────────────────────────────────────────

document.querySelectorAll('.role-badge').forEach((badge) => {
  badge.addEventListener('click', () => {
    document.querySelectorAll('.role-badge').forEach((b) => b.classList.remove('selected'));
    badge.classList.add('selected');
    selectedRole = badge.dataset.role;
    chrome.storage.local.set({ role: selectedRole });
  });
});

// ── Load saved settings ───────────────────────────────────────────────────

chrome.storage.local.get(['serverUrl', 'appId', 'jwtSecret', 'role'], (data) => {
  if (data.serverUrl) $('#serverUrl').value = data.serverUrl;
  if (data.appId) $('#appId').value = data.appId;
  if (data.jwtSecret) $('#jwtSecret').value = data.jwtSecret;
  if (data.role) {
    selectedRole = data.role;
    document.querySelectorAll('.role-badge').forEach((b) => {
      b.classList.toggle('selected', b.dataset.role === selectedRole);
    });
  }
});

// Save on input change
['serverUrl', 'appId', 'jwtSecret'].forEach((id) => {
  $(  `#${id}`).addEventListener('input', (e) => {
    chrome.storage.local.set({ [id]: e.target.value });
  });
});

// ── Check current injection status ────────────────────────────────────────

chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  const tab = tabs[0];
  if (!tab?.id) return;

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!document.querySelector('#lumino-shadow-host'),
    });

    if (result?.result) {
      setStatus(true);
    }
  } catch {
    // Can't inject into chrome:// pages etc.
  }
});

function setStatus(active) {
  const bar = $('#statusBar');
  const dot = $('#statusDot');
  const text = $('#statusText');

  if (active) {
    bar.className = 'status-bar active';
    dot.className = 'status-dot active';
    text.textContent = 'Lumino is active on this page';
    $('#injectBtn').textContent = 'Re-inject';
  } else {
    bar.className = 'status-bar inactive';
    dot.className = 'status-dot inactive';
    text.textContent = 'Not injected on this page';
    $('#injectBtn').textContent = 'Inject Lumino';
  }
}

// ── JWT Generation (runs in extension context, never leaves the browser) ──

function base64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateToken(secret, role) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: `demo-${role}-${Date.now()}`,
    role: role,
    locale: 'en-US',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Use Web Crypto API for HMAC-SHA256
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const signatureArray = new Uint8Array(signatureBuffer);
  const signatureB64 = base64url(String.fromCharCode(...signatureArray));

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

// ── Inject Button ─────────────────────────────────────────────────────────

$('#injectBtn').addEventListener('click', async () => {
  const serverUrl = $('#serverUrl').value.trim().replace(/\/+$/, '');
  const appId = $('#appId').value.trim();
  const jwtSecret = $('#jwtSecret').value.trim();

  if (!serverUrl) {
    $('#serverUrl').style.borderColor = '#ef4444';
    return;
  }
  if (!jwtSecret) {
    $('#jwtSecret').style.borderColor = '#ef4444';
    return;
  }

  // Reset borders
  $('#serverUrl').style.borderColor = '';
  $('#jwtSecret').style.borderColor = '';

  const btn = $('#injectBtn');
  btn.disabled = true;
  btn.textContent = 'Generating token...';

  try {
    const token = await generateToken(jwtSecret, selectedRole);

    btn.textContent = 'Injecting...';

    // Save settings
    chrome.storage.local.set({ serverUrl, appId, jwtSecret, role: selectedRole });

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');

    // First, fetch the SDK script content from the server
    // We do this from the background worker to avoid CORS
    const sdkCode = await chrome.runtime.sendMessage({
      action: 'fetchSdk',
      url: `${serverUrl}/sdk/v1/lumino.js`,
    });

    if (sdkCode.error) {
      throw new Error(sdkCode.error);
    }

    // Inject via background script which uses chrome.debugger or
    // registerContentScripts to bypass CSP completely
    const injectionConfig = { serverUrl, appId, token, role: selectedRole };

    await chrome.runtime.sendMessage({
      action: 'injectSdk',
      tabId: tab.id,
      sdkCode: sdkCode.code,
      config: injectionConfig,
    });

    // Save injection state for auto-reinjection on navigation
    chrome.storage.session.set({
      injectionActive: true,
      injectionConfig,
      sdkCodeCache: sdkCode.code,
    });

    setStatus(true);
    btn.textContent = 'Injected!';
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'Re-inject';
    }, 1500);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Inject Lumino';
    btn.style.background = '#ef4444';
    setTimeout(() => (btn.style.background = ''), 2000);
    console.error('[Lumino Injector]', err);
  }
});

// ── Remove Button ─────────────────────────────────────────────────────────

$('#removeBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  await chrome.runtime.sendMessage({ action: 'removeSdk', tabId: tab.id });
  setStatus(false);
});
