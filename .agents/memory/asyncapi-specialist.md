---
name: asyncapi-specialist-memory
description: Memória acumulada do agent asyncapi-specialist — o item 10 é condicional: hoje o repo não tem broker (sonda vazia) e a não-aplicabilidade é declarada na §4 da convenção; se um broker entrar, escrevo o asyncapi.yaml e removo a declaração.
---

# Memória: `asyncapi-specialist`

## Decisões Tomadas

### 2026-11-18 — A declaração canônica é a §4 da convenção; o `dados.md` confirma o fato

**Contexto:** a matriz §2.4 marca o item 10 como `condicional`, e a §4 da
convenção `kit-documentacao.md` é a tabela que declara a não-aplicabilidade
com o motivo. O gate `check-doc-kit` lê **a §4** — o `docs/system-design/dados.md`
§3 não é lido pelo gate.

**Decisão:** a não-aplicabilidade vive na §4; o `dados.md` §3 é a
confirmação do mesmo fato pelo ângulo do desenho de dados ("O PostgreSQL é
o único sistema de registro. Não há fila, não há cache distribuído, não há
busca externa, não há event store"). Os dois precisam concordar; se um
broker entra, os dois mudam — e a §4 é a que o gate lê.

### 2026-11-18 — Item condicional tem três estados, não dois

**Contexto:** o gate da §4 cobra duas direções: gatilho dispara + doc
ausente = erro; gatilho não dispara + declaração ausente = erro; e
declaração presente + gatilho disparando = erro. A terceira é a que passa
despercebida, porque ninguém vai ler o item todo dia.

**Decisão:** o relatório do agent sempre traz `gatilho_disparou`,
`declaracao_presente` e `acao` (`escrever-doc` | `manter-declaracao` |
`remover-declaracao`) — os três campos, sempre, mesmo quando nada muda.
"Não fiz nada" é um resultado explícito e datado, não um silêncio.

### 2026-11-18 — A sonda é o comando; o padrão é a regex

**Contexto:** a §4 da convenção define o gatilho por duas colunas: **Sonda**
(glob de arquivos) e **Padrão** (regex). O gate aplica a regex ao conteúdo
de cada arquivo que casa com o glob.

**Decisão:** o agent roda a sonda antes de qualquer escrita e cola o
resultado no relatório:

```bash
grep -lE '"bullmq"|"kafkajs"|"amqplib"|"@aws-sdk/client-sqs"' \
  package.json apps/*/package.json packages/*/package.json
```

**Consequências:** medido em 2026-11-18, a saída é **vazia** — o repo não
tem broker, e o item 10 é não aplicável **por enquanto**.

## Padrões Descobertos

- A sonda cobre **6** arquivos: `package.json`, `apps/api/package.json`,
  `apps/web/package.json`, `packages/eslint-config/package.json`,
  `packages/shared-types/package.json`, `packages/tsconfig/package.json`.
- O `docs/system-design/dados.md` §5: os 4 eventos de domínio do `users`
  (`user-created`, `user-updated`, `user-deleted`, `user-restored`) **não
  são publicados para fora** — são drenados pelo use case e viram registro
  de auditoria. Ou seja: evento de domínio **não** é canal assíncrono.
- O cache que existe é **in-process**, TTL de **5 s**
  (`shared/infrastructure/security/user-profile-cache.service.ts`) — e ele
  cacheia a autorização junto (o array de permissões), o que o TTL não
  cobre é o veredito da membership. Isso é a razão de não haver broker
  assíncrono: o repo é síncrono por decisão, não por falta.

## Lições Aprendidas

- ❌ Escrever o `asyncapi.yaml` "para deixar o item pronto" — a não
  aplicabilidade declarada é mais honesta que um contrato de canal que não
  existe.
- ❌ Declarar não-aplicabilidade sem o comando da sonda ao lado: a
  declaração envelhece, e sem o comando ninguém reavalia.
- ❌ Confundir evento de domínio (que vira auditoria) com canal de
  mensageria — o repo não publica evento nenhum.
- ❌ Editar a §4 da matriz §2.4 para trocar `condicional` por `obrigatório`
  quando o broker entra: a §4 continua sendo a declaração, e a matriz
  continua dizendo que o item é condicional.

## Sugestões de Evolução

- [ ] Um gate que reconduza a §4 do `kit-documentacao.md` a partir da
  própria sonda, para a não-aplicabilidade não depender de edição manual.
- [ ] Registrar no `dados.md` §3 um link para o `asyncapi.yaml` no dia em
  que o broker entrar, para o leitor não procurar a fila em dois lugares.
