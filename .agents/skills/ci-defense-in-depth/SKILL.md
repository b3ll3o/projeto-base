---
name: ci-defense-in-depth
description: Skill para auditoria, manutenção e extensão do padrão defense-in-depth do CI (pre-push local + preflight CI + quality CI gated). Cobre criação de novos checks preflight, debug de drift estrutural e validação do pipeline em camadas. Use quando adicionar/alterar um check preflight, auditar a estratégia de CI ou debugar falhas estruturais detectadas em CI.
type: specialist
tools: Read, Glob, Grep, Bash, Write
---

# Skill: `ci-defense-in-depth`

## Papel

Mantém a estratégia **defense-in-depth** do CI: três camadas
independentes que detectam problemas em velocidades e custos diferentes.
A camada rápida detecta o problema perto do desenvolvedor; a camada
lenta só roda se as anteriores passaram. Falhas estruturais (drift de
tsconfig, config ESLint legada, cross-ref quebrada em docs) devem ser
pegas na camada 1 ou 2 — nunca esperar 4 minutos do `turbo run` para
descobrir.

## Quando usar

- Adicionar um novo check preflight (ex.: detectar `package.json` drift).
- Auditar a estratégia de CI defense-in-depth (revisão periódica).
- Debugar falha estrutural detectada em preflight (qual check falhou,
  em qual arquivo, com qual mensagem).
- Reativar um check que foi allowlist temporariamente.

## Quando NÃO usar

- Para bug de aplicação (use `feature-dev:code-reviewer` ou specialist).
- Para validar arquitetura DDD/Hexagonal (use `ddd-hexagonal-validation`).
- Para configurar/adicionar hook do harness (use
  `claude-md-management:revise-claude-md` ou settings.json).

## Inputs (do dispatch)

```yaml
preflight_root: ".tooling/scripts/ci"  # diretório dos checks
fail_fast: true                        # opcional; default true
mode: "local" | "ci"                   # local = pnpm ci:local; ci = workflow
```

## As 3 Camadas

| Camada              | Onde                          | Comando / Job                                  | Quando dispara            | Custo   |
|---------------------|-------------------------------|------------------------------------------------|----------------------------|---------|
| 1. Pre-push local   | máquina do dev                 | `pnpm ci:local`                                | antes de `git push`        | ~30s    |
| 2. Preflight CI     | workflow `ci.yml` job `preflight` | primeiro job da pipeline                    | em todo PR                 | ~10s    |
| 3. Quality CI       | workflow `ci.yml` job `quality` (gated por preflight) | após preflight verde | em todo PR                 | ~4min   |

**Invariantes**: (a) preflight deve falhar antes de quality; (b) quality
NUNCA duplica lógica de preflight — se já há check, não reimplementar
no `turbo run`; (c) pre-push local espelha exatamente o job `preflight`
de CI para evitar surpresas entre dev e CI.

## Padrão `CheckResult`

Toda função de check retorna o mesmo contrato, permitindo ao
orquestrador agregar erros uniformemente:

```typescript
// .tooling/scripts/ci/check-types.ts
export interface CheckResult {
  ok: boolean;
  errors: string[];
}
```

Uso mínimo: acumular mensagens em `errors` e derivar `ok` do length.

## Padrão TDD com fixtures herméticas

Cada check tem spec companion (`check-*.spec.ts`) que usa diretório
temporário isolado em vez de fixtures globais que possam vazar entre
testes:

```typescript
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkFoo } from './check-foo';

describe('checkFoo', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'preflight-foo-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('reports ok when no drift', async () => {
    await fs.writeFile(path.join(tmp, 'config.json'), '{"strict": true}');
    const result = await checkFoo({ root: tmp });
    expect(result.ok).toBe(true);
  });

  it('reports drift with file path', async () => {
    // red → green → refactor
  });
});
```

**Por que `fs.mkdtemp` e não fixtures em `__fixtures__`?** Isolamento:
dois testes paralelos não colidem; nenhum estado vaza para o
filesystem do repo; cleanup automático via `afterEach`.

## Padrão code-block-aware parsing

Markdown contém `[X](Y)` legítimo dentro de code blocks (TypeScript,
bash, regex). Parsing ingênuo gera falsos positivos. Use state machine
rastreando 3 estados: fora de fence, dentro de fence (``` ou ~~~),
dentro de indented code block (4+ espaços ou tab no início).

```typescript
let inFence = false;
let fenceMarker = '';
for (const line of lines) {
  const trimmed = line.trimStart();
  if (!inFence) {
    if (/^```/.test(trimmed) || /^~~~/.test(trimmed)) {
      inFence = true;
      fenceMarker = trimmed.slice(0, 3);
      continue; // linha de abertura descartada
    }
  } else {
    if (trimmed.startsWith(fenceMarker) && trimmed.replace(/[`~]/g, '') === '') {
      inFence = false; // linha de fechamento
      continue;
    }
    continue; // dentro do fence: descartar
  }
  if (/^( {4,}|\t)/.test(line)) continue; // indented code block
  filtered.push(line);
}
// Inline code spans `código` (após remover fences):
content = content.replace(/`[^`\n]+`/g, '');
```

