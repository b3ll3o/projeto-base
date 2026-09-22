# MONOREPO.md — Convenções de Monorepo

> Documento canônico de **convenções estruturais** do monorepo. Define layout de pastas, regras de isolamento entre apps, dependências compartilhadas e versionamento.
> Esta configuração é gerenciada pelo agent [`monorepo-specialist`](../.agents/agents/monorepo-specialist.md).

---

## §1. Layout Canônico

```text
.
├── apps/                           # Aplicações deployables
│   ├── api/                        # Backend NestJS
│   └── web/                        # Frontend Next.js
├── packages/                       # Bibliotecas internas (versionadas)
│   ├── shared-types/               # Tipos compartilhados front↔back
│   ├── ui/                         # Componentes UI compartilhados
│   ├── tsconfig/                   # tsconfig.base.json
│   └── eslint-config/              # Regras ESLint compartilhadas
├── tooling/                        # Configs e scripts do monorepo
│   └── scripts/
├── infra/                          # Docker Compose, migrations, seeds
│   ├── docker-compose.yml
│   └── postgres/
├── docs/                           # Documentação
├── .agents/                        # Agents, skills, workflows
├── AGENTS.md                       # Spec canônica do padrão
├── README.md
├── pnpm-workspace.yaml             # Declaração dos workspaces
├── turbo.json                      # Pipeline de build/test/lint
├── tsconfig.base.json              # TS config base (path aliases)
├── package.json                    # Scripts orquestrados
└── .markdownlint.json
```

## §2. Regra de Ouro — Apps Isolados

> **Um app NUNCA importa diretamente de outro app.**

Comunicação entre apps:

- ✅ Via HTTP/REST (ou GraphQL, fila)
- ✅ Via `packages/shared-types` (tipos de contrato)
- ❌ `import { UserService } from '../../api/src/users/user.service'` — **PROIBIDO**

Quando precisar compartilhar código entre apps:

1. Identificar o que é compartilhável (tipos, utils, componentes)
2. Criar/mover para `packages/<nome>`
3. Adicionar como dependência via `workspace:*`
4. Versionar via Changesets

## §3. Dependências

### 3.1 Internas (packages)

```jsonc
// package.json (apps/api)
{
  "dependencies": {
    "@projeto/shared-types": "workspace:*"   // SEMPRE workspace protocol
  }
}
```

### 3.2 Externas (npm)

```jsonc
// package.json (root — para deps compartilhadas)
{
  "devDependencies": {
    "typescript": "^5.4.0",
    "eslint": "^9.0.0"
  }
}

// package.json (apps/api — para deps específicas)
{
  "dependencies": {
    "@nestjs/core": "^11.0.0",    // NestJS apenas no backend
    "prisma": "^6.0.0"
  }
}
```

### 3.3 Regras

- ✅ Deps compartilhadas no **root** (TS, ESLint, Prettier)
- ✅ Deps específicas no **app/package** que as usa
- ✅ `workspace:*` para packages internos
- ❌ Versão fixa (`"1.2.3"`) — usar caret (`"^1.2.3"`) para permitir patches
- ❌ Deps duplicadas (mesmo pacote, versões diferentes) — resolver via `pnpm dedupe`

## §4. Path Aliases

Centralizados em `tsconfig.base.json` (no root):

```jsonc
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@projeto/shared-types": ["./packages/shared-types/src"],
      "@projeto/ui": ["./packages/ui/src"]
    }
  }
}
```

Cada app/package estende `tsconfig.base.json` e adiciona seus próprios aliases.

## §5. Turborepo — Pipelines

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**Convenção:**

- Toda tarefa declara `outputs` (o que cachear) ou `cache: false` (o que nunca cachear)
- `dependsOn: ["^build"]` garante ordem topológica
- `dev` é `cache: false, persistent: true` (watch mode)

## §6. Versionamento com Changesets

```bash
# Após uma mudança em packages/
pnpm changeset           # Cria .changeset/<branch>-<desc>.md

# Ao preparar release
pnpm version             # Aplica versões + gera CHANGELOG.md
pnpm release             # Publica packages modificados
```

Cada mudança em `packages/` DEVE vir acompanhada de `.changeset/`.

## §7. Scripts Canônicos (Root)

