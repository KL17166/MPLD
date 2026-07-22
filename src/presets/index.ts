import { Rule } from '../types';

export const PRESET_RULES: Omit<Rule, 'id' | 'createdAt'>[] = [
  {
    name: 'Ocultar Valores em Reais (R$)',
    find: 'R$\\s*\\d+([.,]\\d+)?',
    replace: 'R$ ***,**',
    useRegex: true,
    caseSensitive: false,
    enabled: false,
    category: 'security'
  },
  {
    name: 'Censura de E-mails',
    find: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    replace: '[EMAIL CENSURADO]',
    useRegex: true,
    caseSensitive: false,
    enabled: false,
    category: 'security'
  },
  {
    name: 'Censura de CPFs',
    find: '\\b\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}\\b',
    replace: '***.***.***-**',
    useRegex: true,
    caseSensitive: false,
    enabled: false,
    category: 'security'
  },
  {
    name: 'Filtro Anti-Spoiler: Marvel/Cinema',
    find: '(Spoiler|Morre|Derrotado|Vence no final|Final secreto)',
    replace: '[SPOILER REMOVIDO]',
    useRegex: true,
    caseSensitive: false,
    enabled: false,
    category: 'spoiler'
  },
  {
    name: 'Mock Data: Nomes Aleatórios',
    find: '\\b(João Silva|Maria Santos)\\b',
    replace: 'Usuário de Teste',
    useRegex: true,
    caseSensitive: false,
    enabled: false,
    category: 'mock'
  }
];
