(() => {
  'use strict';

  interface VipRuleItem {
    id: string;
    find: string;
    replace: string;
    useRegex: boolean;
    caseSensitive: boolean;
    enabled: boolean;
    urlFilter?: string;
  }

  let vipRules: VipRuleItem[] = [];
  let vipActive = false;

  // Sync load from localStorage on 1st script execution (before React/Vue/Angular init)
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

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function applyRules(text: string): string {
    if (!text || typeof text !== 'string' || vipRules.length === 0 || !vipActive) return text;

    let result = text;
    let totalMatches = 0;

    for (const rule of vipRules) {
      if (!rule.find || !rule.enabled) continue;

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

      const matches = result.match(pattern);
      if (matches) {
        totalMatches += matches.length;
        result = result.replace(pattern, rule.replace ?? '');
      }
    }

    if (totalMatches > 0) {
      console.log(
        `%c[MPLD VIP]%c Interceptou e alterou ${totalMatches} ocorrência(s) de API`,
        'background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
        'color: #f59e0b;'
      );
    }

    return result;
  }

  // 1. Monkey-Patch: JSON.parse
  const origJSONParse = JSON.parse;
  JSON.parse = function (text: string, reviver?: (key: string, value: unknown) => unknown) {
    if (vipActive && vipRules.length > 0 && typeof text === 'string') {
      const modified = applyRules(text);
      return origJSONParse.call(this, modified, reviver);
    }
    return origJSONParse.call(this, text, reviver);
  };

  // 2. Monkey-Patch: XMLHttpRequest
  const XHR = XMLHttpRequest.prototype;
  const origResponseTextDesc = Object.getOwnPropertyDescriptor(XHR, 'responseText');
  const origResponseDesc = Object.getOwnPropertyDescriptor(XHR, 'response');
  const xhrCache = new WeakMap<XMLHttpRequest, { text: string; type: string }>();

  function getModifiedXhr(xhr: XMLHttpRequest) {
    if (!vipActive || vipRules.length === 0 || xhr.readyState !== 4) return null;

    let cached = xhrCache.get(xhr);
    if (cached) return cached;

    const rt = xhr.responseType;

    if (!rt || (rt as string) === '' || rt === 'text') {
      try {
        const original = origResponseTextDesc?.get?.call(xhr);
        if (original && typeof original === 'string') {
          const modified = applyRules(original);
          if (modified !== original) {
            cached = { text: modified, type: 'text' };
            xhrCache.set(xhr, cached);
            return cached;
          }
        }
      } catch {
        // Ignored
      }
    }

    return null;
  }

  if (origResponseTextDesc && origResponseTextDesc.get) {
    Object.defineProperty(XHR, 'responseText', {
      get: function () {
        const cached = getModifiedXhr(this);
        if (cached && cached.type === 'text') return cached.text;
        return origResponseTextDesc.get!.call(this);
      },
      configurable: true,
      enumerable: true
    });
  }

  if (origResponseDesc && origResponseDesc.get) {
    Object.defineProperty(XHR, 'response', {
      get: function () {
        const cached = getModifiedXhr(this);
        if (cached && cached.type === 'text') return cached.text;
        return origResponseDesc.get!.call(this);
      },
      configurable: true,
      enumerable: true
    });
  }

  // 3. Monkey-Patch: window.fetch
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const result = origFetch.apply(this, args);
    if (!vipActive || vipRules.length === 0) return result;

    return result.then(async (response) => {
      if (!vipActive || vipRules.length === 0) return response;

      const ct = response.headers.get('content-type') || '';
      const isText = ct.includes('text') || ct.includes('json') ||
                     ct.includes('javascript') || ct.includes('xml') ||
                     ct.includes('html') || ct.includes('form');

      if (!isText) return response;

      try {
        const originalBody = await response.clone().text();
        const modifiedBody = applyRules(originalBody);

        if (modifiedBody === originalBody) return response;

        const newResponse = new Response(modifiedBody, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });

        Object.defineProperties(newResponse, {
          url: { value: response.url },
          type: { value: response.type },
          ok: { value: response.ok },
          redirected: { value: response.redirected }
        });

        return newResponse;
      } catch {
        return response;
      }
    }).catch(() => result);
  };

  // 4. Runtime Message Listener
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data && (event.data.type === '__TM_VIP_SYNC' || event.data.type === '__TM_VIP__')) {
      vipActive = !!event.data.active;
      vipRules = Array.isArray(event.data.rules) ? event.data.rules : [];

      try {
        if (vipActive && vipRules.length > 0) {
          localStorage.setItem('__tm_vip_rules', JSON.stringify({ active: true, rules: vipRules }));
        } else {
          localStorage.removeItem('__tm_vip_rules');
        }
      } catch {
        // Ignored
      }
    }
  });

  // @ts-expect-error Global marker
  window.__textManipulatorVIP = true;
})();
