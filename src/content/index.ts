import { Rule } from '../types';

(() => {
  let activeObserver: MutationObserver | null = null;
  let activeRules: Rule[] = [];
  let pollingTimer: number | null = null;
  let isProcessing = false;
  let isHighlightActive = false;

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Wait for DOM ready
  function onDomReady(callback: () => void) {
    if (document.body) {
      callback();
    } else {
      const observer = new MutationObserver(() => {
        if (document.body) {
          observer.disconnect();
          callback();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }
  }

  // Inject Main World Interceptor
  function injectMainWorldInterceptor() {
    if (document.getElementById('__tm_interceptor_script')) return;
    const script = document.createElement('script');
    script.id = '__tm_interceptor_script';
    script.src = chrome.runtime.getURL('src/interceptor/index.ts');
    (document.head || document.documentElement).appendChild(script);
  }

  // Sync rules to Main World via CustomEvent & window.postMessage & localStorage
  function syncVipRules(rules: Rule[], active: boolean) {
    const vipRules = rules.filter((r) => r.enabled && r.mode === 'vip');
    try {
      if (active && vipRules.length > 0) {
        localStorage.setItem('__tm_vip_rules', JSON.stringify({ active: true, rules: vipRules }));
      } else {
        localStorage.removeItem('__tm_vip_rules');
      }
      document.dispatchEvent(
        new CustomEvent('__TM_VIP_SYNC_EVENT__', { detail: { active, rules: vipRules } })
      );
    } catch {
      // Ignored
    }
    window.postMessage({ type: '__TM_VIP_SYNC', active, rules: vipRules }, '*');
    window.postMessage({ type: '__TM_VIP__', action: 'setRules', active, rules: vipRules }, '*');
  }

  // Listen for initial rules request from interceptor
  document.addEventListener('__TM_VIP_REQUEST_RULES__', () => {
    chrome.storage.local.get(['rules', 'vipActive'], (data) => {
      const active = !!data.vipActive;
      const rules: Rule[] = data.rules || [];
      syncVipRules(rules, active);
    });
  });

  // --------------------------------------------------------------------------
  // [1] CORE DOM TEXT REPLACEMENT ENGINE (TreeWalker)
  // --------------------------------------------------------------------------
  function replaceTextInNode(node: Node, rules: Rule[]): number {
    if (!node || rules.length === 0) return 0;
    let totalReplacements = 0;

    const walker = document.createTreeWalker(
      node,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (n) => {
          const parent = n.parentNode as HTMLElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes: Text[] = [];
    let current: Node | null;
    while ((current = walker.nextNode())) {
      textNodes.push(current as Text);
    }

    for (const textNode of textNodes) {
      let text = textNode.textContent || '';
      let changed = false;

      for (const rule of rules) {
        if (!rule.find || !rule.enabled) continue;

        // Check URL Filter if defined
        if (rule.urlFilter && rule.urlFilter.trim() !== '') {
          try {
            if (!new RegExp(rule.urlFilter).test(window.location.href)) continue;
          } catch {
            if (!window.location.href.includes(rule.urlFilter)) continue;
          }
        }

        // Check CSS selector scope if defined
        if (rule.selector && textNode.parentElement) {
          if (!textNode.parentElement.closest(rule.selector)) continue;
        }

        const isGlobal = rule.replaceAll !== false;
        const flags = (rule.caseSensitive ? '' : 'i') + (isGlobal ? 'g' : '');
        let pattern: RegExp;

        if (rule.useRegex) {
          try {
            pattern = new RegExp(rule.find, flags);
          } catch {
            continue;
          }
        } else {
          pattern = new RegExp(escapeRegex(rule.find), flags);
        }

        const matches = text.match(pattern);
        if (matches) {
          const matchCount = isGlobal ? matches.length : 1;
          totalReplacements += matchCount;
          text = text.replace(pattern, rule.replace ?? '');
          changed = true;

          // Notify background about stats
          chrome.runtime.sendMessage({
            action: 'updateStats',
            ruleId: rule.id,
            count: matchCount
          }).catch(() => { });
        }
      }

      if (changed) {
        isProcessing = true;
        textNode.textContent = text;

        if (isHighlightActive && textNode.parentElement) {
          textNode.parentElement.dataset.mpldHighlight = 'true';
          textNode.parentElement.style.outline = '2px dashed #22c55e';
          textNode.parentElement.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
        }

        isProcessing = false;
      }
    }

    return totalReplacements;
  }

  // Clear highlight styles when feature is toggled off
  function clearHighlights() {
    const elements = document.querySelectorAll('[data-mpld-highlight="true"]');
    elements.forEach((el) => {
      (el as HTMLElement).style.outline = '';
      (el as HTMLElement).style.backgroundColor = '';
      delete (el as HTMLElement).dataset.mpldHighlight;
    });
  }

  // --------------------------------------------------------------------------
  // [1.5] AGGRESSIVE SECOND PASS FOR DATA ELEMENTS (E-commerce / Tables)
  // --------------------------------------------------------------------------
  function replaceInDataElements(rules: Rule[]): number {
    if (!document.body || rules.length === 0) return 0;
    let totalReplacements = 0;

    const selectors = [
      'td[data-label]',
      'td[data-title]',
      'td[data-bind]',
      'span[data-bind]',
      'div[data-bind]',
      'td.monetary',
      'td.price',
      'span.price',
      '.cart-items td',
      'table td'
    ];

    const elements = document.querySelectorAll(selectors.join(','));

    for (const el of Array.from(elements)) {
      let text = el.textContent || '';
      let changed = false;

      for (const rule of rules) {
        if (!rule.find || !rule.enabled) continue;

        let pattern: RegExp;
        const isGlobal = rule.replaceAll !== false;
        const flags = (rule.caseSensitive ? '' : 'i') + (isGlobal ? 'g' : '');

        if (rule.useRegex) {
          try { pattern = new RegExp(rule.find, flags); } catch { continue; }
        } else {
          pattern = new RegExp(escapeRegex(rule.find), flags);
        }

        const matches = text.match(pattern);
        if (matches) {
          const matchCount = isGlobal ? matches.length : 1;
          totalReplacements += matchCount;
          text = text.replace(pattern, rule.replace ?? '');
          changed = true;

          chrome.runtime.sendMessage({
            action: 'updateStats',
            ruleId: rule.id,
            count: matchCount
          }).catch(() => { });
        }
      }

      if (changed) {
        isProcessing = true;
        if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
          el.childNodes[0].nodeValue = text;
        } else if (el.childNodes.length === 0) {
          el.textContent = text;
        } else {
          const innerWalker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let n: Node | null;
          while ((n = innerWalker.nextNode())) {
            let nodeText = n.nodeValue || '';
            for (const rule of rules) {
              if (!rule.find || !rule.enabled) continue;
              let p: RegExp;
              const isG = rule.replaceAll !== false;
              const f = (rule.caseSensitive ? '' : 'i') + (isG ? 'g' : '');
              if (rule.useRegex) {
                try { p = new RegExp(rule.find, f); } catch { continue; }
              } else {
                p = new RegExp(escapeRegex(rule.find), f);
              }
              nodeText = nodeText.replace(p, rule.replace ?? '');
            }
            n.nodeValue = nodeText;
          }
        }
        isProcessing = false;
      }
    }

    return totalReplacements;
  }

  // --------------------------------------------------------------------------
  // [2] POLLING & OBSERVER MANAGEMENT
  // --------------------------------------------------------------------------
  function startPolling(rules: Rule[], intervalMs = 500) {
    stopPolling();
    pollingTimer = window.setInterval(() => {
      if (document.body && rules.length > 0) {
        replaceTextInNode(document.body, rules);
        replaceInDataElements(rules);
      }
    }, intervalMs);
  }

  function stopPolling() {
    if (pollingTimer !== null) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  function applyRules(rules: Rule[], observe = true) {
    activeRules = rules;

    onDomReady(() => {
      replaceTextInNode(document.body, rules);
      replaceInDataElements(rules);

      // Progressive burst timer scans (200ms, 500ms, 1s, 2s, 3s, 4s, 5s) for async loads
      const burstDelays = [200, 500, 1000, 2000, 3000, 4000, 5000];
      for (const delay of burstDelays) {
        setTimeout(() => {
          if (activeRules.length > 0 && document.body) {
            replaceTextInNode(document.body, activeRules);
            replaceInDataElements(activeRules);
          }
        }, delay);
      }

      // Debounced MutationObserver (respects watchChanges setting)
      chrome.storage.local.get(['watchChanges'], (data) => {
        const shouldObserve = data.watchChanges !== false;
        if (observe && shouldObserve && !activeObserver && document.body) {
          let mutationTimer: number | null = null;
          activeObserver = new MutationObserver(() => {
            if (isProcessing) return;
            if (mutationTimer !== null) clearTimeout(mutationTimer);
            mutationTimer = window.setTimeout(() => {
              if (activeRules.length > 0 && document.body) {
                replaceTextInNode(document.body, activeRules);
                replaceInDataElements(activeRules);
              }
            }, 30);
          });

          activeObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
          });
        } else if (!shouldObserve && activeObserver) {
          activeObserver.disconnect();
          activeObserver = null;
        }
      });

      // Continuous polling check
      chrome.storage.local.get(['continuousMode', 'pollingInterval'], (data) => {
        if (data.continuousMode && rules.length > 0) {
          startPolling(rules, data.pollingInterval || 500);
        }
      });
    });

    chrome.storage.local.get(['vipActive'], (data) => {
      if (data.vipActive) {
        syncVipRules(rules, true);
      }
    });
  }

  function quickReplace(find: string, replace: string, options: { useRegex?: boolean; caseSensitive?: boolean; replaceAll?: boolean } = {}) {
    if (!document.body || !find) return 0;
    const rule: Rule = {
      id: 'quick-' + Date.now(),
      find,
      replace,
      useRegex: options.useRegex || false,
      caseSensitive: options.caseSensitive || false,
      enabled: true,
      createdAt: Date.now()
    };
    return replaceTextInNode(document.body, [rule]);
  }

  function fetchAndApplyRules() {
    chrome.storage.local.get(['rules', 'vipActive', 'highlightActive'], (data) => {
      if (data && Array.isArray(data.rules)) {
        activeRules = data.rules.filter((r: Rule) => r.enabled);
        applyRules(activeRules, true);
      }
      if (data && data.vipActive !== undefined) {
        syncVipRules(activeRules, !!data.vipActive);
      }
      if (data && data.highlightActive !== undefined) {
        isHighlightActive = !!data.highlightActive;
      }
    });
  }

  // --------------------------------------------------------------------------
  // [3] MESSAGE LISTENERS (IPC BRIDGE)
  // --------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'applyRules') {
      activeRules = message.rules || [];
      applyRules(activeRules, true);
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'countMatches') {
      if (!document.body || !message.find) {
        sendResponse({ count: 0 });
        return true;
      }
      const flags = message.options?.caseSensitive ? 'g' : 'gi';
      let pattern: RegExp;
      if (message.options?.useRegex) {
        try { pattern = new RegExp(message.find, flags); } catch { sendResponse({ count: 0 }); return true; }
      } else {
        pattern = new RegExp(escapeRegex(message.find), flags);
      }
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (n) => {
            const parent = n.parentNode as HTMLElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.tagName;
            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(tag)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );
      let total = 0;
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const matches = (node.textContent || '').match(pattern);
        if (matches) total += matches.length;
      }
      sendResponse({ count: total });
      return true;
    }

    if (message.action === 'quickReplace') {
      const count = quickReplace(message.find, message.replace, message.options);
      sendResponse({ success: true, replacements: count });
      return true;
    }

    if (message.action === 'startPolling') {
      startPolling(activeRules, message.interval || 500);
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'stopPolling') {
      stopPolling();
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'updateVipRules') {
      syncVipRules(message.rules || [], message.active || false);
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'stopObserver') {
      if (activeObserver) {
        activeObserver.disconnect();
        activeObserver = null;
      }
      stopPolling();
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'toggleHighlight') {
      isHighlightActive = !!message.active;
      if (!isHighlightActive) {
        clearHighlights();
      } else if (document.body && activeRules.length > 0) {
        replaceTextInNode(document.body, activeRules);
      }
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'ping') {
      sendResponse({ alive: true });
      return true;
    }
  });

  // Listen for direct storage changes
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.rules) {
          activeRules = (changes.rules.newValue || []).filter((r: Rule) => r.enabled);
          applyRules(activeRules, true);
        }
        if (changes.vipActive) {
          syncVipRules(activeRules, !!changes.vipActive.newValue);
        }
        if (changes.highlightActive) {
          isHighlightActive = !!changes.highlightActive.newValue;
          if (!isHighlightActive) clearHighlights();
        }
      }
    });
  }

  // Init Main World interceptor & fetch rules
  injectMainWorldInterceptor();
  fetchAndApplyRules();

  // Re-apply on full page load
  window.addEventListener('load', () => {
    if (activeRules.length > 0 && document.body) {
      setTimeout(() => {
        replaceTextInNode(document.body, activeRules);
        replaceInDataElements(activeRules);
      }, 300);
    }
  });
})();
