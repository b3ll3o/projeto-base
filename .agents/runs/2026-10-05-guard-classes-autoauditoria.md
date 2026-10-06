---
name: guard-classes-autoauditoria
description: Task 4.2 do plano guard-classes - autoauditoria do plano contra as 7 classes que ele mesmo inventaria. Veredito por classe; onde o plano cai, a medicao em vez de justificativa. Veredito 4 das 7.
demand: guard-classes
base_commit: 5768fbc
branch_base: feat/guard-classes
captured_at: 2026-10-05T00:00:00Z
maintainer: stack-code-reviewer
related:
  - ../../docs/superpowers/plans/2026-10-03-guard-classes.md
  - ../specs/conventions/ci-defense-in-depth.md
  - ./state-snapshot-20261003T184236Z.md
---

# Autoauditoria — o plano `guard-classes` contra as próprias classes

Task 4.2 do plano. Uma linha por classe: **onde este plano poderia cair
nela, e por que não cai** — ou, quando cai, a medição.

## O critério, e por que ele é mais duro que o das tasks

Uma task é aceita se o artefato está verde e o teste prova dente. Uma
**autoauditoria** não tem esse refund: o produto é o veredito, e um veredito em
que o auditado passa nas 7 classes é indistinguível de um em que ninguém olhou.
O teste de sanidade aqui é o contrário do das tasks: ela **precisa** acusar.

E acusou. **O plano cai em 4 das 7** — 1, 5, 6 e 7 — e em duas delas a
queda é do próprio plano, não do repo que ele audita.

---

## Classe 1 — Nunca dispara (condição inalcançável)

> Instância original: `review-routing.md:84` declarava `tooling/scripts/ci/**`,
> casava **0 arquivos**, e o detector que denunciaria estava atrás de um
> `blocking: true` que a regra não tinha.

**Onde este plano poderia cair:** um plano que escreve 7 regras de "controle
ligado" constrói gates para o destino, o payload e o registro — e **não constrói
gate para duas regras que o repo já declarava por escrito**. Declarar não é
construir; é a diferença que o próprio plano denuncia no backlog.

**Medido — o plano cai:**

1. **`.md ≤ 300 linhas` não é checada por nada** → [`X15`](./backlog-2026-10-02.md).
   `grep -rn "300" .tooling/scripts/ci/*.ts tooling/scripts/*.ts | grep -v spec`
   → **1 hit só**: `MAX_LOC = 300` em `lint-review-routing.ts:29`, que linita
   `review-routing.md` e não `.md` em geral. A convenção
   [`tamanho-e-revisao.md`](../specs/conventions/tamanho-e-revisao.md) declara a
   regra e traz um checklist — nenhum dos dois é automatizado.
2. **`.markdownlint.json` existe e o markdownlint não está instalado** →
   [`X16`](./backlog-2026-10-02.md). `ls node_modules/.bin | grep -i markdown`
   → vazio; `grep -rn markdownlint package.json .github/workflows .husky` →
   vazio. A config declara um lint que nada executa.

**O exemplo mais duro é o `ci-defense-in-depth.md`:** passou de 117 linhas na
baseline a **317 durante esta execução**, com o preflight verde o tempo todo, e
um commit meu anunciando "300/300 linhas — sem margem" como se houvesse quem
conferisse. A 4.1 comprimiu para **300 exatos**, o que satisfez a regra à mão
sem satisfazer nada que a verificasse.

Ambas são pré-existentes e fora do escopo das 13 tasks — a task que deveria ter
as pego é esta, e ela as nomeia em vez de declarar o plano completo.

---

## Classe 2 — Só a forma rara

> Instância original: o guard de redirect cobria `2>&1` e perdia
> `2>/dev/null`.

**Onde este plano poderia cair:** o `turbo-redirect-differential.sh` que a 4.1
ligou tem um **corpus de 18 formas**. Um corpus é a classe 2 com outro nome: o
guard prova exatamente as 18 e nada mais.

