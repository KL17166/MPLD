import test from 'node:test';
import assert from 'node:assert/strict';

// --------------------------------------------------------------------------
// 1. TEST DOM / TEXT REPLACEMENT ENGINE (Logic Unit Tests)
// --------------------------------------------------------------------------
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyDomRules(text, rules) {
  let result = text;
  for (const rule of rules) {
    if (!rule.find || !rule.enabled) continue;

    const isGlobal = rule.replaceAll !== false;
    const flags = (rule.caseSensitive ? '' : 'i') + (isGlobal ? 'g' : '');
    let pattern;

    if (rule.useRegex) {
      try {
        pattern = new RegExp(rule.find, flags);
      } catch {
        continue;
      }
    } else {
      pattern = new RegExp(escapeRegex(rule.find), flags);
    }

    result = result.replace(pattern, rule.replace ?? '');
  }
  return result;
}

test('DOM Engine: replaceAll === true replaces ALL occurrences', () => {
  const rules = [{
    id: '1',
    find: 'teste',
    replace: 'OK',
    useRegex: false,
    caseSensitive: false,
    replaceAll: true,
    enabled: true
  }];

  const input = 'teste de teste e outro teste';
  const output = applyDomRules(input, rules);
  assert.equal(output, 'OK de OK e outro OK');
});

test('DOM Engine: replaceAll === false replaces ONLY FIRST occurrence', () => {
  const rules = [{
    id: '1',
    find: 'teste',
    replace: 'OK',
    useRegex: false,
    caseSensitive: false,
    replaceAll: false,
    enabled: true
  }];

  const input = 'teste de teste e outro teste';
  const output = applyDomRules(input, rules);
  assert.equal(output, 'OK de teste e outro teste');
});

test('DOM Engine: caseSensitive respect', () => {
  const rules = [{
    id: '1',
    find: 'Teste',
    replace: 'OK',
    useRegex: false,
    caseSensitive: true,
    replaceAll: true,
    enabled: true
  }];

  const input = 'teste Teste TESTE';
  const output = applyDomRules(input, rules);
  assert.equal(output, 'teste OK TESTE');
});

test('DOM Engine: regex replacement', () => {
  const rules = [{
    id: '1',
    find: 'R\\$\\s*\\d+',
    replace: 'R$ 0',
    useRegex: true,
    caseSensitive: false,
    replaceAll: true,
    enabled: true
  }];

  const input = 'Saldo: R$ 1000 e Cheque: R$ 500';
  const output = applyDomRules(input, rules);
  assert.equal(output, 'Saldo: R$ 0 e Cheque: R$ 0');
});

// --------------------------------------------------------------------------
// 2. TEST VIP INTERCEPTOR ENGINE LOGIC
// --------------------------------------------------------------------------
function applyVipRules(text, rules) {
  let result = text;
  for (const rule of rules) {
    if (!rule.find || !rule.enabled) continue;

    const isGlobal = rule.replaceAll !== false;
    const flags = (rule.caseSensitive ? '' : 'i') + (isGlobal ? 'g' : '');
    let pattern;

    if (rule.useRegex) {
      try {
        pattern = new RegExp(rule.find, flags);
      } catch {
        continue;
      }
    } else {
      pattern = new RegExp(escapeRegex(rule.find), flags);
    }

    result = result.replace(pattern, rule.replace ?? '');
  }
  return result;
}

test('VIP Interceptor: JSON payload manipulation with single replacement', () => {
  const rules = [{
    id: 'vip-1',
    find: '10.000,00',
    replace: '999.999,00',
    useRegex: false,
    caseSensitive: false,
    replaceAll: false,
    enabled: true
  }];

  const jsonPayload = JSON.stringify({ saldo: '10.000,00', poupanca: '10.000,00' });
  const modifiedJson = applyVipRules(jsonPayload, rules);
  const parsed = JSON.parse(modifiedJson);

  assert.equal(parsed.saldo, '999.999,00');
  assert.equal(parsed.poupanca, '10.000,00'); // Second occurrence untouched due to replaceAll === false
});

// --------------------------------------------------------------------------
// 3. TEST REGEX SYNTAX VALIDATION
// --------------------------------------------------------------------------
function checkRegexError(pattern, caseSensitive) {
  if (!pattern) return null;
  try {
    new RegExp(pattern, caseSensitive ? 'g' : 'gi');
    return null;
  } catch (err) {
    return err.message;
  }
}

test('Regex Validation: valid regex returns null', () => {
  assert.equal(checkRegexError('^[a-z]+$', false), null);
});

test('Regex Validation: invalid regex returns error message', () => {
  const err = checkRegexError('([a-z', false);
  assert.ok(err !== null);
  assert.match(err, /Invalid regular expression/i);
});
