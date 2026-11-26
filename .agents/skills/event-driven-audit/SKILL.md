---
name: event-driven-audit
version: 1.0.0
updated: 2026-11-26
description: "Processo determinístico de auditoria da arquitetura event-driven da aplicação — inventário de eventos de domínio, nome canônico e versionamento do contrato, quem emite, quem consome (handler nomeado), escrita direta de efeito colateral pela camada application, segredo no payload e atomicidade entre a mutação e o registro. Carregado por `event-driven-auditor` quando a task é de auditoria (não criação). Para scan periódico ou pré-merge, despache o `event-driven-auditor` direto."
---

# Skill: event-driven-audit

> **Quem invoca:** `event-driven-auditor` (papel, princípios e anti-padrões ficam
> no agent; este arquivo é só o **processo**).
>
> **Quando invocar:** auditoria periódica, pré-tag, pré-merge de um PR que
> toca `domain/events/`, ou on-demand ("a aplicação é event-driven?").
>
> **Read-only e offline.** Nenhum comando escreve no banco, no código ou no
> git. O único bloco que precisa de toolchain é o do gate, e ele é `skip`
> justamente por isso.
>
> **Código de saída.** `grep` devolve **1 quando não acha** — num sweep de
> eventos isso é o resultado esperado quando não há o que achar. Só conta como
> erro de execução se o `2` aparecer (arquivo/flag inválido).

## Inputs (do controller)

```yaml
task:
  description: "<auditoria da arquitetura event-driven>"

context:
  scope: "evento|modulo|app"   # app = todos os módulos
  modules_path: "apps/api/src/modules/"
  registro: ".tooling/scripts/ci/excecoes-event-driven.json"
```

Todos os comandos assumem **cwd = raiz do repo**.

## Passo 1 — O veredito (o gate)

```bash
# [gate: skip — precisa do toolchain (tsx) para rodar o gate da regra]
pnpm tsx .tooling/scripts/ci/check-event-driven.ts
```

O gate é o veredito; este passo é o comando que o produz. O resultado sai em
`errors` (defeito no código medido) e `advisories` (ressalva sobre a própria
medição — **violação declarada no registro aparece aqui, e não é erro**).

⚠️ Se o gate não roda, a auditoria **não pode ser só o gate**: o Passo 2 mede
o mesmo objeto por outro caminho, e é ele que diz se o gate deixou de ver
alguma coisa.

## Passo 2 — Inventário de eventos (o que existe)

```bash
# [gate: run — mede o inventário de eventos de domínio, que é o objeto da auditoria]
find apps/api/src/modules -path '*/domain/events/*.event.ts' | sort
echo "--- total de eventos ---"
find apps/api/src/modules -path '*/domain/events/*.event.ts' | wc -l
```

`total = 0` é **achado**, não aprovação: a regra exige que a mudança de
estado vire evento, e zero evento significa que nada é event-driven ainda
(ou que o caminho dos eventos mudou — o que exige rever a regra).

## Passo 3 — O contrato declarado (nome e versão)

```bash
# [gate: run — mede o nome canônico e a versão declaradas de cada evento]
grep -rn "readonly eventName" apps/api/src/modules --include=*.event.ts | sort
echo "--- eventos sem a versão vN no nome ---"
grep -rn "readonly eventName" apps/api/src/modules --include=*.event.ts | grep -vE "\.v[0-9]+'" | wc -l
```

O nome esperado é `<bc>.<agregado>.<ação>.vN`, e o prefixo vem do **caminho do
arquivo** (diretório do módulo + nome do arquivo). A checagem completa é a do
gate; aqui o que se vê é o **nome declarado**, para comparar com o esperado à
mão quando o gate acusar.

## Passo 4 — Quem consome (o handler nomeado)

```bash
# [gate: run — mede quais eventos têm consumidor na camada application]
for f in $(find apps/api/src/modules -path '*/domain/events/*.event.ts'); do
  base=$(basename "$f" .event.ts)
  classe=$(echo "$base" | awk -F'-' '{printf "%s%sEvent", toupper(substr($1,1,1)), substr($1,2)}')
  if grep -rq "$classe" apps/api/src/modules/*/application --include=*.ts 2>/dev/null; then
    echo "COM HANDLER  $classe  $f"
  else
    echo "SEM HANDLER  $classe  $f"
  fi
done
```

`SEM HANDLER` é **finding P1** quando o evento é novo, e **dívida declarada**
quando está no registro de exceções. A diferença é o registro: a auditoria
confere se a entrada existe, e não se o evento é do agrado de quem audita.