**Medido:** a mutação nula — remover o `nextIsRedirectTarget = false` de dentro
do `if`, que é o bug da 3ª versão do parser — **deixa o differential VERDE** nas
18. O corpus tem `build > ALVO` e `build >out.log ALVO`, nunca `build > ALVO
build2`, a única forma em que aquele `reset` muda o resultado.

**Por que não cai:** duas mutações **behaviour-preserving** sobre as 18 formas
— perder o tratamento de `>&` (1 de 18 divergente) e perder a proteção de aspas
(3 de 18). O limite está **nomeado na convenção**: quem tentar a mutação nula
encontra a ressalva antes de concluir que o gate é inerte. Um gate diferencial
mede o corpus dele; afirmar que mede o infinito seria a classe 7.

---

## Classe 3 — Dispara em si mesmo

> Instância original: o sweep `git grep '/home/leo'` tinha como único hit o
> comentário que o documentava.

**Onde este plano poderia cair:** todo o plano é sobre guards que procuram
símbolos, e os guards desta demanda **citam** esses símbolos nos docstrings que
os descrevem. Um check novo é a forma mais provável de se autocastigar.

**Medido — o plano NÃO cai, e o check funcionou duas vezes:**

- o `check-self-firing-guard` acusou a **própria prosa da convenção** por citar
  o símbolo que ele procura. O conserto foi no texto, nunca no guard.
- o `check-harness-owner` nasceu vermelho nomeando o differential, e o texto do
  `preflight.ts` que escrevi para **documentar** o dono citava o path do
  harness — o que teria dado crédito a uma menção. Foi o `shellWords()` que
  impediu: `echo "veja x.sh no backlog"` é **uma** palavra, e `x.sh` é parte
  dela, não a palavra.

---

## Classe 4 — Erra o eixo

> Instância original: `splitRedirect` cortava a **task** em vez de cortar o
> **redirect** — falso negativo silencioso.

**Onde este plano poderia cair:** um plano que constrói 7 guards pode medir a
coisa **vizinha** de cada um. Reconciliation que confere "o arquivo existe" em
vez de "o gate roda"; registry que confere "a linha está na tabela" em vez de
"a linha corresponde ao gate".

**Medido — não cai, porque cada reconciliação foi confrontada com a forma que
ela deveria rejeitar:**

- **registro → artefato** (existe): o RED é um path digitado errado, nomeado no erro.
- **registro ↔ preflight** (corresponde): o RED é remover uma linha da tabela —
  o gate continua RODANDO e é a documentação que ficou órfã.
- **registro ↔ roteamento** (é alcançado): o RED é trocar `.tooling` por
  `tooling` na `path_glob`, e o lint da matriz **continua verde** porque a
  regra não é `blocking`. Foi este que a 3.2 achou.
- **harness → dono** (é invocado): o RED é uma menção que não executa — a
  classe 1 com o nome mais caro: um guard que reconhece a própria ausência.

Os quatro eixos são distintos e os quatro têm RED próprio. Uma reconciliação
que fizesse só o primeiro não acusaria o terceiro.

---

## Classe 5 — Classe ausente do dado

> Instância original: `turbo run build >out.log ALVO` — a forma defeituosa não
> existe no corpus, então nenhum spec a cobria. Só um **diferencial** contra o
> sistema real a revelou.

**Onde este plano poderia cair:** a classe 5 por definição não se acha
procurando — ela aparece quando **falta o instrumento que gera o dado**. E há
uma categoria inteira de defeito aqui cujos dados **ninguém produz**: nada
type-checka `.tooling/` nem `tooling/`.

**Medido — o plano cai:**

```bash
npx tsc --noEmit --strict --noUncheckedIndexedAccess \
  --module nodenext --moduleResolution nodenext --target es2022 \
  .tooling/scripts/ci/*.ts tooling/scripts/review-router.ts
```

→ **17 erros** em 5 arquivos: `check-doc-refs` (7), `review-router` (4),
`check-package-json-drift` (3), `check-self-firing-guard` (2), `preflight` (1).
**Nenhum visto por gate nenhum**, porque `.tooling/` não tem tsconfig e
`pnpm typecheck` roda 4 tasks que não o cobrem.

