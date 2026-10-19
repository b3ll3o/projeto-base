# Plano de correção — 2ª rodada de revisão da stack de observabilidade

> Data: 2026-10-19. Branch: `feat/stack-observabilidade`.
> Plano de origem: [`2026-10-19-stack-observabilidade.md`](./2026-10-19-stack-observabilidade.md).
> Demanda: "revise tudo, crie um plano para corrigir os erros, revise o plano e
> implemente o plano".

---

## 8. Plano de correção — 2ª rodada de revisão (2026-10-19)

Oito achados. Os cinco primeiros saíram de uma revisão do diff; **três (R6, R7,
R8) apareceram ao revisar o próprio plano** — nenhum deles estava na lista
original. Cada um dos oito foi reproduzido por mim antes de entrar aqui, com o
comando ao lado. Nenhum número veio de leitura.

### R1 — BLOCKER: a doc afirma uma garantia que o sampling não dá

`docs/como-rodar.md:309` e `docs/adr/0003:112` dizem que "erro e request lento
passam sempre". **É falso, e a tabela do `como-rodar.md` o contradiz.**

MEDIDO com o `TraceIdRatioBasedSampler` real do SDK deste repo sobre 200 000
traceIds aleatórios de 128 bits:

```text
camada 1 sobe  10.06% dos requests
camada 1 sobe  10.06% dos requests de ERRO (mesmo span)
=> o sampler enxerga status HTTP? NAO — é cego, erro e comum sobrevivem igual
```

`TraceIdRatioBasedSampler` decide por XOR do trace-id e **não vê o status**. Um
request de erro não tem vantagem nenhuma sobre um rápido: os dois passam pela
camada 1 com 10%. "Passam sempre" vale só **na camada 2**, depois de já terem
sido descartados por ela com 90% de chance.

Correção: nos **dois** arquivos, trocar por "sobem a camada 2, mas a camada 1 já
matou ~90% das raízes — então ~10% dos traces de erro chegam ao backend".

**Não são três arquivos.** `infra/otelcol/config.yaml:47` diz `errors (sempre
preservar)` — MEDIDO: 0 ocorrências de "passam sempre" naquele arquivo. E o
claim dele **é verdadeiro no escopo em que está**: descreve a policy `errors` do
`tail_sampling`, que de fato preserva todo trace com span em ERROR. Aplicar ali
o texto substituto produziria uma afirmação nova e falsa — um config do
collector opinando sobre um default que ele não define e cujo valor vem do
`.env.production` da máquina. Lá entra **nota de escopo**, não troca de claim.

### R2 — BLOCKER: a senha do admin do Grafana vaza na saída do teste

`docker compose config` renderiza o conteúdo do `env_file` **em texto claro**, e
o vitest imprime a string inteira em `+ Received:` quando um `expect` falha.

MEDIDO (ambiente isolado, segredo sintético):

```text
=== a senha aparece no render? ===  ocorrências: 4
30:      GF_SECURITY_ADMIN_PASSWORD: SEGREDO_SINTETICO_NAO_REAL
=== o vitest imprime a string inteira? ===
+ Received:
"services:
   grafana:
     environment:
       GF_SECURITY_ADMIN_PASSWORD: SEGREDO_SINTETICO_NAO_REAL
```

O problema não é "o teste imprime demais": é que **qualquer** `expect` que receba
o render vira um canal de vazamento quando falha. 14 asserções em 7 testes
recebem o render inteiro.

Correção: mascarar o valor de toda linha de variável de ambiente dentro de
`composeConfig()`, preservando a chave. Nenhuma das 25 asserções do arquivo olha
valor de env — os valores que as regexes exigem são `published:`, `host_ip:`,
`image:`, `source:`, `target:`, todos minúsculos — então **nenhuma fica verde
por motivo errado** depois de mascarado.

Regex, literal, para o implementador não escrever a versão frouxa
(`[A-Za-z_]` sem filtro de caixa quebraria os 2 testes de mount, porque `target:`
é minúscula e está dentro da janela do `mountReadOnly`):

```ts
/^(\s*)(-\s*)?[A-Z][A-Z0-9_]*[:=].*/   // captura 1 = indent, 2 = "- "
```

O `-` cobre a forma `environment: - KEY=value`, que o Compose renderiza como
`- CHAVE=valor` e que a regra `KEY: valor` deixaria passar inteira.

**Evidência, e um número meu que estava errado.** A primeira redação desta seção
disse "7 de 7 variáveis do bloco `api`". **7 estava errado**: eu tinha medido
com um `env_file` **vazio** no sandbox. Remedido com o `.env.production.example`
inteiro:

```text
api: 17   grafana: 16   otel-collector: 15   web: 3      total: 66
falsos positivos: 0
```

O discriminador é a **forma**, não uma lista de nomes de segredo — as 66 caem,
incluindo as que não são segredo. Nenhuma chave do Compose é maiúscula com
underscore (a spec é minúscula inteira), então a regra não pega o que não deve.

### R3 — MEDIUM: `blocoDoServico()` vaza além do último serviço

