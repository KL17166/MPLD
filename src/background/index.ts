import { ProxyConfig, Rule } from '../types';

const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  enabled: false,
  host: '127.0.0.1',
  port: 8080,
  mode: 'fixed_servers',
  bypassList: ['localhost', '127.0.0.1', '<local>']
};

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
    chrome.storage.local.set({ rules: message.rules }, () => {
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

  if (message.action === 'getVipStatus') {
    chrome.storage.local.get(['vipActive'], (data) => {
      sendResponse({ vipActive: !!data.vipActive });
    });
    return true;
  }

  if (message.action === 'setVipStatus') {
    chrome.storage.local.set({ vipActive: message.vipActive }, () => {
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

  if (message.action === 'getProxyConfig') {
    chrome.storage.local.get(['proxyConfig'], (data) => {
      sendResponse({ config: data.proxyConfig || DEFAULT_PROXY_CONFIG });
    });
    return true;
  }

  if (message.action === 'setProxyConfig') {
    const config: ProxyConfig = message.config;
    chrome.storage.local.set({ proxyConfig: config }, () => {
      if (config.enabled) {
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
      } else {
        chrome.proxy.settings.clear({ scope: 'regular' }, () => {
          sendResponse({ success: true });
        });
      }
    });
    return true;
  }
});