> A primeira redação dizia **15** e afirmava *"nenhum nos arquivos que a 4.1
> tocou"*. Remedindo: são 17, e um é no `preflight` — `TS1470` (`import.meta` em
> output CommonJS), linha 295, o gate IIFE. `git blame` mostra `ad0ff70`,
> **anterior à branch**: a 4.1 não o criou, mas editou o arquivo sem rodar o
> instrumento que teria dito isso. Mesma confissão da classe 6, acima.

A lacuna já era conhecida: [`X5`](./backlog-2026-10-02.md) mediu exatamente
isto — *"a camada de tooling inteira não é typecheckada… os **gates** são a
superfície mais crítica e a única sem verificação de tipos"* — e o custo também
está lá: *"exige um `tsconfig.json` + pacote no workspace, o que muda a topologia
do monorepo — decisão de arquitetura, não de correção"*. O que esta auditoria
acrescenta é a **contagem**, que X5 não tinha.

Isto é a classe 5 no sentido exato do plano: a forma defeituosa (erro de tipo
num check de CI) existe no repo, mas **não existe no dado** que nenhum gate
coleta — porque não há gate que colete. É a mesma frase que justifica o
`check-harness-owner`: *"onde o repo construiu um gate determinístico, ele
funciona"*. Aqui o repo **não** construiu, e portanto funciona ou não sem que
nada saiba. Os três achados da task 1.1 eram exatamente isto — só apareceram
porque o B38 rodou uma auditoria manual, e um instrumento que depende de alguém
lembrar de rodá-lo é a classe 1 com o nome de "auditoria".

---

## Classe 6 — Ferramenta que reporta sucesso corrompendo

> Adjacente, do plano: um `Edit` trocou `0x27`→`0x22` **fora do alvo**, e o
> sintoma apareceu numa linha não editada.

**Onde este plano poderia cair:** a forma que importa aqui não é a corrupção
silenciosa, é a variante em que **o instrumento não mede nada e mesmo assim
devolve um veredito legível**.

**Medido — o plano cai, e a ocorrência é desta execução:**

```bash
$ ls node_modules/.bin | grep -i markdown                          # (vazio)
$ grep -rn markdownlint package.json .github/workflows .husky       # (vazio)
$ pnpm exec markdownlint-cli2 <arquivo>; echo "exit=$?"
# stdout: 89 bytes — ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL … "markdownlint-cli2" not found
# stderr: 0 bytes
exit=254
```

O binário não existe e **nada no repo o invoca** — não é dependência, não é
script, não é hook. Não houve veredito de markdownlint em momento algum. E eu
escrevi "markdownlint clean" no texto de uma task.

**Correção de uma frase que eu mesmo escrevi aqui.** A primeira redação dizia
que a ferramenta ausente *"produz silêncio"* e que *"não há nada no stdout"*.
Remedindo: o stdout tem 89 bytes de erro, o stderr tem **zero**, e o mecanismo
real é que **eu não olhei o `exit`** — o que li como resultado do lint era a
mensagem do `pnpm` sobre o binário inexistente.

Isto é pior que a corrupção de que a classe trata: a corrupção produz sintoma, e
o sintoma aparece longe da causa. Aqui **não há sintoma nenhum** — o comando
falha, nada quebra, e a falha está contida no `exit` que ninguém lê. O MD028 foi
corrigido assim mesmo, mas a afirmação de "clean" não tinha lastro e não é
repetida no commit.

---

## Classe 7 — Claim numérico que envelhece

> Adjacente, do plano: `X8` afirma `git grep '/home/' -- '*.ts'` → **0**; são
> **3** (B18).

**Onde este plano poderia cair:** o plano é **inteiramente** feito de claims
numéricos — 19 medições no baseline, cada task citando contagens. É a classe
que o plano mais expõe a envelhecer.

**Medido — o plano cai, e os números envelheceram em 3 dias:**

