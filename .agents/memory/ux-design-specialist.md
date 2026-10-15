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

### 2026-10-13 — O agent ganha processo: 5 skills de UI

**Contexto:** três repositórios externos de skill de UI foram adicionados como referência: [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT), [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0) e [leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill) (MIT). O material é bom, mas foi escrito para app com design system maduro e para landing page. Este repo tem 2 tokens e telas de operação. Copiar as house rules literais produzia opinion-plating: regras que ninguém consegue aplicar porque não têm contraexemplo medido aqui.

**Decisão:**

- **Adaptar, não vendorizar.** 4 skills de conteúdo (`ui-modes`, `ui-craft`, `ui-break`, `motion`) mais 1 de processo (`ui-review`), cada uma abaixo de 300 linhas, com frontmatter do repo, prosa em pt-BR e sem scripts ou binários.
- **`ui-modes` roda primeiro, sempre.** Ela decide o MODO da tela (Persuadir, Operar, Ler, Experienciar). Medido: 3 das 4 telas de `apps/web` são modo **Operar** (`app/page.tsx` é o boilerplate do `create-next-app`, Persuadir por acidente). Sem essa decisão `ui-craft` (que quer densidade) e `motion` (que quer expressão) dão conselhos que se contradizem, e o reviewer escolhe o que quiser.
- **As regras anti-slop foram reescritas para tela de app.** No original o proibido é ornamento de landing page (glass, gradiente, badge). Em tela de Operar o proibido é o que **compete com a hierarquia de ação**: emoji, palavra-chave estilizada, número decorativo, cartão com ícone no topo, sombra em repouso.
- **`ui-break` é a mais cara das quatro**: constrói fixture e mede em 320px, zoom 200%, dark mode e RTL. Só entra quando a tela renderiza dado vindo da API — rodar em componente estático é desperdício.
- **Atribuição em cada skill.** Origem e licença ficam no §Referências. Apache-2.0 (impeccable) exige NOTICE quando redistribuído.

**Consequências:**

- Arquivos novos: `.agents/skills/{ui-modes,ui-craft,ui-break,motion,ui-review}/SKILL.md`.
- `review-routing.md` subiu para v1.7: nova seção `## 0. Reviewer com skill de processo` (a tabela reviewer → skill) e 2 `diff_patterns` (foco e movimento). Regra adotada: entrada de matriz e skill entram no mesmo PR.
- Novo workflow `ui-review-mode`, começando em `WORKFLOWS.md` e `AGENTS.md` §5.
- A skill `motion` assume CSS puro porque é o que existe: `apps/web/package.json` não tem biblioteca de animação. Se uma entrar, muda a coluna de propriedade GPU, não as regras.
- Os dois índices de workflow não receberam número de versão novo: `WORKFLOWS.md` ainda diz 1.9.1 enquanto já carrega linhas marcadas v1.11.0. A numeração de linha está adiantada em relação ao rodapé.

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

### 2026-10-13 — Revisão adversarial: 4 claims das skills eram falsas

**Contexto:** duas reviewers independentes leram as 5 skills procurando claim que
o repo não sustenta. Quatro caíram; todas as correções são medição com o
comando ao lado, não ajuste de redação.

**Defeito 1 (o que morde).** O bloco `@theme` que `ui-craft` prescreve guardava
tripla HSL crua (`--color-surface: 220 14% 97%`). O Tailwind 4 emite
`background-color: var(--color-surface)` literalmente, e tripla sem `hsl()` não é
cor: a declaração é descartada em silêncio e o elemento fica transparente.
**A skill prescrevia repetir 8 vezes o bug que o comentário de
`apps/web/app/globals.css:5-9` já documenta** — e os 2 tokens atuais só
funcionam porque `globals.css:15-16` envolve o valor na mão.
*Medido:* `npx @tailwindcss/cli` com `220 14% 97%` → `var(--color-surface)`
crua; com `hsl(222 84% 5%)` → cor válida.

**Defeito 2.** `ui-modes` afirmava "as telas de `apps/web` são **todas** modo
Operar" citando 3 arquivos, e marcava como medido. São 4 telas: `app/page.tsx`
é o hero do `create-next-app`, justamente o arquétipo que `ui-craft` §1 proíbe.
*Medido:* `find apps/web/app -name page.tsx | wc -l` → 4.

**Defeito 3.** `ui-craft` dizia "tudo o mais é valor literal espalhado pelos
componentes". Literal é **zero**; o que se espalha é a paleta stock do Tailwind
(68 usos de `text-slate-*`, `bg-red-*`, `border-*`). A diferença muda o conserto:
tokenizar literais é trabalho de hoisting; trocar `text-slate-500` por
`text-muted-foreground` é migração de fonte de cor, e a paleta sobrevive a
todos os `--color-*` novos.
*Medido:* o grep de literal → 0. O grep de paleta, re-medido em 2026-10-13 com o
escopo escrito ao lado, dá **68** e não os 39 que esta memória carregava — 39
não fechava com nenhum escopo possível (44 em `components/`, 24 em `app/`):
`grep -rhoE '(text|bg|border)-(slate|gray|red|blue|green|amber|zinc|neutral|stone)-[0-9]{2,3}' apps/web/components apps/web/app --include='*.tsx' | wc -l` → 68.

**Defeito 4 — não existia.** A revisão reportou que `ui-break:158` receitava
`overflow-wrap-anywhere` como classe Tailwind e que a classe não compila. Falso:
o arquivo diz `overflow-wrap: anywhere`, a **propriedade CSS**, e é exatamente
isso que o texto descreve. O replace que eu tinha preparado não casou com nada
e não mudou o arquivo. Registrar aqui porque a tentativa de "consertar" um
defeito inexistente teria trocado instrução correta por uma classe arbitrária
que o Tailwind emite como sintaxe de valor arbitrário — i.e., o reviewer teria
"consertado" o arquivo para acomodar o próprio erro de leitura.

**Consequências:** `ui-modes` (120 ln), `ui-craft` (187) e
`.agents/memory/ux-design-specialist.md` corrigidos; `ui-break` intocado.
O lesson que generaliza: o marker "Medido em <data>" não tem peso probatório
nenhum — `ui-modes` usou a mesma marcação num claim verdadeiro e num falso, e
nenhum reviewer anterior notou. A marcação que tem é o comando. E o segundo:
**um replace que não casa é um evento, não um sucesso** — conferir
`git diff --stat` depois de cada replace em lote, porque "não casou" e "não
tinha o que corrigir" produzem o mesmo silêncio.
