# Plano — os acertos da revisão do PR #147

> Data: 2026-11-09 · Branch: `fix/10-issues-p1-scan-2026-11-02` · PR: #147
> Origem: comentário de revisão do PR (35 achados: 1 P0, 7 P1, 27 P2).

## O que este plano é

A revisão do PR #147 mediu 35 furos. Este plano fecha **os 35**. Nenhum achado
foi julgado "estilo" ou "depois": os que são P0/P1 saem primeiro, e os P2
saem porque a regra do repo é que um doc que mente é defeito e um achado
medido não pode ficar sem conserto.

Duas decisões foram tomadas pelo dono do repo (2026-11-09):

1. **O histórico git NÃO é reescrito.** A senha publicada
   (15 caracteres) fica no histórico público, e é declarada
   como credencial QUEIMADA no ADR-0007 e no corpo do PR. Justificativa
   medida: com o mínimo novo em 24 caracteres, ela não autentica mais nenhum
   papel; e a migration `20261108000001` limpa (`PASSWORD NULL`) o hash em
   todo banco que rodou a versão velha. Reescrever `main` num repositório
   público quebra todos os clones e todos os PRs abertos — custo maior que o
   furo que fecha.
2. **O re-login revoga o refresh token anterior**, antes de gravar o novo.

## As 6 ondas

### Onda 0 — a credencial (P0 + 3 P2 do mesmo bloco)

O P0: o mínimo de 24 caracteres é indexado pelo **usuário da URI**, mas a
senha é escrita nos **papéis fixos** (`app_runtime`, `app_system`). Um
`DATABASE_URL=postgresql://runtime:<15 chars>@…` burla o filtro, e o script
aplica a senha curta no papel de runtime. MEDIDO pelo revisor: o guard
devolve `{"ok":true}` para uma URI cujo usuário não é um papel gerenciado.

- `apps/api/scripts/prepara-papeis.sh`
  - a URI tem de apontar para o papel que o script escreve: `usuario_runtime`
    = `app_runtime` e `usuario_sistema` = `app_system`; senão, recusa;
  - o mínimo de 24 passa a ser do **PAPEL** (sempre gerenciado), não do
    usuário da URI;
  - a medição passa a ser em **bytes UTF-8 nos dois lados** — o `sh` do
    container conta bytes e o TypeScript contava unidades UTF-16 (P2: `"😀"×6`
    passava no script e era recusado no guard);
  - a URI deixa de ser **argv** do `node -e` e passa por env (P2: a senha
    aparecia em `ps`/`/proc/*/cmdline`).
- `apps/api/src/shared/infrastructure/prisma/credenciais-do-banco.ts` — a
  mesma coupling no guard de boot.
- `apps/api/src/shared/infrastructure/prisma/papel-de-runtime.spec.ts` — o
  harness passa a comparar a lista do shell com a constante do TypeScript
  (`PAPEIS_COM_SENHA_GERIDA`), e não com a si mesma (P2).

### Onda 1 — migration e ambiente (1 P1 + 3 P2)

- `20261108000001_papel_runtime_sem_senha_publicada/migration.sql` — o
  `ALTER ROLE … NOLOGIN PASSWORD NULL` cru falha quando o papel não existe, e
  uma migration falha trava todo `migrate deploy` seguinte. Vai para dentro
  de um `DO $$ … IF EXISTS … $$`.
- `.env.production.example` — o bloco afirma que "a senha vive versionada em
  texto puro", que é exatamente o que o PR desfaz (P1).
- `apps/api/.env.example` — "a senha abaixo é a de DEV que a migration cria"
  é falso desde a #118 (P2).
- `docs/como-rodar.md` — o ponteiro do aviso aponta para §1.2.1 (P1).

### Onda 2 — o gate do healthcheck (3 P1 + 3 P2)

`.tooling/scripts/ci/check-docker-healthcheck-binary.ts`:

- `sh -c "curl …"` passa porque o primeiro token é `sh` (nativo) — o gate
  desce um nível e extrai o binário de dentro do `-c` (P1);
- os overlays são fundidos num `target` só, e o último (alfabético) vence — o
  gate passa a medir o par **serviço × target** de cada overlay (P1);
- um serviço que existe só no overlay nunca é verificado (P1);
- `HEALTHCHECK NONE` vira erro — é "sem probe" (P2);
- serviço sem `build.target` é pulado — sem `target`, o Docker constrói o
  **último** stage do Dockerfile (P2);
- Dockerfile fora de `apps/<nome>/Dockerfile` nunca é medido — resolver pelo
  `build.dockerfile` do serviço (P2).

### Onda 3 — dentes para os consertos de Docker (2 P2)

