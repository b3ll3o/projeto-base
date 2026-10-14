# Achados verificados — pendências pré-gate

> **Companion** de
> [`2026-10-13-pendencias-pre-gate.md`](./2026-10-13-pendencias-pre-gate.md).
> O plano tem limite de 300 linhas por
> [`tamanho-e-revisao.md`](../../../.agents/specs/conventions/tamanho-e-revisao.md)
> e a tabela de achados verificados crescia a cada decisão do usuário.
>
> ⚠️ **A tabela tem uma coluna "Por que não entra neste PR"** que envelheceu
> dentro do mesmo dia: o que era adiamento virou decisão tomada (o usuário
> escolheu dono-do-recurso e throttler). As duas linhas corregidas estão
> marcadas com `~~tachado~~` e apontam para o plano que as implementa.
>
> Um item só entra aqui **medido**: o comando, a data e o número.

## Achado novo, fora do plano

O `ci:local` pulava **`@projeto/shared-types#typecheck`** — 12 tasks em vez de 13,
sem filtro que explicasse. `pnpm typecheck` (o mesmo turbo sem filtro) roda, o
que é exatamente o que a seção 8 do plano principal chama de verde que não
significa nada. Corrigido junto com a T2, e é a razão de o gate existir: nenhum
gate perguntava "falta algum pacote que você devia ter pedido?".

## Achados reportados, re-verificados no disco antes de virar registro

A seção "Pendência herdada" do plano principal avisa que os findings do
workflow interrompido não foram recuperados. Estes foram **re-medidos** um a um
antes de entrarem aqui — e dois não sobreviveram à re-medição, que é o motivo
de a coluna "medido em" existir:

| Achado | Medido em | Situação |
|---|---|---|
| ~~Sem rate limiting~~ — **DECIDIDO 2026-10-13, entra neste PR** | medido antes: `grep -rn "throttl\|rateLimit" apps/api/src --include=*.ts -il` → vazio; `grep -n throttler apps/api/package.json` → vazio | a linha "PR próprio, e decidir o número é decisão de produto" envelheceu no mesmo dia em que o usuário decidiu o contrário. A implementação está **BLOQUEADA**: `pnpm --filter @projeto/api add @nestjs/throttler` foi negado pelo classificador de permissão do harness (dependência externa nova, sem aprovação explícita da origem do pacote). Decisões de desenho já tomadas e registradas no [plano da mudança](./2026-10-13-idor-rate-limit.md) |
| ~~IDOR em `GET /users/:id`~~ — **CORRIGIDO 2026-10-13, entra neste PR** | medido ao vivo antes da correção: um token válido da conta A recebia `200`/`204` sobre o id da conta B nas 5 rotas por-id (`GET :id`, `PATCH`, `DELETE`, `restore`, `:id/history`) | a linha "correção exige decidir o modelo de autorização, que é mudança de produto" era a **pendência**, não o destino: o usuário decidiu dono-do-recurso. `UserOwnershipGuard` + a política `exigirPropriedade`, com a decisão de produto sobre a listagem registrada no [plano da mudança](./2026-10-13-idor-rate-limit.md) |
| Imagem de produção resolve dependência nenhuma | `apps/api/Dockerfile:42` — `RUN pnpm prune --prod` corta justamente o `node_modules` que a linha `:41` copiou | mexe em `Dockerfile`/`docker-compose`, que o `docker-prod-specialist` audita em separado |
| A regex de pureza do domínio só pega import de **linha única** | `tooling/scripts/stack-code-reviewer.ts:89` — `/^import .* from ['"]([^'"]+)['"]/`, aplicada linha a linha: `import {\n a,\n} from 'node:fs'` escapa do filtro | conserto precisa casar multilinha sem dar falso positivo em `import type` — mudança em gate, com spec própria |
| `doc-sync` aponta para um arquivo que **não existe no repo** | `.gitignore:11` ignora `apps/api/openapi.json`; `.agents/agents/doc-sync.md:74` e `:143` o citam | o artefato é gerado; o conserto é o agent dizer "gere antes de revisar" |
| markdownlint não está ligado em ponto nenhum | `grep -rn "markdownlint" package.json .tooling/scripts/ci/*.ts` → vazio | decisão de harness (ligar em qual hook?), não de bugfix |
| G-004 — `pnpm -r test --coverage` continua em 3 lugares | `.agents/skills/state-aware-planning/SKILL.md:66`, `:133` e `.agents/specs/conventions/state-aware-planning.md:109` | mudança de convenção é PR de convenção |

⚠️ **Dois achados não sobreviveram e foram descartados**, e vale registrar
porque o erro seria invisível: um deles afirmava que
`ux-design-specialist.md:127` diz "187" onde são 189 — o número 187 **não
aparece** no arquivo, e `git log` mostra que ele não muda nesta branch; o outro
citava `stack-code-reviewer.ts:65` para a regex de linha única, que hoje está
na `:89` (a `:65` é o comentário da allow-list, escrito pela correção do
G-007). Um achado que só aponta para linha errada não está errado por
pouco — está errado, e o `file:line` é justamente o que dá a ele autoridade.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
**Versão do documento:** 1.0
**Status:** Em execução
