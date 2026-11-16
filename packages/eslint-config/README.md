# `@projeto/eslint-config`

> Configuração de ESLint compartilhada pelos workspaces do monorepo.
> Medido em **2026-11-16**: 1 flat config exportada (`index.js`) + 2 regras
> próprias (`rules/no-domain-imports-from-infra.js` e
> `rules/no-estilizacao-informal.js`, com o `.d.ts` ao lado).

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

⚠️ **A 2ª regra (a de estilização) NÃO está no `index.js`** — ela é registrada
pelo próprio app que a usa (ver §3.2). O base compartilhado é lido pelos dois
apps, e o backend não tem classe para medir.

## §2. O que o `index.js` traz

| Bloco | Regra | Por quê |
|---|---|---|
| `js.configs.recommended` | recommended do ESLint | Base do JavaScript. |
| `tseslint.configs.recommended` | recommended do typescript-eslint | recommended do TypeScript. |
| `ddd-hexagonal/no-domain-imports-from-infra` | `error` | Pureza do domínio — ver §3.1. |
| `@typescript-eslint/no-unused-vars` | `error`, com `argsIgnorePattern: '^_'` | Parâmetro prefixado com `_` é **assinatura de override** (o `_metadata` de `PipeTransform.transform`), não código morto: o argumento precisa existir, só não é lido pelo corpo. |
| `ignores` | `**/dist/**`, `**/.next/**`, `**/coverage/**`, `**/node_modules/**` | Artefato gerado não é código. |

## §3. As regras próprias

Duas regras, com propósitos e registros diferentes.

### §3.1 `rules/no-domain-imports-from-infra.js` — a do backend

Bloqueia imports proibidos em arquivos sob uma pasta `domain/`. O domínio
precisa ser TypeScript puro: nada de framework, ORM ou I/O. É a única regra
registrada no `index.js` (o backend é o app que tem `domain/`).

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

### §3.2 `rules/no-estilizacao-informal.js` — a do frontend

O instrumento do padrão de estilização do template. O padrão está em
[`.agents/specs/conventions/estilizacao.md`](../../.agents/specs/conventions/estilizacao.md);
o DONO dos valores de token é o bloco `@theme` de `apps/web/app/globals.css`.

**O que ela mede** — 5 proibições:

| Eixo | Mede | Detalhe |
|---|---|---|
| Cor | paleta stock do Tailwind (`text-slate-900`, `bg-red-50`, `border-slate-300`) e valor literal (`bg-[#fff]`) | com variante, lado e opacidade (`hover:bg-slate-700`, `border-t-slate-200`, `bg-slate-900/50` contam) |
| Raio | qualquer raio fora de `rounded-md` | `rounded-t-md` e os outros lados são o mesmo raio e passam; `rounded-none` é a escolha de não arredondar |
| Sombra | sombra em repouso | as 3 famílias — `shadow`, `drop-shadow` e `inset-shadow` — e a sombra literal (`shadow-[…]`) |
| Anel de foco | `foco` junto de `transition-colors` | `transition-colors` transiciona `outline-color` também, e o anel do padrão é `outline`: ele passava a SURGIR em 150ms |
| Foco sem substituto | `outline-none` sem o utilitário `foco` na MESMA class string | apagar o anel do browser sem devolvê-lo deixa a tela com dois sistemas de foco |

**O que ela NÃO mede** (e é humano): hierarquia tipográfica, espaçamento, se
o token citado existe, e o contraste — ela mede a FORMA da classe, não a
coerência. E **não vê classe montada em runtime** (concatenação de variável),
por isso as primitivas são a ÚNICA fonte de classe do app.

**O que ela lê:** a classe que está no JSX (literal, template, ternário, `||`
e argumento de helper) **e o VALOR das constantes de classe**, resolvido por
escopo dentro do arquivo — e NÃO pelo nome. As 4 primitivas que guardam a
classe em `const base` são lidas por isso; um RENAME da constante não abre o
furo. A leitura pelo NOME (`CLASSE_*`, `CLASSES_*`) continua valendo para a
constante IMPORTADA de outro arquivo, onde a referência não é resolvível.

**A exceção:** `eslint-disable-next-line` funciona, como em toda regra — e o
único uso legítimo é **elemento que flutua de verdade** (menu, dialog,
popover), o único caso em que sombra entra no sistema.

**COMO ela é registrada:** no `apps/web/eslint.config.mjs`, e **não** no
`index.js` deste pacote — porque é o único app do repo com Tailwind, e o
backend não tem classe para medir. O app importa a regra pelo caminho
`@projeto/eslint-config/rules/no-estilizacao-informal.js` e a registra como
plugin `estilizacao` com severidade `error`.

O `.d.ts` ao lado da regra existe porque `apps/web/tsconfig.json` declara
`allowJs: false` — sem ele, um spec em TypeScript que importe a regra não
compila (`TS7016`).

## §4. Scripts

| Script | Comando |
|---|---|
| `lint` | `eslint .` — a config se linteria, com o flat config do próprio pacote (`packages/eslint-config/eslint.config.mjs`). Rode com `pnpm --filter @projeto/eslint-config lint` ou `pnpm turbo run lint`. |
| `test` | `echo "no tests yet (will be added in Task 4.x)" && exit 0` |

⚠️ O `lint:self` (`eslint index.js rules/`) foi **SUBSTITUÍDO**: sem um
`eslint.config.*` no pacote ele saía com exit 2 ("couldn't find an
eslint.config.* file"), e **nenhum job chamava o pacote** — o `turbo run lint`
do CI só executa o script `lint` dos workspaces, e este não tinha um.

## §5. Regras de manutenção

- **A lista de imports proibidos tem uma fonte só.** Mudar `FORBIDDEN` aqui
  exige mudar `DDD_BLOCKED_IMPORTS` em `tooling/scripts/stack-code-reviewer.ts`
  no mesmo PR — os dois gates medem o mesmo arquivo, e divergirem é o defeito.
- **A regra só olha pasta `domain/`.** O predicado é `/[\\/]domain[\\/]/` no
  path do arquivo — não o `import` de um módulo chamado `domain`.
- **A regra de estilo se muda com a convenção, no mesmo PR.** As proibições que
  ela mede são as da §4.3 de `estilizacao.md` — mudar uma sem a outra abre um
  furo silencioso.

## §6. Ver mais

- Regra estrutural equivalente (backend): `tooling/scripts/stack-code-reviewer.ts`
- Arquitetura que a regra protege: [`.agents/specs/conventions/estrutura-e-versionamento.md`](../../.agents/specs/conventions/estrutura-e-versionamento.md)
- Padrão que a regra de estilo obriga: [`.agents/specs/conventions/estilizacao.md`](../../.agents/specs/conventions/estilizacao.md)
- Configuração do frontend: `apps/web/eslint.config.mjs`
