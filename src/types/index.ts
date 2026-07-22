export interface Rule {
  id: string;
  name?: string;
  find: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
  replaceAll?: boolean;
  enabled: boolean;
  urlFilter?: string; // Glob or substring filter for host/URL
  selector?: string;  // CSS selector scoping (e.g., "p.comment-text", "h1")
  category?: 'custom' | 'spoiler' | 'currency' | 'mock' | 'security';
  createdAt: number;
}

export interface VipRule {
  id: string;
  find: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
  enabled: boolean;
  urlFilter?: string;
}

export interface ProxyConfig {
  enabled: boolean;
  host: string;
  port: number;
  mode: 'fixed_servers' | 'direct' | 'system';
  bypassList: string[];
}

export interface StorageData {
  rules: Rule[];
  vipRules: VipRule[];
  vipActive: boolean;
  autoApply: boolean;
  highlightActive: boolean;
  proxyConfig: ProxyConfig;
  stats: Record<string, number>;
  history: Array<{
    timestamp: number;
    find: string;
    replace: string;
    count: number;
    url: string;
  }>;
}

export type MessageAction =
  | { action: 'openPanel' }
  | { action: 'applyRulesToTab'; tabId: number }
  | { action: 'applyRules'; rules: Rule[] }
  | { action: 'getRules' }
  | { action: 'saveRules'; rules: Rule[] }
  | { action: 'getVipStatus' }
  | { action: 'setVipStatus'; vipActive: boolean }
  | { action: 'getHighlightStatus' }
  | { action: 'setHighlightStatus'; highlightActive: boolean }
  | { action: 'getStats' }
  | { action: 'updateStats'; ruleId: string; count: number }
  | { action: 'getProxyConfig' }
  | { action: 'setProxyConfig'; config: ProxyConfig }
  | { action: 'toggleHighlight'; active: boolean };
