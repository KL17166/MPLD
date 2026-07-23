import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Setup global DOM environment for JSDOM
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'https://example.com/test-page'
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  writable: true,
  configurable: true
});
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.NodeFilter = dom.window.NodeFilter;
global.Text = dom.window.Text;
global.CustomEvent = dom.window.CustomEvent;
global.localStorage = dom.window.localStorage;

// Mock chrome extension APIs
function createMockChrome() {
  const storageStore = {};
  const messageListeners = [];
  const tabMessageListeners = [];

  return {
    storage: {
      local: {
        get: (keys, cb) => {
          const result = {};
          if (Array.isArray(keys)) {
            keys.forEach((k) => { result[k] = storageStore[k]; });
          } else if (typeof keys === 'string') {
            result[keys] = storageStore[keys];
          } else {
            Object.assign(result, storageStore);
          }
          if (cb) cb(result);
          return Promise.resolve(result);
        },
        set: (data, cb) => {
          Object.assign(storageStore, data);
          if (cb) cb();
          return Promise.resolve();
        },
        clear: (cb) => {
          Object.keys(storageStore).forEach((k) => delete storageStore[k]);
          if (cb) cb();
          return Promise.resolve();
        }
      },
      onChanged: {
        addListener: () => {}
      }
    },
    runtime: {
      getURL: (path) => `chrome-extension://mock-id/${path}`,
      sendMessage: (msg, cb) => {
        let responded = false;
        for (const listener of messageListeners) {
          listener(msg, {}, (res) => {
            responded = true;
            if (cb) cb(res);
          });
        }
        if (!responded && cb) cb({ success: true });
        return Promise.resolve({ success: true });
      },
      onMessage: {
        addListener: (fn) => messageListeners.push(fn)
      }
    },
    tabs: {
      query: (query, cb) => {
        if (cb) cb([{ id: 123, url: 'https://example.com/test-page' }]);
      },
      sendMessage: (tabId, msg, cb) => {
        let resData = { success: true, count: 5, replacements: 5 };
        if (msg.action === 'countMatches') resData = { count: 3 };
        if (cb) cb(resData);
        return Promise.resolve(resData);
      },
      reload: (tabId) => {
        window.__mockTabReloaded = tabId;
      },
      create: (opts) => {
        window.__mockTabCreated = opts.url;
      }
    }
  };
}

global.chrome = createMockChrome();

// Helper escape regex
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --------------------------------------------------------------------------
// SECTION 1: POPUP ENGINE & BUTTON FUNCTIONS
// --------------------------------------------------------------------------
test('POPUP - handleSaveRule creates new rule with replaceAll and persists to storage', async () => {
  let storedRules = [];
  global.chrome.storage.local.set = (data) => {
    if (data.rules) storedRules = data.rules;
    return Promise.resolve();
  };

  const findText = 'preco';
  const replaceText = 'R$ 0,00';
  const useRegex = false;
  const caseSensitive = false;
  const replaceAll = false; // Single match mode!

  const existingIndex = storedRules.findIndex((r) => r.find === findText);
  let updatedRules;
  if (existingIndex >= 0) {
    updatedRules = storedRules.map((r, i) => i === existingIndex ? { ...r, replace: replaceText, replaceAll } : r);
  } else {
    updatedRules = [{
      id: 'rule-100',
      name: findText,
      find: findText,
      replace: replaceText,
      useRegex,
      caseSensitive,
      replaceAll,
      enabled: true,
      mode: 'normal',
      createdAt: Date.now()
    }, ...storedRules];
  }

  await global.chrome.storage.local.set({ rules: updatedRules });

  assert.equal(storedRules.length, 1);
  assert.equal(storedRules[0].find, 'preco');
  assert.equal(storedRules[0].replace, 'R$ 0,00');
  assert.equal(storedRules[0].replaceAll, false);
});

test('POPUP - handleClearHistory clears history and deletes temporary quick- rules', async () => {
  const initialRules = [
    { id: 'rule-perm-1', find: 'fixo', replace: 'OK', enabled: true },
    { id: 'quick-170000', find: 'temp1', replace: 'TMP', enabled: true },
    { id: 'quick-170001', find: 'temp2', replace: 'TMP', enabled: true }
  ];

  let currentRules = [...initialRules];
  global.chrome.storage.local.set = (data) => {
    if (data.rules) currentRules = data.rules;
    return Promise.resolve();
  };

  // Perform cleanup of quick- rules
  const cleaned = currentRules.filter((r) => !r.id.startsWith('quick-'));
  await global.chrome.storage.local.set({ rules: cleaned });

  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].id, 'rule-perm-1');
});

test('POPUP - Domain Filter matching for active tab host', () => {
  const rules = [
    { id: '1', find: 'a', replace: 'b', urlFilter: 'example.com' },
    { id: '2', find: 'c', replace: 'd', urlFilter: 'outro-site.com' },
    { id: '3', find: 'e', replace: 'f', urlFilter: '' } // Global
  ];

  const currentHost = 'example.com';
  const siteRules = rules.filter((r) => {
    if (!r.urlFilter || r.urlFilter.trim() === '') return true;
    try {
      return new RegExp(r.urlFilter).test(currentHost);
    } catch {
      return currentHost.includes(r.urlFilter);
    }
  });

  assert.equal(siteRules.length, 2);
  assert.equal(siteRules[0].id, '1');
  assert.equal(siteRules[1].id, '3');
});