⚠️ Este grep é **MAIS LOOSE** que o gate: ele acha a referência à classe, e o
gate exige que o arquivo **importe a classe e a use** (um `import` sem uso não
é consumidor). A divergência entre os dois é esperada — o grep é o inventário
rápido, o gate é o veredito.

⚠️ E o grep acha a **referência**, não o handler que funciona. Um arquivo que
importa a classe e não faz nada passa. A pergunta que fecha é *"o que muda no
mundo quando este evento é publicado?"*.

## Passo 5 — Efeito colateral escrito direto

```bash
# [gate: run — mede a escrita de efeito colateral direto pela camada application]
grep -rn "auditService\.\(record\|archive\)(" apps/api/src/modules/*/application --include=*.ts 2>/dev/null | grep -v "\.spec\.ts" || echo "NENHUMA escrita direta de efeito colateral na camada application"
```

O caminho event-driven é: a application **publica**, o handler **escreve**.
Uma escrita direta na application é **finding P1** — e a exceção conhecida
(`TODO(#184)`, o caminho de tenancy) está no registro.

## Passo 6 — O segredo no payload

```bash
# [gate: run — mede se algum evento carrega campo de segredo no payload]
grep -rniE "\b(senha|senhaHash|password|passwordHash|refreshToken|accessToken|secret|credencial)\b" apps/api/src/modules/*/domain/events --include=*.event.ts || echo "NENHUM campo de segredo em evento de domínio"
```

Evento sai do processo — log, fila, arquivo de auditoria, terceiro. O que
entra nele sai junto. Achado aqui é **P0**: o segredo já pode ter vazado para
onde o evento foi.

## Passo 7 — A atomicidade (ED8)

```bash
# [gate: run — mede se a trilha de auditoria continua na mesma transação da mutação]
grep -rn "gravarAuditoria" apps/api/src/modules/users/infrastructure/persistence/*.ts | grep -v "\.spec\.ts" || echo "SEM gravarAuditoria no repositório de usuário"
grep -rn "auditService.record" apps/api/src/modules/users/application/user-use-cases.ts | grep -v "\.spec\.ts" || echo "NENHUMA chamada direta ao auditService na application de usuário"
```

A **prova** da atomicidade é o spec de integração
(`apps/api/src/modules/users/infrastructure/persistence/invariantes-da-conta-no-banco.integration.spec.ts`),
e não este grep: o grep diz que o caminho existe, o spec diz que a transação é
a mesma. Se os dois divergirem, é o spec que vale.

## Passo 8 — O registro de exceções

```bash
# [gate: run — mede o tamanho do registro de exceções e quantas entradas são de evento]
echo "--- entradas no registro ---"
grep -c '"regra"' .tooling/scripts/ci/excecoes-event-driven.json
echo "--- entradas de ED5 (evento sem handler) ---"
grep -c '"regra": "ED6"' .tooling/scripts/ci/excecoes-event-driven.json
```

⚠️ O gate **acusa a exceção que parou de valer** (o defeito foi corrigido e a
entrada ficou). Registro que só cresce é registro que envelhece em silêncio.

## Saída

- `findings.yaml` com a lista canônica (id, title, severity, location, cause,
  impact, evidence, fix)
- Sucesso = `findings_count` numérico; nenhum comando retornou código não-zero
  sem tratamento; todo `wc -l` acompanhado do valor esperado (0 num conjunto
  que deveria ter linhas é **achado**, não aprovação)

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| Passo 2 devolve **0** eventos | o caminho dos eventos mudou, ou o módulo foi movido | conferir `find apps/api/src/modules -path '*/domain/events/*.event.ts'`; **0 eventos é achado**, não verde |
| Passo 4 diz `SEM HANDLER` para um evento do `users` | o consumo é genérico (`endsWith`), não por classe | isso é a **Fase 1** do plano; até lá, está no registro |
| Passo 5 devolve a chamada do `TODO(#184)` | a dívida conhecida | não é achado novo; é a exceção declarada |
| Passo 3 devolve 0 eventos sem `vN` | o grep do nome não casou | conferir o padrão: o `vN` está DENTRO da string do `eventName` |
| O gate reprova e o Passo 2 não mostra nada | o gate mede a árvore de produção e o grep mede o disco | conferir se o arquivo está em `domain/events/` e é `.event.ts` |

## Referências

- Agent: `.agents/agents/event-driven-auditor.md` (papel, coordenação, anti-padrões)
- Regra: `.agents/specs/conventions/event-driven.md`
- Gate: `.tooling/scripts/ci/check-event-driven.ts`
- Registro: `.tooling/scripts/ci/excecoes-event-driven.json`
- Plano: `docs/superpowers/plans/2026-11-26-event-driven.md`