Quando não há próximo serviço, `fim < 0` devolve o resto do arquivo — incluindo
as chaves de topo `networks:` e `volumes:`. O comentário do helper afirma que o
corte por serviço é "o único limite que o render respeita", o que é verdade no
meio do arquivo e falso no fim.

Correção: cortar também na próxima chave de nível topo (`\n` seguido de
não-espaço). Seguro porque chave de serviço tem 2 espaços de indentação, então
`\S` só casa na coluna 0. O serviço que sofre hoje é `web` (último em ordem
alfabética), não `tempo` — o que confirma ser latente. **E corrigir o comentário
do helper**: mudar o código e deixar o texto é o modo de o repo documentar o
contrário do que ele faz.

### R4 — MEDIUM: "NÃO publica o Tempo" passa vazio quando o serviço some

`blocoDoServico()` devolve `''` para serviço ausente, e `''.not.toMatch(...)` é
`true` — o teste que deveria garantir que o Tempo existe passa quando o Tempo
desaparece. CONFIRMADO por mutação: renomear `tempo:` → `tempo-store:` deu 2
vermelhos **mas não este**.

Correção: `expect(bloco).not.toBe('')` antes da asserção negada.

**Exatamente um teste é vacuoso**, não três. Os outros 2 que usam `blocoDoServico`
são os de mount, e eles já ficam vermelhos com serviço ausente: `''.toMatch(x)`
é `false` e `mountReadOnly('')` devolve `false`.

### R5 — MEDIUM: as citações de linha que eu "corrigi" no round 1 estavam erradas

Eu escrevi que tinha corrigido `66`, `84-91` e `90-91`. Remedidas contra os
arquivos: **72**, **90-91**, **96-97**. As três estavam erradas — a que eu medi
(`resource_to_telemetry_conversion`) eu mesmo escrevi 6 linhas fora.

| Arquivo | Cita | Real | Correto |
| --- | --- | --- | --- |
| `infra/tempo/tempo.yaml:18` | `config.yaml:66` | `batch: {}`; `otlp/tempo:` em **72** | `:72` |
| `infra/prometheus/prometheus.yml:3` | `config.yaml:84-91` | exporter `prometheus` em **90-91** | `:90-91` |
| `infra/prometheus/prometheus.yml:19` | `config.yaml:90-91` | idem — o `resource_to_telemetry_conversion` está em **96-97** | `:96-97` |
| `infra/otelcol/config.yaml:7` | `example:84` | a linha 84 é um `#`; a chave está em **90** | `:90` |
| `docs/adr/0003:19` | `example:84` | idem | `:90` |
| este plano, `:37` (T6) | `example:84` | idem | `:90` |
| este plano, `:14` (D1) | `example:84` | ver abaixo | **fica `84`, marcado** |

`:14` e `:37` são casos diferentes e meu primeiro rascunho os tratou igual — uma
contradição interna do próprio plano. `:37` descreve o estado **depois** do T6:
vira `:90`. `:14` é o diagnóstico D1 e diz, no passado, que a linha 84 *definia*
`https://otelcol-backend.exemplo.com:4317`. Apontar para `:90` produziria uma
citação nova e errada, trocada por uma que era errada em cima: fica `84` com
marcador `(antes do T6)`. O `:57` que `:14` cita no `config.yaml` é hoje
`status_codes: [ERROR]` — o exporter placeholder não existe mais, então a
referência também vira pré-fix.

As citações `:96-97` (sampling) em `como-rodar.md:304`, `adr:0003:109` e `:114`
deste plano foram conferidas e estão **certas** — deixadas como estão.

### R6 — BLOCKER (achado ao revisar o plano): o `prometheus.yml` afirma o critério que o round 1 acabou de desqualificar

`infra/prometheus/prometheus.yml:30-35` escreve que o job responde "a telemetria
está chegando e o exportador está dando conta?" com `otelcol_receiver_accepted_spans`
subindo **e `otelcol_exporter_sent_spans` subindo junto**. O `como-rodar.md:323`
diz o oposto desde o round 1: `sent_spans` conta o que passou pelo `tail_sampling`,
e compará-lo com o `accepted` "não isola nada e vira diagnóstico de incidente onde
a configuração está certa".

É a **mesma aritmética de R1**: `sent` é ~0,5% do `accepted` por desenho
saudável. O round 1 corrigiu o `como-rodar.md` e deixou o defeito no
`prometheus.yml` — arquivo **novo desta branch**, então não é dívida
pré-existente. Nenhum de R1..R5 o via.

Correção: reescrever o critério para `send_failed`/`queue_size`, igual ao
`como-rodar.md`.

### R7 — MEDIUM (achado ao revisar o plano): uma memória versionada prescreve o comando que imprime o segredo

`.agents/memory/docker-specialist.md:100-101`, em "Comandos úteis validados":

```bash
docker compose -f docker-compose.yml config
```

Um agent que segue essa memória imprime `JWT_SECRET` e
`GF_SECURITY_ADMIN_PASSWORD` em claro no terminal ou no log de CI. R2 cobre o
primeiro consumidor (vitest); este é o segundo. Correção: pôr `--no-interpolate`
no comando da memória, com uma linha dizendo por quê. Varredura: é a única
ocorrência fora do spec e do compose.

