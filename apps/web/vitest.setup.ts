// apps/web/vitest.setup.ts
//
// Setup global dos testes do frontend.
//
// pt-BR: carrega os matchers do `@testing-library/jest-dom`, que adicionam
// `toBeInTheDocument`, `toHaveValue`, `toHaveAccessibleName` etc. Sem eles
// um teste de DOM precisaria afirmar com `expect(el).not.toBeNull()` — o
// que perde justamente o que se quer checar ("o erro aparece PARA a pessoa
// que usa leitor de tela?", não "existe um nó com essa classe").
//
// Só importa DOM; nos specs `environment: 'node'` é inerte.

import '@testing-library/jest-dom/vitest';
