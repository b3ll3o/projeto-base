---
name: runbook-specialist-memory
description: Memória acumulada do agent runbook-specialist — a fronteira com o docs/como-rodar.md, as duas subespécies da família de runbooks, e o que o check-runbook-drift mede (e o que ele não mede)
---

# Memória: `runbook-specialist`

> Arquivo de memória do agent `runbook-specialist`.

## Decisões Tomadas

### 2026-11-18 — A família do item 12 tem duas subespécies, e o gate não as separa

**Contexto:** a matriz de `kit-documentacao.md` §2.5 declara o item 12 com
doc canônico `docs/runbooks/*.md` (tipo `familia`) e âncora `## §1.` — sem
dizer o que um runbook é. Os 4 arquivos existentes (medido 2026-11-18:
`ls docs/runbooks/*.md | wc -l` → `4`) respondem a perguntas diferentes:
`docker.md`, `observabilidade.md` e `e2e-e-ci.md` dizem **como subir o
ambiente N**; `cloudflare-edge.md` §6 ("O que fazer quando um item falha") diz
**o que fazer quando quebra**.

**Decisão:** a família abriga as duas subespécies, e um **runbook novo de
sintoma** nasce com o formato de 5 partes (sintoma → diagnóstico → ação →
escalada → verificação); um **runbook de ambiente** segue o formato já
existente (ambiente → §1 …). A âncora `## §1.` é o que os dois têm em
comum — e é por isso que ela é a âncora medida.

**Consequências:** a auditoria do item 12 não pode exigir as 5 partes de todo
arquivo da família sem acusar os 4 de ambiente como incompletos. A regra
válida: as 5 partes são obrigatórias **no runbook de sintoma**.

### 2026-11-18 — O `check-runbook-drift` mede o runbook canônico, não a família

**Contexto:** o gate `check-runbook-drift.ts` é o instrumento de frescor dos
runbooks — e sua função `checkRunbookDrift` usa `docPath ?? path.join(root,
'docs/como-rodar.md')`. O `docs/como-rodar.md` §0 diz o mesmo em prosa: *"é o
que o gate `check-runbook-drift` mede — os irmãos **não** são lidos por ele"*.

**Decisão:** a família `docs/runbooks/*.md` **não tem** instrumento de
frescor. O único gate que a mede é o `check-doc-kit`, que lê a âncora
`## §1.` e **não** o texto. Registro isso como **lacuna nomeada** — o dono da
lacuna é quem escreve o gate, não eu.

**Consequências:** quando eu escrever um runbook novo, a verificação de
frescor é **manual** (o Passo 4 do agent): confiro cada `pnpm <script>` contra
os `package.json` do workspace e cada path citado com `ls`. Um runbook da
família que cita um script morto fica verde no gate e mente para o leitor.

### 2026-11-18 — A fronteira com o `docs/como-rodar.md` é pergunta, não arquivo

**Contexto:** `documentacao.md` §2 dá ao `docs/como-rodar.md` a verdade do
*como executar*; a família do item 12 é o *o que fazer quando quebra*. Os
dois se cruzam no índice §0 (que lista 7 ambientes) e no §0.2 (a regra de
frescor).

**Decisão:** eu decido pelo **gatilho**, não pelo path: "como eu subo isso" →
`docs/como-rodar.md` (dono: `documentation-specialist`); "isso quebrou, o que
eu faço" → família (dono: eu). Um runbook novo entra no índice §0 — e quem
edita o índice é o `documentation-specialist`, não eu.

**Consequências:** eu aviso o `documentation-specialist` quando a família
cresce; eu não edito `docs/como-rodar.md` (e o briefing proíbe `docs/**`).

## Padrões Descobertos

- Os 4 runbooks da família começam com o rodapé `> Parte do [runbook
  canônico](../../docs/como-rodar.md). Índices: …` — é o padrão de linkagem, e ele
  cumpre a regra do fato com um dono (`dry.md`).
- A legenda `**✅ medido** = executado, com saída observada · **📖 lido do
  código** = derivado do YAML/config, não executado` está nos 4 arquivos — é a
  convenção da casa, e ela **data** a afirmação.
- `docs/runbooks/observabilidade.md` §2.2 é o **melhor exemplo de runbook de
  sintoma** que o repo tem: 3 perguntas em ordem (PromQL), o porquê de cada
  uma, e o sintoma que cada sintoma **não** acusa ("`sent` baixo é o
  comportamento saudável — compará-lo com o `accepted` não isola nada").
- O `check-runbook-drift` extrai scripts `pnpm` **só de bloco de código**
  cercado. MEDIDO no próprio gate (2026-10-16): varrer o doc inteiro acusou 5
  falsos positivos — "pnpm nativo", "pnpm responde", "pnpm workspace", e as
  referências a `pnpm prune`/`pnpm deploy` da seção de diagnóstico.
- O nome do container do banco local vive em **4 superfícies** (runbook §1.1,
  o app, o tooling e o `.husky/pre-push`), e o **DONO é o runbook §1.1** — a
  receita que cria o container. As outras 3 concordam com ele.

## Lições Aprendidas

- ❌ **Comando fora de bloco cercado não é comando.** Se o runbook manda o
  leitor "rodar `pnpm X`" na prosa, o gate não mede — e o leitor copia do
  mesmo jeito. Todo passo copiável vai em bloco ```bash.
- ❌ **O gate verde não é o runbook certo.** O `check-doc-kit` mede a âncora
  `## §1.`; um runbook com 5 seções inventadas e nenhum comando real passa.
- ❌ **Não reescrever o `docs/como-rodar.md` "para ficar consistente".** É o
  doc de outro dono, e o gate de frescor dele é outro.
- ❌ **Não registrar o incidente no runbook.** O runbook é o procedimento
  para o próximo; o registro é do `postmortem-specialist`.

## Sugestões de Evolução

- [ ] Gate de frescor para a família: estender o `check-runbook-drift` para
  aceitar uma lista de paths (`docPath` já existe na função) e rodar sobre
  cada arquivo de `docs/runbooks/`.
- [ ] Um script de conferência que extraia os `pnpm <script>` de **todos** os
  runbooks da família e os confronte com os `package.json` do workspace —
  fecha a lacuna nomeada acima sem depender de gate novo.
- [ ] Registrar no índice §0 do `docs/como-rodar.md` a subespécie de cada
  runbook da família (ambiente × sintoma), para a auditoria não confundir as
  duas.
