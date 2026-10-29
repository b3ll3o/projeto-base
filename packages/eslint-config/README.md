# `@projeto/eslint-config`

> Configuração de ESLint compartilhada pelos workspaces do monorepo.
> Medido em **2026-10-29**: 1 flat config (`index.js`) + 1 regra própria
> (`rules/no-domain-imports-from-infra.js`).

## §1. O que é

Flat config (ESLint 9) exportada como array, consumida por `...baseConfig`
nos dois apps:

| Consumidor | Arquivo |
|---|---|
| Backend | `apps/api/eslint.config.mjs` |
| Frontend | `apps/web/eslint.config.mjs` |

```javascript
// apps/api/eslint.config.mjs
import baseConfig from '@projeto/eslint-config';

export default [...baseConfig, { rules: {} }, { ignores: ['dist/**', 'coverage/**'] }];
```

Cada app **estende** e acrescenta o que é seu (globals de browser, ignores de
`.next-e2e`, regra `no-empty-pattern` desligada no e2e do Playwright). O base
não sabe nada de frontend.

## §2. O que o `index.js` traz

| Bloco | Regra | Por quê |
|---|---|---|
| `js.configs.recommended` | recommended do ESLint | Base do JavaScript. |
| `tseslint.configs.recommended` | recommended do typescript-eslint | recommended do TypeScript. |
| `ddd-hexagonal/no-domain-imports-from-infra` | `error` | Pureza do domínio — ver §3. |
| `@typescript-eslint/no-unused-vars` | `error`, com `argsIgnorePattern: '^_'` | Parâmetro prefixado com `_` é **assinatura de override** (o `_metadata` de `PipeTransform.transform`), não código morto: o argumento precisa existir, só não é lido pelo corpo. |
| `ignores` | `**/dist/**`, `**/.next/**`, `**/coverage/**`, `**/node_modules/**` | Artefato gerado não é código. |

## §3. A regra própria — `rules/no-domain-imports-from-infra.js`

Bloqueia imports proibidos em arquivos sob uma pasta `domain/`. O domínio
precisa ser TypeScript puro: nada de framework, ORM ou I/O.

| Lista | Bloqueia |
|---|---|
| `FORBIDDEN` | `@nestjs/*`, `@prisma/*`, `prisma/*`, `class-validator`, `class-transformer`, `reflect-metadata`, `rxjs`, qualquer path com `/infrastructure/`, e qualquer `node:*`. |
| `PERMITIDOS_NODE` | `node:crypto` e `node:util` — os únicos liberados. A exceção é **por módulo**, não por extensão: um `.spec.ts` sob `domain/` que importe framework continua sendo erro. |

Três decisões que valem saber:

- **O prefixo `node:` é o que se bloqueia**, não cada builtin — travar cada
  `node:*` seria uma lista que envelhece a cada builtin novo, e antes os dois
  gates eram cegos a todos eles.
- **A lista é idêntica à `DDD_BLOCKED_IMPORTS` de
  `tooling/scripts/stack-code-reviewer.ts`**: são dois gates sobre o mesmo
  arquivo, e um gate mais permissivo que o outro anula o mais restritivo.
- **A liberação de `node:crypto`/`node:util` foi medida no disco**: são
  exatamente 2 imports `node:` sob `domain/` no repo — `user-id.vo.ts` (UUIDv7
  via entropia) e `password-hash.vo.spec.ts` (`inspect` para checar o
  `[redacted]`).

A regra reporta a mensagem `forbidden`:
*"Domain layer não pode importar de \"{{module}}\". Domain deve ser TypeScript puro."*

## §4. Scripts

| Script | Comando |
|---|---|
| `lint:self` | `eslint index.js rules/` — a config se linteria. |
| `test` | `echo "no tests yet (will be added in Task 4.x)" && exit 0` |

## §5. Regras de manutenção

- **A lista de imports proibidos tem uma fonte só.** Mudar `FORBIDDEN` aqui
  exige mudar `DDD_BLOCKED_IMPORTS` em `tooling/scripts/stack-code-reviewer.ts`
  no mesmo PR — os dois gates medem o mesmo arquivo, e divergirem é o defeito.
- **A regra só olha pasta `domain/`.** O predicado é `/[\\/]domain[\\/]/` no
  path do arquivo — não o `import` de um módulo chamado `domain`.

## §6. Ver mais

- Regra estrutural equivalente (backend): `tooling/scripts/stack-code-reviewer.ts`
- Arquitetura que a regra protege: [`.agents/specs/conventions/estrutura-e-versionamento.md`](../../.agents/specs/conventions/estrutura-e-versionamento.md)
- Configuração do frontend: `apps/web/eslint.config.mjs`