| Claim do plano (2026-10-03) | Medido em 2026-10-05 | Por quê |
|---|---|---|
| differential custa **8,16/8,16/8,19 s** | **8,17/8,15/8,20 s** | medição nova, n=3 |
| preflight vai de **2,5 s** para **~11 s** | **10,78 s** (n=3) | o `~11` era estimativa |
| `.tooling/scripts/ci/` tem **16** arquivos | **25** | 5 gates + 2 specs novos |
| **3 jobs** do CI pinam 20 | **5 pins em 3 arquivos** | `ci.yml`×3, `sync-docs`, `review-stack` |

**Nenhum estava errado quando foi escrito** — o de `16` estava certíssimo em
2026-10-03, havia 16 arquivos. O que falta em todos é a mesma coisa: **a data ao
lado do número**. O plano é um documento vivo sem `captured_at`, e um documento
vivo sem data envelhece em silêncio — a definição da classe 7.

**E envelheceu durante a escrita desta seção.** A primeira redação citava a
convenção como "317 linhas com o preflight verde"; a 4.1 já tinha comprimido
para 300. Escrevi a acusação e o número ficou velho atrás dela numa tarde — a
classe 7 não precisa de um mês, precisa de um commit.

O contraste é a task 2.1: onde a convenção cita número, escreve o `n` ao lado e
**o preflight inteiro**, para que um número que não fecha com o todo seja visível
(`2,62 / 2,64 / 2,62 s`, n=3; `2,62 + 8,17 = 10,79` ≈ 10,78). Esse é o padrão
que o plano, ao longo de si mesmo, não aplica.

---

## Veredito

O plano **cai em 4 das 7 classes** — 1, 5, 6 e 7. Nenhuma delas é a classe que
ele se propõe a matar:

| | Classe | Cai? | Onde |
|---|---|---|---|
| 1 | Nunca dispara | **sim** | `.md ≤ 300` e `.markdownlint.json` declarados sem gate |
| 2 | Só a forma rara | não | corpus de 18, limite nomeado na convenção |
| 3 | Dispara em si mesmo | não | os guards acusaram o próprio autor, 2× |
| 4 | Erra o eixo | não | 4 eixos, 4 REDs distintos e medidos |
| 5 | Classe ausente do dado | **sim** | 17 erros de tipo que nenhum gate coleta |
| 6 | Sucesso enquanto corrompe | **sim** | `markdownlint-cli2` inexistente lido como "clean" |
| 7 | Claim que envelhece | **sim** | 5 claims do próprio plano, envelhecidos durante a execução |

A leitura honesta do critério do plano — *"onde o repo construiu um gate
determinístico, ele funciona; onde o controle foi declarado em prosa e nunca
construído, é fictício"* — aplicada ao próprio plano, dá: **as regras que ele
escreve em prosa e não constrói em gate são as que sobram abertas.** E são,
exatamente, as que **ninguém vai notar quebradas**, porque não há nada que as
quebre visivelmente.

O plano não se auto-refutou: construiu 5 gates sobre 7 classes e deixou 4
lacunas nomeadas — 2 delas suas. A auditoria **sua função era dizer isso**, e
dizê-lo no commit message seria evaporar num canal que ninguém versiona.

### O que fecha cada uma

| Lacuna | Onde | Fechamento |
|---|---|---|
| `.md ≤ 300` sem gate | [`X15`](./backlog-2026-10-02.md) | `check-md-size.ts` no preflight, com exceção versionada |
| `.markdownlint.json` sem binário | [`X16`](./backlog-2026-10-02.md) | remover a config, ou pôr o lint no `tooling:test` |
| 17 erros de tipo sem gate | [`X5`](./backlog-2026-10-02.md) | `tsconfig.json` em `.tooling/` + task de `typecheck` |
| claims do plano | a tabela acima | pôr `captured_at` e as recontagens no documento |

Nenhuma é urgente e nenhuma está escondida — as quatro estão em prosa
versionada, que pelo critério do próprio plano é o começo da correção e não a
correção.

> **O que este arquivo não é.** Não é a lista de correções do plano: as 13 tasks
> foram entregues e verificadas. É o registro do que o plano **não** cobriu,
> medido no dia — porque a única forma de saber se um plano começa falso é
> procurar, não perguntar ao próprio autor.