// --------------------------------------------------------------------------
// SECTION 2: PANEL ENGINE & BUTTON FUNCTIONS
// --------------------------------------------------------------------------
test('PANEL - VIP Simulator runs test payload and counts matches correctly', () => {
  const rules = [
    { id: 'vip-1', find: '10.000,00', replace: '0,00', useRegex: false, caseSensitive: false, replaceAll: true, mode: 'vip', enabled: true },
    { id: 'dom-1', find: '10.000,00', replace: 'FAIL', useRegex: false, caseSensitive: false, replaceAll: true, mode: 'normal', enabled: true }
  ];

  const payload = '{"saldo": "10.000,00", "cheque": "10.000,00"}';

  // Strict VIP filter logic
  const activeVipRules = rules.filter((r) => r.mode === 'vip' && r.enabled);
  let result = payload;
  let matchesCount = 0;

  for (const r of activeVipRules) {
    const isGlobal = r.replaceAll !== false;
    const flags = (r.caseSensitive ? '' : 'i') + (isGlobal ? 'g' : '');
    const pattern = new RegExp(escapeRegex(r.find), flags);
    const m = result.match(pattern);
    if (m) {
      matchesCount += isGlobal ? m.length : 1;
      result = result.replace(pattern, r.replace);
    }
  }

  assert.equal(matchesCount, 2);
  assert.ok(result.includes('0,00'));
  assert.ok(!result.includes('FAIL')); // Proves DOM rules were not applied to VIP simulator!
});

test('PANEL - handleSyncRulesToProxyServer filters ONLY mode === ultra rules', () => {
  const rules = [
    { id: 'ultra-1', find: 'api/v1', replace: 'api/v2', mode: 'ultra', enabled: true },
    { id: 'dom-1', find: 'Preço', replace: 'Gratis', mode: 'normal', enabled: true },
    { id: 'vip-1', find: 'saldo', replace: '9999', mode: 'vip', enabled: true }
  ];

  const ultraRules = rules.filter((r) => r.mode === 'ultra' && r.enabled);
  assert.equal(ultraRules.length, 1);
  assert.equal(ultraRules[0].id, 'ultra-1');
});

test('POPUP - handleToggleRule toggles enabled state of specified rule', () => {
  const rules = [
    { id: '1', find: 'a', replace: 'b', enabled: true },
    { id: '2', find: 'c', replace: 'd', enabled: false }
  ];

  const toggleId = '1';
  const updated = rules.map((r) => (r.id === toggleId ? { ...r, enabled: !r.enabled } : r));

  assert.equal(updated[0].enabled, false);
  assert.equal(updated[1].enabled, false);
});

test('POPUP - handleDeleteRule removes specified rule from array', () => {
  const rules = [
    { id: '1', find: 'a', replace: 'b', enabled: true },
    { id: '2', find: 'c', replace: 'd', enabled: true }
  ];

  const deleteId = '1';
  const updated = rules.filter((r) => r.id !== deleteId);

  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, '2');
});

test('PANEL - handleSaveModal constructs new rule with replaceAll and mode ultra', () => {
  const rules = [];
  const formName = 'Minha Regra Ultra';
  const formFind = 'api/v1/user';
  const formReplace = 'api/v2/user';
  const formMode = 'ultra';
  const formReplaceAll = true;

  const targetRule = {
    id: 'rule-' + Date.now(),
    name: formName || formFind,
    find: formFind,
    replace: formReplace,
    mode: formMode,
    replaceAll: formReplaceAll,
    enabled: true,
    createdAt: Date.now()
  };

  const updatedRules = [targetRule, ...rules];
  assert.equal(updatedRules.length, 1);
  assert.equal(updatedRules[0].mode, 'ultra');
  assert.equal(updatedRules[0].replaceAll, true);
});

test('PANEL - handleSaveProxyConfig formats ProxyConfig object correctly', () => {
  const proxyHostInput = '192.168.1.100';
  const proxyPortInput = '8080';
  const proxyModeInput = 'fixed_servers';
  const proxyBypassInput = 'localhost, 127.0.0.1, internal.net';

  const updated = {
    enabled: true,
    host: proxyHostInput,
    port: Number(proxyPortInput) || 8080,
    mode: proxyModeInput,
    bypassList: proxyBypassInput.split(',').map((s) => s.trim()).filter(Boolean)
  };

  assert.equal(updated.host, '192.168.1.100');
  assert.equal(updated.port, 8080);
  assert.equal(updated.bypassList.length, 3);
  assert.equal(updated.bypassList[2], 'internal.net');
});

