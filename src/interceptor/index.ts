(() => {
  'use strict';

  interface VipRuleItem {
    id: string;
    find: string;
    replace: string;
    useRegex: boolean;
    caseSensitive: boolean;
    enabled: boolean;
  }

  let vipRules: VipRuleItem[] = [];
  let vipActive = false;

  function loadStorageRules() {
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
  }

  loadStorageRules();

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
        `%c🛡️ MPLD VIP%c Interceptou e alterou ${totalMatches} ocorrência(s) de API`,
        'background: #16a34a; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
        'color: #16a34a;'
      );
    }

    return result;
  }

  // 1. Hook JSON.parse
  const origJSONParse = JSON.parse;
  JSON.parse = function (text: string, reviver?: (key: string, value: unknown) => unknown) {
    if (vipActive && vipRules.length > 0 && typeof text === 'string') {
      const modified = applyRules(text);
      return origJSONParse.call(this, modified, reviver);
    }
    return origJSONParse.call(this, text, reviver);
  };

  // 2. Hook Fetch API
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await origFetch.apply(this, args);
    if (!vipActive || vipRules.length === 0) return response;

    const clone = response.clone();
    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json') || contentType.includes('text/')) {
        const originalText = await clone.text();
        const modifiedText = applyRules(originalText);

        if (originalText !== modifiedText) {
          return new Response(modifiedText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        }
      }
    } catch {
      // Fallback to original response on error
    }

    return response;
  };

  // 3. Hook XMLHttpRequest
  const origXHR = window.XMLHttpRequest.prototype.open;
  const origSend = window.XMLHttpRequest.prototype.send;

  window.XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    (this as unknown as { _tm_url?: string })._tm_url = String(url);
    // @ts-expect-error Safe signature wrapper
    return origXHR.apply(this, [method, url, ...rest]);
  };

  window.XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    if (vipActive && vipRules.length > 0) {
      this.addEventListener('readystatechange', () => {
        if (this.readyState === 4 && this.responseText) {
          try {
            const modified = applyRules(this.responseText);
            if (modified !== this.responseText) {
              Object.defineProperty(this, 'responseText', {
                writable: true,
                value: modified
              });
              Object.defineProperty(this, 'response', {
                writable: true,
                value: modified
              });
            }
          } catch {
            // Ignored
          }
        }
      });
    }
    return origSend.call(this, body);
  };

  // Sync update messages from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data && event.data.type === '__TM_VIP_SYNC') {
      vipActive = !!event.data.active;
      vipRules = Array.isArray(event.data.rules) ? event.data.rules : [];
    }
  });
})();
