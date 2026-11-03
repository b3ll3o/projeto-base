# O instrumento que faltava para as skills de auditoria — 2026-10-29

> **Branch:** `feat/gate-skills-de-auditoria` · **Base:** `origin/main` (`194d305`)
> **Origem:** achado **F11** da revisão das 23 skills (PR #140) — as skills de
> auditoria são procedimentos shell determinísticos e **nada no CI os
> executava**.
> **Método:** o gate novo foi escrito primeiro; os defeitos que ele revelou
> foram **medidos** rodando os passos; cada mutação do gate foi medida antes
> de virar linha na tabela de dentes.
> Um item só entra aqui **medido**: o comando, a data e o número.

## TL;DR

| # | Achado | Classe | Veredito | Destino |
|---|---|---|---|---|
| F11 | Nenhum instrumento roda as procedures das skills de auditoria | defesa geral | **fechado** | o gate `check-audit-skills` executa os passos declarados |
| F12 | `openapi-audit` passos 3 e 5 apontam para `controllers/` — que não existe | procedimento cego | **corrigido** | o caminho real é `infrastructure/http/` |
| F13 | `docker-prod-audit` passo 2 precisa de `yq`, que não está no CI | procedimento cego | **corrigido** (declarado `skip` com o motivo) | ou o `yq` entra na imagem, ou o passo é reescrito |
| F14 | `otelcol-audit` passo 2.2 varre o build output e estoura o tempo | procedimento cego | **corrigido** | `--exclude-dir` para `.next`/`.next-e2e`/`node_modules` |
| F15 | `docker-prod-audit` passo 6.2 exige o padrão no início da linha | falso positivo | **corrigido** | o `.dockerignore` usa `**/` — e o segmento pai cobre |

---

## F11 — o instrumento: `check-audit-skills`

**Classe:** defesa geral · **Status:** **fechado neste PR**

### O problema

As 5 skills de auditoria (`prisma-audit`, `openapi-audit`, `otelcol-audit`,
`docker-prod-audit`, `release-versioning-audit`) e a `findings-orchestration` são
**procedimentos shell determinísticos**. Nenhum job do CI os executa. A
consequência foi medida no PR #140: **três dos passos que rodei estavam
quebrados** e nada reclamou — porque a skill só quebra quando alguém a
executa, e ninguém a executa há semanas.

A doutrina do repo já diz: *"regra sem instrumento é defeito"*
([`guard-classes.md`](../specs/conventions/guard-classes.md)). As skills de
auditoria são a versão em prosa dessa regra.

### O que o gate mede

1. **Declaração obrigatória.** Todo bloco ```bash de cada skill de auditoria
   precisa de uma linha `> **Gate:** \`run\` — <motivo>` ou
   `> **Gate:** \`skip\` — <motivo>` antes do bloco. **Bloco sem declaração é
   erro** — é a lista que não pode encolher em silêncio (a mesma lição da
   lista de footers do #126, que media 4 de 6 arquivos).
2. **Execução.** Os passos `run` são executados (cwd = a raiz do repo, timeout
   de 120s por passo). O gate falha se o passo:
   - sair com código de **crash** (2, 126, 127, ≥128). O código **1** é
     sucesso: `grep`, `diff`, `comm` devolvem 1 quando não acham nada, e num
     passo de auditoria "não achei nada" é o estado **desejado**;
   - imprimir uma linha de falha (a marca `✗` que os gates do repo já usam);
   - **não produzir nenhuma saída** — o modo de falha do F3, em que uma regex
   morta sai vazia e "vazio" é indistinguível de "mediu e não achou";
   - estourar o tempo limite.
3. **A declaração não pode mentir.** Um passo `run` não pode conter primitiva
   de escrita, de rede ou de infra (`rm`, `mv`, `docker`, `gh`, `curl`,
   `pnpm`, `git fetch/push`, redirect para fora do scratch). O comentário de
   uma linha **não** conta: `# (ex: curl em distroless)` é texto, não comando.

### A fronteira de confiança

O corpo do script vem de um arquivo **do repo** (`.agents/skills/<skill>/SKILL.md`),
revisado no PR, e não de entrada de usuário. É o mesmo nível de confiança de
rodar a skill na mão. O comando vai como argv em array
(`spawnSync('bash', ['-c', corpo])`).

### As mutações (medidas)

| mutação | resultado |
|---|---|
| a regex morta do F3 restaurada | 🔴 `✗ a regex do release-template.yml NÃO casou` → gate vermelho |
| o glob dos DTO do `openapi-audit` apontando para um diretório inexistente | 🔴 `✗ um dos lados da comparação ficou vazio` → gate vermelho |
| a linha de declaração removida de um bloco | 🔴 `bloco bash SEM DECLARAÇÃO` → gate vermelho |
| um passo `run` que escreve no repo | 🔴 `redireciona para saida.txt` → gate vermelho |
| um passo que imprime `✗` | 🔴 `REPORTOU falha` → gate vermelho |
| um passo que não produz saída | 🔴 `NENHUMA saída` → gate vermelho |
| a base (24 passos `run` nas 6 skills) | 🟢 `ok=true, errors=0` |

A spec tem **22 testes**: a lista presa (6 skills, com os nomes), a extração
da declaração, o comentário ignorado, o redirect capturado por **alvo** (não
por forma), o código 1 como sucesso, 4 casos sintéticos e **um teste sobre o
repo real** que executa os 24 passos.

---

## F12 — `openapi-audit` media um diretório que não existe

**Classe:** procedimento cego · **Status:** **corrigido**

### O que foi medido

```
$ ls -d apps/api/src/modules/*/controllers
ls: cannot access 'apps/api/src/modules/*/controllers': No such file or directory
$ ls apps/api/src/modules/users/infrastructure/http/
user-ownership.guard.ts  users.controller.ts  ...
```

Os passos 3 e 5 do `openapi-audit` procuravam em
`apps/api/src/modules/*/controllers/` — o `grep` num glob que não casa nada
**não dá erro**: sai vazio e o passo segue como se tivesse medido. Os
controllers vivem em `infrastructure/http/`.

Corrigido nos 4 lugares. E, com o caminho certo, o passo **passou a reportar
dois falsos positivos** — que também eram defeito do passo:

- `current-user.decorator.ts:30 missing @ApiOperation` → o `@Get('me')` estava
  **dentro de um JSDoc `@example`**. O passo casava o texto do comentário.
  Agora o decorator é o que está no **início da linha** (`^\s*@(Get|Post|...)`).
- `users.controller.ts:159 missing @ApiOperation` → o `@ApiOperation` está
  **7 linhas abaixo** do `@Post()`, com um comentário pt-BR no meio. A janela
  era de 5 linhas; agora é de −10 a +10 (o `@ApiOperation` pode estar antes
  ou depois).

## F13 — `docker-prod-audit` precisa de `yq`, que não existe

**Classe:** procedimento cego · **Status:** **declarado `skip`** (decisão aberta)

O passo 2 lê o compose com `yq -P ".services.$svc"`. O `yq` **não está
instalado** neste ambiente nem na imagem do CI — o `yq` ausente imprime
"erro" no stderr e o `|| echo "(serviço $svc não encontrado ou sem
hardening)"` transforma a falha em **"o serviço não tem hardening"**: um
finding falso sobre hardening de produção.

O gate exige que o passo declare o motivo, então ele ficou `skip` com o
motivo explícito. **Fica a decisão:** o `yq` entra na imagem do CI, ou o
passo é reescrito para não depender dele (grep por serviço).

## F14 — `otelcol-audit` varre o build output e estoura o tempo

**Classe:** procedimento cego · **Status:** **corrigido**

O passo 2.2 fazia `grep -rn ... apps/` — sem `--exclude-dir`. Com o build da
suíte e2e presente (`apps/web/.next-e2e/standalone/...`), a saída passa de
**megabytes** (sourcemaps) e o passo **estourou o tempo limite** — foi a
primeira falha que o gate acusou.

Corrigido com `--exclude-dir=node_modules --exclude-dir=.next
--exclude-dir=.next-e2e`.

## F15 — `docker-prod-audit` 6.2: 4 exclusões que existem, acusadas como ausentes

**Classe:** falso positivo · **Status:** **corrigido**

O passo exigia o padrão no **início da linha** (`grep -q "^$pattern"`), e o
`.dockerignore` usa o prefixo `**/` — que é mais agressivo e o certo:

```
$ cat .dockerignore | head -3
**/node_modules
**/dist
**/.next
```

O passo acusava `✗ NÃO exclui node_modules`, `✗ NÃO exclui .env`,
`✗ NÃO exclui coverage/` e `✗ NÃO exclui .agents/runs/` — **as quatro estão
excluídas**. E `.agents/runs/` é coberto pela exclusão do diretório pai
(`.agents`), que é o que o build context precisa.

Corrigido: o passo aceita o prefixo `**/` e confere o **segmento pai**
(`${pattern%%/*}`).

---

## O que NÃO foi verificado

- Os passos `skip` (14 dos 38) continuam **sem instrumento**: o gate registra
  que eles não são medidos, mas não os mede. Os que dependem de infra
  (`docker buildx`, `docker run`, `prisma migrate status`) só podem ser
  medidos com a infra no CI; os que dependem da API do GitHub (`gh`) são
  escrita, não leitura.
- A **qualidade editorial** dos passos corrigidos: o gate mede que eles rodam
  e não mentem — não que a pergunta feita é a pergunta certa.
- `findings-orchestration` tem 6 blocos e **nenhum** é `run`: ela orquestra
  subagentes e escreve no repo e na API do GitHub. A instrumentação dela é
  outro problema (precisa de um harness de subagente), e fica para depois.
