---
name: ux-design-specialist-memory
description: Memória acumulada do agent ux-design-specialist — decisões sobre criação do agent, tokens do frontend, estados de tela e os defeitos de runtime encontrados no apps/web e apps/api durante a criação da tela de cadastro de usuário
---

# Memória: `ux-design-specialist`

> Arquivo de memória do agent `ux-design-specialist`. Atualizado após cada execução significativa. **Limite 300 linhas** (`tamanho-e-revisao.md`).

## Decisões Tomadas

### 2026-10-06 — Criação do agent `ux-design-specialist`

**Contexto:** o repo tem 21 agents, todos voltados a **arquitetura de código** (camadas, boundaries, contratos, performance). Nenhum olhava para a tela como experiência: hierarquia visual, estados, microcopy e acessibilidade não tinham dono. A demanda era criar a tela de cadastro de usuário no `apps/web`.

**Decisão:**

- Criar `ux-design-specialist` como `type: specialist`, transversal (não exclusivo de Next.js) — o que serve hoje serve para qualquer superfície de UI do monorepo.
- **Delimitar o território do `nextjs-specialist` na seção "Quando NÃO me invocar"**, porque a sobreposição era o risco real: os dois cuidam de `apps/web`. A fronteira escolhida: *eu decido como a tela é; ele decide como ela é construída*.
  - `nextjs-specialist` → RSC vs Client, caching, bundle, Core Web Vitals, Server Actions
  - `ux-design-specialist` → tokens, estados, formulários, microcopy, a11y, consistência
- Escrever a fronteira **duas vezes**: em "Quando NÃO me invocar" e em "Coordenação com Outros Agents" (a tabela), com a frase *"eu entrego a especificação; ele escreve o JSX"*. Um agent ambíguo é pior que agent inexistente.
- Registrar nos dois índices que o próprio agent se cita (`specialist-router` / `review-router`), seguindo o precedente do `telemetry-specialist` — é o que impede o agent de ficar órfão de matriz.

**Consequências:**

- 6 arquivos de índice editados: `AGENTS.md` §3.1, `README.md` (árvore + tabela), `specialist-routing.md` (v1.2→v1.3), `review-routing.md` (v1.4→v1.5), `estrutura-e-versionamento.md` (1.9.1→1.10.0), `MONOREPO.md`.
- `specialist-routing.md` e `review-routing.md` ficaram em **300 linhas exatas** (o lint conta `split('\n').length`, o `wc -l` diz 299). Zero folga: o próximo agent estoura o limite.
- Não foi criada skip rule para o `ux-design-specialist`: ele não está em `always_on` e seus globs são exclusivos de UI. Regra decorativa que nunca muda uma decisão só passa em review porque tem a chave.

### 2026-10-06 — Duas decisões de runtime tomadas antes de desenhar qualquer tela

**Contexto:** para desenhar e **verificar** a tela de cadastro era preciso o stack no ar. O README manda `pnpm dev` ou `docker compose up`. Ambos caíam em defeitos reais.

**Decisão:**

- **`@fastify/static` declarado como dependência de `@projeto/api`.** `SwaggerModule.setup()` (chamado incondicionalmente em `main.ts`) chama `useStaticAssets`, que exige esse pacote — *peer dependency opcional*, nunca declarado. Sem ele a API **não bootava**, e o Dockerfile instala do mesmo lockfile, então a "Opção A — recomendada" do README caía igual.
- **`@Inject(PrismaService)` explícito no `HealthController`.** Ver lição abaixo.

**Consequências:** com os dois corrigidos, `GET /api/v1/health` → `200 {"status":"ok","checks":{"database":"ok"}}` e `POST /api/v1/users` → `201`. O form passa a ter backend real para ser verificado.

## Padrões Descobertos

- **`apps/web` não tinha design system para estender.** `app/globals.css` tem exatamente 2 tokens em `@theme`; `packages/ui` não existe; `apps/web/components/` não existe. Antes desta feature não havia **nenhum** `<form>`, `<input>`, `<button>` ou `<label>` no monorepo inteiro — o único Client Component era `web-vitals-reporter.tsx`. Verificável:
  ```bash
  grep -rniE '<form|<input|<button|<label' apps packages --include='*.ts*' | grep -v node_modules
  ```
- **O token `--color-foreground` é inválido.** Está declarado como `222.2 84%`, sem o canal alpha; `hsl(222.2 84%)` é CSS inválido e o browser cai no fallback. Qualquer tela que dependa desse token renderiza com cor inesperada.
- **`tailwind.config.ts` é inerte no Tailwind 4.** O `@import 'tailwindcss'` + `@theme` em CSS substitui o config JS. Alterar o `content` dele não muda o que é gerado.
- **`vitest.config.ts` do web roda em `environment: 'node'`** e tem `thresholds` zerados de propósito, com comentário mandando reativar a 80% no primeiro BC do frontend. Mas, pela issue #40 já documentada na convenção de cobertura, **o threshold efetivo é lido do config raiz** — mexer só no do web pode ser inerte.

## Lições Aprendidas

- ❌ **`tsx` (esbuild) não emite `design:paramtypes`, mesmo com `emitDecoratorMetadata: true` no tsconfig.** Sintoma: DI dependente de tipo resolve `undefined` silenciosamente. O `HealthController` recebia `prisma === undefined` com o banco no ar, o `catch` do `$queryRawUnsafe` engolia o `TypeError` e devolvia **503** — que é exatamente o que um healthcheck de banco "não pronto" parece. `GET /users` e `POST /users` respondiam 200/201 o tempo todo, porque `UsersController` usa `@Inject(TOKEN)` explícito nos dois parâmetros. O build com `tsc` emite metadata (verificável com `grep -c '__metadata("design:paramtypes"' dist/.../health.controller.js`), então **o defeito é exclusivo do `pnpm dev`** e ninguém percebe em CI nem em Docker.
  **Regra:** em NestJS, nenhum construtor de classe `@Injectable`/`@Controller` deve depender de tipo implícito. `@Inject` explícito é o idioma do repo, não ruído.
- ❌ **Um `catch` vazio transforma um bug de DI em sintoma de infraestrutura.** O healthcheck dizia "banco fora", e o banco estava de pé com as 4 tabelas criadas. `catch {}` sem log é o que fez o diagnóstico custar uma sessão inteira em vez de um log.
- ❌ **Rodar a aplicação é o que revela o que os testes não veem.** Nenhum dos dois defeitos acima é detectável pela suíte: `@fastify/static` só é exigido no bootstrap real, e o DI quebrado só no `tsx`. `pnpm test` verde e aplicação morta convivem sem conflito.

## Sugestões de Evolução

- [ ] Extrair as matrizes `specialist-routing.md` e `review-routing.md` para apêndices — estão em 300 linhas exatas e o próximo agent não cabe.
- [ ] Promover a seção "Estados de componente" (vazio/carregando/erro/sucesso) a convenção própria quando a 2ª tela existir: o padrão se repetindo em uma só tela é premature, mas em duas já é regra.
- [ ] Quando `packages/ui` nascer, os tokens propostos aqui devem virar a base dele — e não uma segunda fonte de verdade.
- [ ] Corrigir `--color-foreground` (falta o canal alpha) antes da próxima tela usar cor de texto do token.