| Script | Comando | Função |
|--------|---------|--------|
| `pnpm dev` | `turbo run dev` | Sobe todos os apps em watch |
| `pnpm build` | `turbo run build` | Build de tudo (com cache) |
| `pnpm test` | `turbo run test` | Roda testes de tudo |
| `pnpm lint` | `turbo run lint` | ESLint em tudo |
| `pnpm typecheck` | `turbo run typecheck` | tsc --noEmit em tudo |
| `pnpm format` | `prettier --write .` | Formata código |
| `pnpm clean` | `turbo run clean && rm -rf node_modules` | Limpa cache e deps |

## §8. Isolamento por App

Cada app tem seu próprio:

- `package.json` (deps específicas)
- `tsconfig.json` (extends base)
- `eslint.config.js` (extends base)
- `Dockerfile` (para deploy)
- `.env.example` (variáveis esperadas)

Apps NÃO compartilham:

- ❌ `src/` — código de aplicação é isolado
- ❌ `node_modules/` — pnpm gerencia isso (hoisting no root)
- ❌ Configurações runtime (.env, logs)

## §9. Quando Adicionar um App

```text
1. Criar pasta apps/<nome>
2. Adicionar tsconfig.json, eslint.config.js, package.json
3. Adicionar ao pnpm-workspace.yaml (globs)
4. Adicionar pipeline ao turbo.json (se tarefas específicas)
5. Criar Dockerfile (se for deployable)
6. Documentar em README.md do app
7. Despachar monorepo-specialist → code-reviewer
```

## §10. Quando Adicionar um Package

```text
1. Criar pasta packages/<nome>
2. Adicionar tsconfig.json, package.json (com exports map)
3. Adicionar ao pnpm-workspace.yaml (já coberto se for "packages/*")
4. Adicionar path alias em tsconfig.base.json
5. Criar .changeset/ descrevendo a mudança
6. Despachar monorepo-specialist → code-reviewer
```

## §11. Estrutura Obrigatória por App (DDD/Hexagonal)

> **Regra canônica** (a partir de `v1.2.0`): apps backend adotam **DDD + Hexagonal (Ports & Adapters)** como paradigma arquitetural obrigatório. Decisão justificada no [ADR-0001 — DDD + Hexagonal + Auditoria](./adr/0001-arquitetura-ddd-hexagonal-auditoria.md).

### Layout canônico de módulo

```text
apps/api/src/modules/<feature>/
├── domain/          # TypeScript puro — entidades, VOs, eventos de domínio
├── application/     # Use cases + ports (interfaces) — depende só de domain
└── infrastructure/  # http/, persistence/, adapters — implementa ports
```

Cada app backend **DEVE** organizar cada feature como módulo com as três camadas acima. Shared concerns (auditoria, validação, infra HTTP) ficam em `apps/<app>/src/shared/{audit,domain,infrastructure}/`.

### Constraint de dependência entre camadas

```text
domain         ─→ (nada além de typescript padrão)
  ↑
application    ─→ domain + ports próprias
  ↑
infrastructure ─→ application + domain + libs externas (NestJS, Prisma)
```

- ❌ `domain/` **nunca** importa `@nestjs/*`, `@prisma/*`, `class-validator`, `reflect-metadata`, `rxjs`.
- ❌ `application/` **nunca** importa de `infrastructure/`.
- ✅ O fluxo inverso (camadas externas → internas) é livre.
- ✅ `infrastructure/http/` implementa os ports definidos em `application/ports/`.

### Guardiões

- Agent `stack-code-reviewer` (D11 — pre-commit + CI) com lens DDD/Hexagonal
- Skill [`.agents/skills/ddd-hexagonal-validation/SKILL.md`](../.agents/skills/ddd-hexagonal-validation/SKILL.md) — checklist automatizado

Referência cruzada: [`.agents/specs/conventions/estrutura-e-versionamento.md`](../.agents/specs/conventions/estrutura-e-versionamento.md) e [`docs/STACK.md` §8](./STACK.md).

---

**Mantido por:** projeto-base contributors
**Versão do documento:** 1.4.0

### Histórico de Versões

| Versão | Mudanças |
|--------|----------|
| `1.0.0` | Lançamento inicial |
| `1.1.0` | Adicionados 3 specialists de stack + workflows detalhados |
| `1.2.0` | §11 — Estrutura obrigatória DDD/Hexagonal por app (ADR-0001) |
| `1.3.0` | §11 — Referência à skill `ddd-hexagonal-validation` (validador automatizado de boundaries) validada em BC `users` end-to-end |
| `1.4.0` | §Defense in Depth — referência ao padrão de 3 camadas (`ci-defense-in-depth` skill + convenção) e à estratégia de auditoria `ci-defense-mode` / release-mode workflows |
