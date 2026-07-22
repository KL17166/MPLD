import { Rule } from '../types';

(() => {
  let activeRules: Rule[] = [];
  let isHighlightActive = false;
  let isProcessing = false;
  let observer: MutationObserver | null = null;

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Inject Main World Interceptor
  function injectMainWorldInterceptor() {
    if (document.getElementById('__tm_interceptor_script')) return;
    const script = document.createElement('script');
    script.id = '__tm_interceptor_script';
    script.src = chrome.runtime.getURL('src/interceptor/index.js');
    (document.head || document.documentElement).appendChild(script);
  }

  // Sync rules to Main World via window.postMessage & localStorage fallback
  function syncVipRules(rules: Rule[], active: boolean) {
    const vipRules = rules.filter(r => r.enabled);
    try {
      localStorage.setItem('__tm_vip_rules', JSON.stringify({ active, rules: vipRules }));
    } catch {
      // Ignored
    }
    window.postMessage({ type: '__TM_VIP_SYNC', active, rules: vipRules }, '*');
  }

  function applyDomReplacements(node: Node, rules: Rule[]): number {
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

        // Check CSS selector scope if defined
        if (rule.selector && textNode.parentElement) {
          if (!textNode.parentElement.closest(rule.selector)) continue;
        }

        const flags = rule.caseSensitive ? 'g' : 'gi';
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
          totalReplacements += matches.length;
          text = text.replace(pattern, rule.replace ?? '');
          changed = true;

          // Notify background about stats
          chrome.runtime.sendMessage({
            action: 'updateStats',
            ruleId: rule.id,
            count: matches.length
          }).catch(() => { });
        }
      }

      if (changed) {
        isProcessing = true;
        textNode.textContent = text;

        if (isHighlightActive && textNode.parentElement) {
          textNode.parentElement.style.outline = '2px dashed #22c55e';
          textNode.parentElement.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
        }

        isProcessing = false;
      }
    }

    return totalReplacements;
  }

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      if (isProcessing) return;
      for (const mutation of mutations) {
        for (const addedNode of Array.from(mutation.addedNodes)) {
          applyDomReplacements(addedNode, activeRules);
        }
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function fetchAndApplyRules() {
    chrome.runtime.sendMessage({ action: 'getRules' }, (response) => {
      if (response && Array.isArray(response.rules)) {
        activeRules = response.rules.filter((r: Rule) => r.enabled);
        applyDomReplacements(document.body, activeRules);
        startObserver();
      }
    });

    chrome.runtime.sendMessage({ action: 'getVipStatus' }, (res) => {
      if (res) syncVipRules(activeRules, !!res.vipActive);
    });

    chrome.runtime.sendMessage({ action: 'getHighlightStatus' }, (res) => {
      if (res) isHighlightActive = !!res.highlightActive;
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'applyRules') {
      activeRules = message.rules || [];
      const count = applyDomReplacements(document.body, activeRules);
      sendResponse({ count });
      return true;
    }

    if (message.action === 'toggleHighlight') {
      isHighlightActive = !!message.active;
      sendResponse({ success: true });
      return true;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectMainWorldInterceptor();
      fetchAndApplyRules();
    });
  } else {
    injectMainWorldInterceptor();
    fetchAndApplyRules();
  }
})();
