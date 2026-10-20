# Plano de correção — 3ª rodada de revisão da stack de observabilidade

> Data: 2026-10-20 (UTC). Branch: `feat/stack-observabilidade`. PR: #113.
> Rodadas anteriores: [`2026-10-19-observabilidade-correcoes.md`](./2026-10-19-observabilidade-correcoes.md) (§8, R1–R12).
> Demanda: "analise o PR 113, analise os comentários, faça um plano para corrigir
> todos os erros, revise o plano e implemente o plano".
>
> Aquele arquivo está em **300 linhas** — o teto de
> [`tamanho-e-revisao.md`](../../.agents/specs/conventions/tamanho-e-revisao.md).
> Por isso esta rodada é um arquivo novo, e não uma §9 colada no fim.

---

## §1. De onde vêm os achados

Uma revisão humana no PR #113, com 6 achados, 3 marcados `[MEDIDO]`. Os 6
chegaram como **um comentário de conversa**; não há review formal
(`reviewDecision: ""`) nem comentário inline. CI do PR: **10/10 verde**.

Ou seja: nenhum achado é falha de build. São falhas de *promessa* — a doc, um
comentário ou um gate que não cobrem o que dizem cobrir.

**Cada achado abaixo foi reproduzido por mim antes de entrar no plano.** Onde a
minha reprodução discordou do revisor, isso está escrito. Nenhum número veio de
leitura.

---

## §2. Achado a achado

### R13 — a telemetria do browser não sai no Compose

`NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT` é inlined no build do Next.js, e nem
o `apps/web/Dockerfile` nem o `build:` do serviço `web` a carregam. Sem a
variável, `instrumentation-client.ts:42` (`if (endpoint)`) simplesmente não
registra provider — sem erro, sem log.

MEDIDO nesta rodada:

```text
grep -n "ARG\|ENV" apps/web/Dockerfile   -> 5 linhas, nenhuma da chave
bloco `web` do compose                    -> environment: 3 chaves, sem build.args
```

⚠️ **Onde discordo do revisor.** Ele escreve que "a doc promete o contrário".
`como-rodar.md:291` diz, com o escopo no mesmo parágrafo: *"Em dev local (pnpm),
para o web enviar traces do browser"*. A promessa de Compose não existe — o que
existe é uma **lacuna**: `:200` lista `4318` como porta publicada e `:318`
discute "span de browser" com "taxa real é 100%" sem dizer em qual ambiente. O
revisor mediu o sintoma certo; atribuiu a causa a uma promessa que a doc não faz.

**Decisão do usuário: corrigir o código** (build arg), não a doc. Registrando o
limite conhecido, porque ele é real e não some com esta correção: `web` não tem
`profiles`, então o `build.args` vale para **todo** build da web — inclusive
produção sem collector, onde o browser passa a exportar spans para
`localhost:4318` e nenhum lugar os recebe. O `ARG` nasce **vazio** por default,
então `docker build` fora do Compose continua sem telemetria de browser.

Correção: `ARG`/`ENV` no estágio `builder` do Dockerfile + `build.args` no
compose + nota no `como-rodar.md` dizendo que a telemetria de browser depende do
build, e que fora do Compose o `ARG` fica vazio.

### R14 — a exceção de hardening do `otel-collector` ficou sem lastro

`check-dockerfile-hardening.ts:186` tem `EXCECOES_HARDENING = ['otel-collector']`,
comentando que é "dívda PRÉ-EXISTENTE: já no `main` ele não tinha hardening".
A segunda metade foi invalidada por este PR, que reescreveu o serviço
(`127.0.0.1:4317:4317`, rede `observability`, `env_file`, `deploy.resources`).

MEDIDO: a exceção está lá (`:186`), e o serviço tocado também.

**Decisão do usuário: endurecer e apagar a exceção** — `read_only: true`,
`cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, e deletar a lista.
Isso fecha a classe: exceção por nome é o anti-padrão que o bloco (5) do mesmo
arquivo diz ter eliminado.

O risco é real e o revisor o nomeou: *"torná-lo read-only mexeria num serviço que
é a espinha da stack sem haver um teste que prove que continua exportando"*. A
resposta não é pular o hardening, é **medir**: o config não usa `file_storage`
nem WAL (MEDIDO por grep em `infra/otelcol/config.yaml` — só `receivers:`,
`exporters:` e os pipelines), então o collector não escreve em disco. E a
verificação será ao vivo: subir o profile, mandar span, ler no Tempo.

### R15 — o canário do guard de vazamento não existe na máquina de dev

`tooling/scripts/compose-observability-profile.spec.ts:132` escreve o stub com o
canário **só quando `.env.production` não existe**. Numa máquina de dev o
arquivo existe; nesta, tem 335 bytes e **0 ocorrências** de
`GF_SECURITY_ADMIN_PASSWORD` (MEDIDO). O `not.toContain` roda contra uma string
que jamais conteria o canário.

**MEDIDO — mutation, não leitura.** Neutralizei `mascaraSegredos` para
`return render` (a máscara é o sujeito do teste; sem ela o valor escapa) e rodei
só o teste de vazamento:

```text
pnpm exec vitest run --root tooling/scripts compose-observability-profile \
  -t "NÃO vaza o VALOR"