Ver implementação canônica em `check-doc-refs.ts`.

## Comportamento

### Passo 1: ler orquestrador

```bash
cat .tooling/scripts/ci/preflight.ts
```

Entender quais checks rodam hoje, em que ordem, com quais parâmetros
(roots, allowlists, consistentKeys).

### Passo 2: ler check específico a estender

Antes de adicionar novo check, ler os existentes para reusar padrão:

```bash
ls .tooling/scripts/ci/check-*.ts
```

Cada check é função pura `async (opts) => CheckResult`. Pureza permite
TDD com fixtures herméticas e dry-run local.

### Passo 3: implementar via TDD

1. **Red**: escrever spec `check-foo.spec.ts` com caso de falha
   (fixture isolada em `fs.mkdtemp`).
2. **Green**: implementar `check-foo.ts` mais simples que faz o spec
   passar.
3. **Refactor**: extrair helpers compartilhados se aplicável; garantir
   cobertura ≥ 80% no spec.

### Passo 4: registrar no orquestrador

Editar `.tooling/scripts/ci/preflight.ts`:

```typescript
{
  name: 'descrição do check',
  fn: () => checkFoo({ root: 'path/to/scan' }),
},
```

Rodar `pnpm ci:local` para validar end-to-end. Se for check demorado,
movê-lo para sua própria camada antes de quality CI.

## Checks atualmente ativos

| Check                       | Função                          | Detecta                                              |
|-----------------------------|--------------------------------|------------------------------------------------------|
| `check-doc-refs`            | `check-doc-refs.ts`            | links relativos quebrados em `.md` (docs + specs)    |
| `check-tsconfig-drift`      | `check-tsconfig-drift.ts`      | drift de `strict`, `noUncheckedIndexedAccess` em tsconfigs |
| `check-eslint-drift`        | `check-eslint-drift.ts`        | `.eslintrc.*` legados remanescentes pós flat config  |
| `check-types`               | `check-types.ts`               | tipos compartilhados (`CheckResult`) — não roda      |

## Outputs

```yaml
checks:
  - name: "Cross-refs em docs"
    status: pass | fail
    errors: []
  - name: "tsconfig drift"
    status: fail
    errors:
      - "drift em 'strict': apps/api/tsconfig.json:strict=true, apps/web/tsconfig.json:strict=false"
total_errors: 1
exit_code: 0 | 1 | 2   # 2 = erro inesperado
```

## Coordenação com Outros Agents

| Agent                | Relação                                                       |
|----------------------|---------------------------------------------------------------|
| `monorepo-specialist`| audita turbo.json e tasks; preflight referencia turbo task    |
| `code-reviewer`      | recebe relato de drift para recomendar fix                    |
| `tdd-enforcer`       | bloqueia merge se check novo não tem spec companion            |
| `doc-sync`           | conserta cross-refs quebradas detectadas por `check-doc-refs` |

## Princípios

- **Velocidade**: preflight CI < 15s, pre-push < 60s.
- **Hermeticidade**: testes com `fs.mkdtemp`, sem fixtures globais.
- **Falha rápida**: primeira camada detecta antes de quality CI.
- **Idempotência**: rodar `pnpm ci:local` N vezes produz mesmo resultado.
- **Mensagens úteis**: erro inclui path relativo + motivo concreto.

## Anti-Padrões (NÃO fazer)

- Modificar código automaticamente (preflight só **reporta**; correção
  é tarefa do dev ou subagent especializado).
- Usar fixtures globais em `__fixtures__` (vazamento entre testes).
- Adicionar check sem spec companion (viola TDD mandatório).
- Duplicar lógica de preflight dentro de `turbo run` (quality CI).
- Allowlist sem comentário explicando a exceção e prazo de remoção.

## Referências Canônicas

- `.tooling/scripts/ci/preflight.ts` — orquestrador
- `.tooling/scripts/ci/check-doc-refs.ts` — cross-refs em markdown
- `.tooling/scripts/ci/check-tsconfig-drift.ts` — drift de tsconfig
- `.tooling/scripts/ci/check-eslint-drift.ts` — configs ESLint legadas
- `.tooling/scripts/ci/check-types.ts` — `CheckResult` interface
- `AGENTS.md §6` — convenções do template
- `.agents/specs/conventions/git-workflow.md §Pre-Push Quality Gate`
- `.agents/specs/conventions/cobertura-testes.md §CI Defense in Depth`
- `.agents/specs/conventions/ci-defense-in-depth.md`