O `ENV HOSTNAME=0.0.0.0` do web (#138) e o `COPY` não achatado da api
(#128) não têm nenhum gate nem spec: alguém remove e o defeito volta.

- `apps/api/src/Dockerfile.spec.ts` — `prisma/` e `scripts/` chegam em
  `apps/api/prisma` e `apps/api/scripts` (e não achatados).
- spec novo do web — `ENV HOSTNAME=0.0.0.0` no stage `prod`.

### Onda 4 — o web (5 P2)

- `app/users/actions.ts` — cookie **vazio** conta como token presente; o
  guard da casa (`lib/sessao.ts`) diz o contrário.
- `app/users/actions.ts` — 401 `INVALID_TOKEN` é o estado final desejado, e
  não "a API não revogou".
- `lib/api-client.ts` — `baseUrlDaApi()` exportado, e as 11 ocorrências do
  literal `API_BASE_URL ?? '…'` apontando para ele (DRY).
- `app/login/actions.ts` — o re-login revoga o refresh token anterior.
- `apps/web/e2e/f19-sair.spec.ts` + a linha no inventário de fluxos — o lado
  do web do logout não tinha e2e nenhum.

### Onda 5 — os testes da API (2 P1/P2)

- `prisma-refresh-token.repository.integration.spec.ts` — a **atomicidade** da
  rotação (que o PR vende) não tem dente: a mutação que tira a transação
  deixa a suíte verde. O teste injeta a falha ENTRE o consumo e o registro e
  afirma que o token antigo continua ATIVO.
- o mesmo arquivo — `rejects.toThrow()` sem matcher: qualquer erro passa.
  Passa a afirmar o código do Postgres (42501).

### Onda 6 — doc, memória e corpo do PR (8 P2 + 2 P1)

- `.agents/agents/docker-specialist.md` — o exemplo do bloco `Outputs` ainda
  mostra `wget`, contra a regra escrita 57 linhas acima.
- `.agents/memory/docker-specialist.md` — o ENTRYPOINT registrado não é o
  real.
- `.agents/skills/docker/SKILL.md` — cita um arquivo que não existe.
- `.agents/specs/conventions/ci-defense-in-depth-dentes.md` — "11 testes" e
  "os dois diferenciais" contra 18 e 3 medidos.
- `.github/dependabot.yml` — o comentário afirma que o gate confere a tag
  contra o SHA; ele confere só o FORMATO do ref.
- `docs/web/rotas.md` — a action `sair` é a única sem verbo HTTP, e o PR
  acabou de acrescentar um.
- `docs/adr/0007-refresh-token-revogavel.md` — a credencial publicada está
  queimada; o histórico não foi reescrito.
- `.gitignore` — a negação é no-op para os dois arquivos versionados e
  reabre a pasta para artefato novo.
- idioma — 3 frases em inglês (`presented whose`, `consume`, "o regex
  **acima**" pendurado).
- corpo do PR — `Closes #130`…`#139`, e "um arquivo novo" (são 22).

## O que foi medido, depois da execução

Cada correção tem uma medida que a fecha — e, quando o conserto é um gate ou
uma spec, a **mutação** que desfaz o conserto e a deixa vermelha.

| Onda | A medida |
|---|---|
| 0 | `sh scripts/prepara-papeis.sh` com `DATABASE_URL=postgresql://runtime:<15 chars>@…` → **exit 1**, com o motivo no stderr (`a URI nomeia 'runtime' e não o papel 'app_runtime'`). E a spec `papel-de-runtime.spec.ts` roda o filtro no `sh` de verdade (25 casos) |
| 1 | a migration de rotação roda num Postgres 16 real: papel ausente → o `DO` passa; papel presente → `rolcanlogin = f` e `rolpassword IS NULL = t` |
| 2 | 4 mutações do gate, 1 spec cai em cada: sem descer um nível no `sh -c` → 2 caem; fundir os overlays → 1; pular o serviço só do overlay → 1 |
| 3 | 6 mutações dos Dockerfiles, 1 spec cai em cada (`COPY` achatado, `COPY` com destino errado, `HOSTNAME` removido, `HOSTNAME` trocado, probe virado `curl`) |
| 4 | o e2e novo (F19) roda **2/2** com um CONTROLE: o mesmo refresh token renova (201) com a sessão viva e é recusado (401 `INVALID_TOKEN`) depois do "Sair" |
| 5 | a mutação que tira a transação da rotação deixa **1 spec** vermelha (a da atomicidade) e as outras 10 verdes |
| 6 | `git check-ignore -v` nos 4 caminhos do `.gitignore` (os 2 versionados: NÃO IGNORADO; os 2 novos: IGNORADO) e `git grep` do literal publicado → 0 arquivos |

A suíte inteira, depois de tudo:

```
$ pnpm ci:preflight
⚠ 0 erro(s); 1 check(s) não rodaram (skipped)
$ pnpm --filter @projeto/api test:unit          → Tests  1128 passed (1128)
$ pnpm --filter @projeto/api test:coverage      → All files | 88.11 | 92.07 | 89.57 | 88.11
$ pnpm --filter @projeto/api test:integration   → Tests  176 passed (176)
$ pnpm --filter @projeto/api test:e2e            → Tests  122 passed (122)
$ pnpm --filter @projeto/web test:unit           → Tests  401 passed (401)
$ pnpm tooling:test                              → Tests  863 passed (863)
$ pnpm ci:boot                                   → API :33283 · web :40033 (health: ok)
```

## Como a execução foi feita

Ondas independentes, em arquivos separados, executadas em paralelo. Cada
subagente recebeu o arquivo exato, o comportamento esperado e o comando que
prova. O{main} commit é feito depois de a suíte inteira passar.

## O que este plano NÃO faz

- **Não reescreve o histórico git** (decisão do dono do repo, acima).
- **Não** roda `docker build` — as medições de imagem são estáticas (o
  `docker build` não roda no CI, e o `docker stop` com a imagem de verdade
  foi medido no PR original).
- **Não** mede Postgres gerenciado (RDS/Cloud SQL), onde o papel de
  migration não é superuser — o aviso já está na migration e no
  `.env.example`.