=> 1 passed | 14 skipped          # com a máscara INTEIRAMENTE desligada
```

A asserção passa com o sujeito neutralizado. O guard **não tem dente nesta
máquina**. (Mutation revertida; `git diff` vazio depois.)

⚠️ **Onde discordo do subagente que verificou isto.** Ele concluiu que a
asserção "não pode falhar em nenhuma máquina", porque `mascaraSegredos` sempre
substitui `CHAVE: valor`. Isso é verdade da *implementação atual* e falso como
propriedade: com a máscara desligada e o canário presente, a asserção fica
vermelha. O que falta é a **sonda**, não a capacidade de falhar. A distinção
importa porque a correção é diferente: não se rewrite a asserção, cria-se a
sonda.

Correção: tornar a sonda **incondicional**, sem tocar no `.env.production` de
ninguém — o valor-sonda entra pelo `env` do próprio `execSync`, num nome que o
compose **já interpola**. Máquina de dev e CI passam a ter a mesma boca.

MEDIDO antes de escolher esse ponto de entrada (o resto do plano é medido; este
ia ser o único palpite):

```text
GF_SECURITY_ADMIN_USER='CANARIO_...' docker compose --profile observability config
=> 79:  GF_SECURITY_ADMIN_USER: CANARIO_NAO_E_UM_SEGREDO_REAL
```

A chave é interpolada em `docker-compose.yml:414`
(`${GF_SECURITY_ADMIN_USER:-admin}`), e `environment:` tem precedência sobre o
`env_file` — então a sonda vence mesmo com `.env.production` presente. A máscara
a cobre (chave em maiúsculas ⇒ `<oculto>`, MEDIDO no regex real).

### R16 — `policy_order` ausente e a semântica entre policies não documentada

`infra/otelcol/config.yaml:61-73` tem 3 policies (`errors`, `slow`, `baseline`)
e **nenhum** `policy_order`. MEDIDO: `policy_order` não aparece em lugar nenhum
do repo. Sem `policy_order`, o resultado é OR entre as policies — a ordem no
YAML é irrelevante, e o `sampling_percentage: 5` da `baseline` não é
independente.

A doc não afirma o errado: `como-rodar.md:305` lista as três com "e", e o `×`
de `:307` multiplica as **duas camadas**, não as três policies. É ambíguo, não
falso. Ninguém no repo diz qual é a semântica.

Correção: comentário no `config.yaml` dizendo OR + "a ordem no YAML é
irrelevante sem `policy_order`", e trocar o "e" de `:305` por "ou".

### R17 — o `grafana` não tem `depends_on`, e não tem o aviso que o `tempo` tem

MEDIDO nos 4 serviços de observabilidade:

```text
prometheus    healthcheck: true   depends_on: false
tempo         healthcheck: true   depends_on: true
grafana       healthcheck: true   depends_on: false   <-- o achado
otel-collector healthcheck: false  depends_on: false
```

O `tempo` tem um `⚠️` de 5 linhas admitindo que o healthcheck não ordena a
subida. O `grafana` sofre do mesmo problema e **não tem o aviso** — a
assimetria é o achado.

Correção: `depends_on` de verdade, com `condition: service_healthy`, já que
`prometheus` e `tempo` têm healthcheck. O `502` de primeira subida deixa de
existir, e o aviso fica desnecessário.

### R18 — nenhum gate liga `memory_limiter` a `deploy.resources`

`infra/otelcol/config.yaml:43` usa `limit_percentage: 80`; o comentário em `:39`
nomeia "512M → 410M". O `512M` vive em `docker-compose.yml:307`. MEDIDO: **nenhum**
gate, spec ou script toca `deploy.resources`, `mem_limit` ou `limit_percentage`
— grep limpo em `.tooling/scripts/` e `tooling/scripts/`. Remover o `deploy:`
do collector deixa o preflight verde.

O `%` do OTel é calculado sobre a **cgroup**: dentro do Compose dá 410M, fora
dele o collector se auto-limita ao total da máquina (MEDIDO pelo revisor:
`limit_mib: 6352` num host de 7940 MiB). O comportamento está certo; o que não
existe é o elo que impede alguém de apagar o `deploy:` e descobrir isso em prod.

Correção: invariante no `check-dockerfile-hardening` (que já tem o parser de
serviço e a spec de mutation) com casos que plantam um compose sem `deploy:`.

⚠️ **⚠️ CORREÇÃO 2026-10-20 (revista): a regra É universal.** Este plano
originalmente restringia a `profiles: [observability]`, justificado por uma
medição minha de que o `postgres` não tinha teto de memória. Era **FALSA** — a
revisão independente a refutou, e `docker-compose.yml:65` mostra
`memory: 512M # #75: teto de memória explícito` dentro do bloco do `postgres`.
**MEDIDO 2026-10-20: os 7 serviços do compose declaram
`deploy.resources.limits.memory`, `postgres` incluído.** Estreitar a regra por um
fato que não existe é deixar passar tudo que ela pegaria, e a lista de nomes
(`['otel-collector', …]`) repetiria, no mesmo arquivo, o anti-padrão que R14 está
corrigindo.