### R8 — MEDIUM (achado ao revisar o plano): a taxa de R1 só vale para a api

MEDIDO: o serviço `web` tem **0** `env_file`, e `OTEL_TRACES_SAMPLER` só existe em
`.env.production.example` — não é `NEXT_PUBLIC_*`, então nem é inlined no build.
Para span de browser a camada 1 não existe: o fallback é `AlwaysOn` e a taxa é
**100%**.

Depois da correção de R1 a doc dirá "~10% dos traces de erro chegam ao backend", e
quem estiver olhando trace de browser vai concluir que há sampling demais quando
há sampling de menos. Correção: uma linha de escopo em `como-rodar.md` e no ADR
("taxas valem para a **api**; `web` não recebe `OTEL_TRACES_SAMPLER`, entra 100%").

### Fora do alcance, nomeado

- **Um gate para citação `arquivo:N`.** MEDIDO: `check-doc-refs` valida só o path
  de links markdown e só em `.md` — nunca o sufixo `:NN`. **4 das 6 citações do
  R5 vivem em YAML**, que nenhum gate lê: a próxima edição do `config.yaml` volta
  a quebrar `tempo.yaml` e `prometheus.yml` em silêncio. Fechar a classe é um
  check novo; aqui foi pedido para fechar as instâncias.
- **T5** (`metricReader`), **T7** (`MeterProvider` no browser) e a chave
  `GF_SECURITY_ADMIN_PASSWORD` no `.env.production` local continuam bloqueados por
  autorização que é do usuário, não por técnica. `DIRECT_DATABASE_URL` no mesmo
  arquivo é o que derruba a api — e sem api não há telemetria de aplicação.

## 9. Execução (2026-10-19)

Os oito implementados. `pnpm ci:preflight` 0 erro (2 checks skipped, declarados
no próprio painel), `pnpm ci:local` EXIT=0 com 455 testes, prettier limpo nos 11
arquivos, varredura CJK 0 com controle positivo que dispara.

### A correção de origem que este plano quase prescreveu

A seção R2 apontava a redaction no ponto de uso como o caminho, mas a
**correção de origem** (`--no-interpolate`, que zera os segredos antes de
qualquer máscara) parecia melhor e foi tentada primeiro. **Medido, ela quebra o
gating de profile** — que é justamente o que este spec existe para verificar:

```text
docker compose config                     -> api postgres web backend frontend
docker compose config --no-interpolate    -> + tempo grafana otel-collector
```

Quatro testes caíram. Vale registrar porque o `--help` invita a tentá-la e o
nome da flag mente (`--no-env-resolution` é que não impede nada, apesar do
`--help` dizer que impede). Fica em comentário no código para ninguém repetir.

### Dentes, medidos por mutação

| Guard | Mutação | Resultado |
| --- | --- | --- |
| `mascaraSegredos` | virar no-op | 1 vermelho (teste unitário da função) |
| corte de topo do `blocoDoServico` | `proxTopo = -1` | 1 vermelho (serviço `web`, o último) |
| `.not.toBe('')` do Tempo | `tempo:` → `tempo-store:` | 3 vermelhos, **incluindo o do Tempo** (antes: ficava verde) |

O `.not.toBe('')` teve que ser provado por **diferencial**, e não por mutação
isolada: remover a guarda com a config boa não muda nada. Removê-la *junto com* o
serviço renomeado devolve o teste ao verde — o que isola a guarda como a causa
do vermelho, e não outra asserção do mesmo arquivo.

### O que o plano errou sobre a própria prova

A primeira redação do R2 dizia que o stub com canário dava o dado ao teste de
vazamento. **Na máquina de dev ele não dá**: existe `.env.production` real, o
`composeConfig()` usa o arquivo da máquina e o stub nunca é escrito — o canário
não existe, e a asserção de ausência é verde por ausência de dado. A primeira
mutação confirmou: desligar a máscara deixou **13/13 verdes**.

O dente real foi movido para um teste unitário de `mascaraSegredos`, com a
entrada escrita à mão, que tem conteúdo independente de a máquina ter ou não
`.env.production`. O teste de integração ficou, com o aviso de onde ele morde.

### Vazamento, provado com uma falha de verdade

Inseri uma asserção impossível numa linha que recebe o render inteiro e li a
saída do vitest. Os 8 lugares que casam para `JWT_SECRET` / `POSTGRES_PASSWORD`
são todos `CHAVE:<oculto>` — nome preservado, valor ausente — e
`app_runtime_dev` (a senha do example) não aparece nenhuma vez.

### Pendência que eu criei

`docs/como-rodar.md` está com **406 linhas**, acima do teto de 300 da convenção
`tamanho-e-revisao`. Ele já estava em **326** no `HEAD` — a violação é
pré-existente — mas o trabalho de observabilidade somou **80 linhas** em cima
disso. Deixou fora do alcance desta §8 porque corrigir significa dividir o
runbook, o que é refactor com risco próprio (links, `check-runbook-drift`,
`check-doc-refs`). Registrado aqui para não ser herdado em silêncio.
