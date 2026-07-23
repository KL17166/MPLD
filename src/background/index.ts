import { ProxyConfig, Rule } from '../types';

const DEFAULT_PROXY_CONFIG = {
  mode: 'fixed_servers' as const,
  rules: {
    singleProxy: {
      scheme: 'http',
      host: '127.0.0.1',
      port: 8080
    },
    bypassList: ['localhost', '127.0.0.1', '<local>']
  }
};

function broadcastRulesToAllTabs(rules: Rule[]) {
  const enabledRules = rules.filter((r) => r.enabled);
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id && tab.url && !tab.url.startsWith('chrome')) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'applyRules',
          rules: enabledRules
        }).catch(() => {});
        chrome.tabs.sendMessage(tab.id, {
          action: 'updateVipRules',
          rules: rules,
          active: true
        }).catch(() => {});
      }
    }
  });
}

// Handle extension messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openPanel') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/panel/index.html') });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'applyRulesToTab') {
    const tabId = message.tabId;
    chrome.storage.local.get(['rules'], (data) => {
      const rules: Rule[] = (data.rules || []).filter((r: Rule) => r.enabled);
      if (rules.length > 0) {
        chrome.tabs.sendMessage(tabId, {
          action: 'applyRules',
          rules: rules
        }).catch(() => { });
      }
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'getRules') {
    chrome.storage.local.get(['rules'], (data) => {
      sendResponse({ rules: data.rules || [] });
    });
    return true;
  }

  if (message.action === 'saveRules') {
    const rules: Rule[] = message.rules || [];
    chrome.storage.local.set({ rules }, () => {
      broadcastRulesToAllTabs(rules);
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'getStats') {
    chrome.storage.local.get(['stats'], (data) => {
      sendResponse({ stats: data.stats || {} });
    });
    return true;
  }

  if (message.action === 'updateStats') {
    chrome.storage.local.get(['stats'], (data) => {
      const stats = data.stats || {};
      const ruleId = message.ruleId;
      const count = message.count || 0;
      stats[ruleId] = (stats[ruleId] || 0) + count;
      chrome.storage.local.set({ stats }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === 'clearStats') {
    chrome.storage.local.set({ stats: {} }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'getVipStatus') {
    chrome.storage.local.get(['vipActive'], (data) => {
      sendResponse({ vipActive: !!data.vipActive });
    });
    return true;
  }

  if (message.action === 'setVipStatus') {
    chrome.storage.local.set({ vipActive: message.vipActive }, () => {
      chrome.storage.local.get(['rules'], (data) => {
        const allRules = data.rules || [];
        broadcastRulesToAllTabs(allRules);
      });
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'getHighlightStatus') {
    chrome.storage.local.get(['highlightActive'], (data) => {
      sendResponse({ highlightActive: !!data.highlightActive });
    });
    return true;
  }

  if (message.action === 'setHighlightStatus') {
    chrome.storage.local.set({ highlightActive: message.highlightActive }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'getSettings') {
    chrome.storage.local.get(['autoApply', 'watchChanges', 'continuousMode', 'pollingInterval', 'vipActive', 'highlightActive'], (data) => {
      sendResponse({
        autoApply: !!data.autoApply,
        watchChanges: data.watchChanges !== false,
        continuousMode: !!data.continuousMode,
        pollingInterval: data.pollingInterval || 500,
        vipActive: !!data.vipActive,
        highlightActive: !!data.highlightActive
      });
    });
    return true;
  }

  if (message.action === 'saveSettings') {
    chrome.storage.local.set(message.settings, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'clearAllData') {
    chrome.storage.local.clear(() => {
      broadcastRulesToAllTabs([]);
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'activateProxy') {
    if (chrome.proxy && chrome.proxy.settings) {
      chrome.proxy.settings.set(
        { value: DEFAULT_PROXY_CONFIG, scope: 'regular' },
        () => {
          chrome.storage.local.set({ proxyActive: true });
          sendResponse({ success: true });
        }
      );
    } else {
      sendResponse({ success: false });
    }
    return true;
  }

  if (message.action === 'deactivateProxy') {
    if (chrome.proxy && chrome.proxy.settings) {
      chrome.proxy.settings.clear({ scope: 'regular' }, () => {
        chrome.storage.local.set({ proxyActive: false });
        sendResponse({ success: true });
      });
    } else {
      sendResponse({ success: false });
    }
    return true;
  }

  if (message.action === 'getProxyStatus') {
    if (chrome.proxy && chrome.proxy.settings) {
      chrome.proxy.settings.get({ incognito: false }, (config) => {
        const isActive = config.value && config.value.mode === 'fixed_servers';
        sendResponse({ active: isActive });
      });
    } else {
      sendResponse({ active: false });
    }
    return true;
  }

  if (message.action === 'getProxyConfig') {
    chrome.storage.local.get(['proxyConfig'], (data) => {
      sendResponse({ config: data.proxyConfig || { enabled: false, host: '127.0.0.1', port: 8080, mode: 'fixed_servers', bypassList: ['localhost', '127.0.0.1', '<local>'] } });
    });
    return true;
  }

  if (message.action === 'setProxyConfig') {
    const config: ProxyConfig = message.config;
    chrome.storage.local.set({ proxyConfig: config }, () => {
      if (config.enabled && chrome.proxy) {
        chrome.proxy.settings.set(
          {
            value: {
              mode: config.mode,
              rules: {
                singleProxy: {
                  scheme: 'http',
                  host: config.host,
                  port: config.port
                },
                bypassList: config.bypassList
              }
            },
            scope: 'regular'
          },
          () => sendResponse({ success: true })
        );
      } else if (chrome.proxy) {
        chrome.proxy.settings.clear({ scope: 'regular' }, () => {
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: true });
      }
    });
    return true;
  }
});

// Broadcast storage changes to tabs & UI
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.rules) {
      const newRules: Rule[] = changes.rules.newValue || [];
      broadcastRulesToAllTabs(newRules);
    }
  }
});

// Tab update listener for auto-apply
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome')) {
    chrome.storage.local.get(['rules', 'autoApply', 'vipActive'], (data) => {
      if (!data.autoApply) return;
      const rules = (data.rules || []).filter((r: Rule) => {
        if (!r.enabled) return false;
        if (!r.urlFilter || r.urlFilter.trim() === '') return true;
        try {
          return new RegExp(r.urlFilter).test(tab.url!);
        } catch {
          return tab.url!.includes(r.urlFilter);
        }
      });
      if (rules.length > 0) {
        chrome.tabs.sendMessage(tabId, {
          action: 'applyRules',
          rules: rules
        }).catch(() => { });
      }

      if (data.vipActive) {
        chrome.tabs.sendMessage(tabId, {
          action: 'updateVipRules',
          rules: data.rules || [],
          active: true
        }).catch(() => {});
      }
    });
  }
});