A regra que **sobra** é **derivada do próprio compose**, não de uma lista: **todo
serviço** precisa de `deploy.resources.limits.memory`. Ela nasce **verde** — não
pede mudança nenhuma no compose — e só quebra se alguém apagar um `deploy:`.

### T0 — o preflight está vermelho, e não é do PR

`pnpm ci:preflight` → **2 erro(s)**, e nenhum deles é do código do PR.

MEDIDO: o único gate `✗` é *Cristalização memória → repo*, acusando 1 memória sem
destinação no ledger: `test-com-dado-somente-no-ci`. O corpus de memórias vive
**fora** do repo, então o CI reporta `skipped` e o PR está verde lá. Localmente
o gate é vermelho e **bloqueia o pre-push**.

Correção: a linha que o próprio gate nomeia no ledger
(`.agents/runs/memory-triage.md`), com a destinação correta. Fora do escopo do
PR, dentro do caminho crítico de push.

---

## §3. Ordem das tarefas

| # | Task | Arquivos | Dente exigido |
|---|------|----------|---------------|
| T0 | linha do ledger | `.agents/runs/memory-triage.md` | `pnpm ci:preflight` sai do `✗` |
| T1 | build arg do browser | `apps/web/Dockerfile`, `docker-compose.yml`, `docs/como-rodar.md` | `docker compose config` mostra a chave; default vazio fora do Compose |
| T2 | hardening do collector | `docker-compose.yml`, `.tooling/scripts/ci/check-dockerfile-hardening.ts` + spec | **span chega no Tempo** com o serviço endurecido |
| T3 | sonda incondicional | `tooling/scripts/compose-observability-profile.spec.ts` | mutation da máscara continua **VERMELHA** depois da correção (hoje é verde) |
| T4 | semântica do sampling | `infra/otelcol/config.yaml`, `docs/como-rodar.md` | — (prosa) |
| T5 | `depends_on` do grafana | `docker-compose.yml` + spec | `docker compose config` mostra a ordem; `depends_on` removido derruba teste |
| T6 | gate de `deploy.resources` | `.tooling/scripts/ci/check-dockerfile-hardening.ts` + spec | compose sem `deploy:` → gate acusa |
| T7 | revisão | — | 2 subagentes frescos (spec + qualidade), implementador não revisa |
| T8 | gates + push | — | `preflight`, `tooling:test`, `ci:local` verdes |

T2 e T5 são as duas que exigem subir a stack. T0 primeiro porque destrava o
pre-push de todas as outras.

## §4. O que este plano NÃO faz

- **Não endurece o `web`.** Já está endurecido (`:208-217`); o achado não é
  sobre ele.
- **Não adiciona `policy_order`.** A semântica OR é a pretendida; documentá-la
  basta. `policy_order` mudaria o comportamento do sampling sem pedido nenhum.
- **Não reescreve a asserção de vazamento.** Ela está certa; falta a sonda
  (R15). Reescrever a asserção trocaria um guard functioning por outro.
- **Não toca no ledger além da linha que falta.** As 45 memórias `pendente` são
  dívida declarada e o gate as reporta como ressalva, não como erro.