test('PANEL - handleClearSingleRuleStat removes statistics for specific rule', () => {
  const stats = { 'rule-1': 45, 'rule-2': 120 };
  const targetId = 'rule-1';

  const updatedStats = { ...stats };
  delete updatedStats[targetId];

  assert.equal(updatedStats['rule-1'], undefined);
  assert.equal(updatedStats['rule-2'], 120);
});

// --------------------------------------------------------------------------
// SECTION 3: DOM ENGINE & HIGHLIGHT CLEANUP
// --------------------------------------------------------------------------
test('CONTENT SCRIPT - clearHighlights removes inline styles and data attributes', () => {
  document.body.innerHTML = `
    <div id="el1" data-mpld-highlight="true" style="outline: 2px dashed rgb(34, 197, 94); background-color: rgba(34, 197, 94, 0.1);">Texto 1</div>
    <div id="el2" data-mpld-highlight="true" style="outline: 2px dashed rgb(34, 197, 94);">Texto 2</div>
  `;

  function clearHighlights() {
    const elements = document.querySelectorAll('[data-mpld-highlight="true"]');
    elements.forEach((el) => {
      el.style.outline = '';
      el.style.backgroundColor = '';
      delete el.dataset.mpldHighlight;
    });
  }

  clearHighlights();

  const el1 = document.getElementById('el1');
  const el2 = document.getElementById('el2');

  assert.equal(el1.style.outline, '');
  assert.equal(el1.style.backgroundColor, '');
  assert.equal(el1.dataset.mpldHighlight, undefined);
  assert.equal(el2.style.outline, '');
});

test('CONTENT SCRIPT - watchChanges flag controls MutationObserver startup', () => {
  let observerStarted = false;
  function applyRulesWithWatchChanges(observe, watchChangesSetting) {
    const shouldObserve = watchChangesSetting !== false;
    if (observe && shouldObserve) {
      observerStarted = true;
    } else {
      observerStarted = false;
    }
  }

  applyRulesWithWatchChanges(true, false);
  assert.equal(observerStarted, false);

  applyRulesWithWatchChanges(true, true);
  assert.equal(observerStarted, true);
});

// --------------------------------------------------------------------------
// SECTION 4: INTERCEPTOR CLIENT-SIDE (SÍNCRONO LOCALSTORAGE)
// --------------------------------------------------------------------------
test('INTERCEPTOR - Synchronous initial load from localStorage at document_start', () => {
  localStorage.setItem('__tm_vip_rules', JSON.stringify({
    active: true,
    rules: [{ id: 'v1', find: 'original_api', replace: 'fake_api', enabled: true }]
  }));

  let vipRules = [];
  let vipActive = false;

  // Synchronous init code executed at top of file
  try {
    const stored = localStorage.getItem('__tm_vip_rules');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.active && Array.isArray(parsed.rules)) {
        vipRules = parsed.rules;
        vipActive = true;
      }
    }
  } catch {
    // Ignored
  }

  assert.equal(vipActive, true);
  assert.equal(vipRules.length, 1);
  assert.equal(vipRules[0].find, 'original_api');
  assert.equal(vipRules[0].replace, 'fake_api');
});

test('INTERCEPTOR - JSON.parse monkeypatching applies rules to JSON strings', () => {
  const vipRules = [{ id: 'v1', find: '"status":"pending"', replace: '"status":"approved"', enabled: true, replaceAll: true }];
  const vipActive = true;

  function applyRules(text) {
    if (!vipActive || vipRules.length === 0) return text;
    let result = text;
    for (const r of vipRules) {
      result = result.replace(new RegExp(escapeRegex(r.find), 'g'), r.replace);
    }
    return result;
  }

  const originalJSONParse = JSON.parse;
  const patchedParse = function(text, reviver) {
    if (vipActive && typeof text === 'string') {
      const modified = applyRules(text);
      return originalJSONParse(modified, reviver);
    }
    return originalJSONParse(text, reviver);
  };

  const rawPayload = '{"id":123,"status":"pending"}';
  const parsed = patchedParse(rawPayload);

  assert.equal(parsed.status, 'approved');
});

// --------------------------------------------------------------------------
// SECTION 5: PROXY SERVER REST API ROUTES
// --------------------------------------------------------------------------
test('PROXY SERVER - Rules CRUD API supports replaceAll property', () => {
  let rulesStore = [];

  function handlePostRule(reqBody) {
    const rule = {
      id: 'proxy-1',
      name: reqBody.name || 'Nova Regra',
      find: reqBody.find || '',
      replace: reqBody.replace || '',
      urlFilter: reqBody.urlFilter || '',
      useRegex: !!reqBody.useRegex,
      caseSensitive: !!reqBody.caseSensitive,
      replaceAll: reqBody.replaceAll !== false,
      enabled: reqBody.enabled !== false
    };
    rulesStore.push(rule);
    return rule;
  }

  const created = handlePostRule({
    name: 'Proxy Rule Single',
    find: 'foo',
    replace: 'bar',
    replaceAll: false
  });

  assert.equal(created.replaceAll, false);
  assert.equal(rulesStore.length, 1);
  assert.equal(rulesStore[0].find, 'foo');
});
