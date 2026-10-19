# Plano — as 6 pendências do `feat/feature-flags`

Data: 2026-10-19 · Base: `71d075f` · Origem: revisão do PR #109

> **Este plano foi REVISADO e 1 dos 6 vereditos originais estava errado.**
> O veredito do P3 — *"não existe o e2e"* — era **falso**: o e2e existe,
> desliga a chave e afirma 201. Eu medi **linha** quando a pergunta é sobre
> **bloco**. Os dois revisores bateram nisso de forma independente, e eu
> confirmei o bloco antes de reescrever qualquer coisa.
>
> Duas pendências **novas** apareceram na revisão, e uma delas é mais séria
> que 4 das 6 originais: o comentário que diz *"D4 em um lugar só"* é mentira,
> porque o guard tem uma segunda implementação da semântica.

---

## §1. Análise — o veredito de cada uma

| # | Pendência | Veredito | Evidência |
|---|---|---|---|
| P1 | `chaveDesligada` em `infrastructure/`, importado de fora do BC | **NÃO É DEFEITO** | viola nenhuma regra escrita nem mecanizada; 20 imports iguais |
| P2 | 400 antes do 404 | **DEFEITO (outro)** | a ordem está certa; a **prosa do contrato** afirma 201 onde hoje é 404 |
| P3 | `empresa` 201 com flag off "fixado por e2e" | **NÃO É DEFEITO** | o e2e existe, desliga a chave e afirma 201. **Veredito anterior estava errado** |
| P4 | tentativa bloqueada sem rastro | **DEFEITO** | issue #111 |
| P5 | `arquivos-suite` não nomeada no CI | **DEFEITO** | e é pior: o gate **afirma** que nada está desatualizado |
| P6 | 2 `fp` abertos na §4 | **NÃO É DEFEITO** | limites declarados e pinados; a §4 admite falso positivo |
| **P7** | *(nova)* "D4 em um lugar só" | **DEFEITO** | o guard **não chama** `chaveDesligada`; tem cópia própria |
| **P8** | *(nova)* catálogo diz "duas portas" | **DEFEITO menor** | o cabeçalho que ele cita diz "TRÊS portas" |
| **P9** | *(nova)* `empresa` fixado só quanto ao status | **DEFEITO menor** | o e2e afirma 201 e não afirma que a empresa/membership nasceu |

### P1 — o import existe, mas não viola nada que exista

O fato é real (`users.controller.ts:58`). O enquadramento era falso:

- **`H4` não existe no repo.** MEDIDO com controle positivo (H1 acha, H4
  não): `grep -rn "H4" .agents/` → **zero**. `H3-H6` é só ponteiro para a
  convenção, e a convenção não rotula regra nenhuma com `H`.
- **A convenção restringe camadas DENTRO de um módulo.** A única regra com
  "❌" tocável seria `application/ nunca importa infrastructure/` — e o
  importador está **em** `infrastructure/`, não em `application/`.
- **Os dois guardiões mecânicos só disparam sob `domain/`.**
  `stack-code-reviewer.ts:81` retorna cedo para fora de `domain/`; o rule
  ESLint `no-domain-imports-from-infra` tem a mesma forma.
- **Não é caso isolado.** MEDIDO: **20** imports de produção atravessam para
  `infrastructure/` de outro módulo (users 6, profiles 5, tenancy 4,
  feature-flags 4, auth 1). Mover a linha 58 deixa 19 idênticos.

⚠️ Este plano **citava uma regra que não existe** para justificar um
movimento. Trocar `grep -v shared` por um filtro que exclui `shared`
corrigiu a minha própria contagem: a primeira versão dizia 45, porque
`[a-z-]+` casa `shared`. Os 20 são o número.

### P3 — eu errei, e a claim do commit era verdadeira

MEDIDO 2026-10-19, o bloco inteiro (`12-onboarding.e2e.spec.ts:724-740`):

```
724  it('`destino.tipo === "empresa"` NÃO é convite — continua 201 com a flag desligada', async () => {
727    await desligarChave('tenancy.invites', false);
736      destino: { tipo: 'empresa', nome: 'Acme Eli', slug: 'acme-eli' },
740    expect(resposta.statusCode).toBe(201);
```

Meu comando foi `grep -n "destino: { tipo: 'empresa'"`, que devolve a
**linha 736** — e eu concluí da adjacência numérica que nenhuma das três
desligava a chave. A 736 está 9 linhas abaixo do `desligarChave` da 727.
**Li o índice e não li o bloco.** É a mesma classe do `fn=8` que o commit
anterior já registrou: corte no eixo errado produz veredito errado com
aparência de medido.

**T2 saiu do plano.** Escrever um e2e para comportamento já fixado em dois
lugares (`12-onboarding.e2e.spec.ts:724` e `users.controller.spec.ts:395`)
seria um teste que nasce verde — a classe que
`positive-test-must-assert-the-skip-state` descreve.

O que **sobra** de P3 é P9, e é uma linha de spec, não uma task.

### P7 — a mentira no comentário que motivated o commit anterior

`71d075f` diz: *"`chaveDesligada` extraído para o guard exporta a semântica D4
[…] numa função só, porque **a segunda cópia dela** é exatamente onde D4 se
perde."*

MEDIDO: **a segunda cópia continua lá.**

```
$ grep -n "chaveDesligada" .../feature-flag.guard.ts
33://  ponto onde `destino.tipo` é conhecido. As DUAS checagens usam `chaveDesligada`:
61:export async function chaveDesligada(          ← a definição

$ grep -c "chaveDesligada(this" .../feature-flag.guard.ts
0                                                  ← o guard NÃO chama
```

E a implementação que ele usa no lugar (linhas 99-102):

```ts
const desligadas = new Set(
  (await this.repositorio.listar()).filter((l) => !l.ativada).map((l) => l.chave),
);
const bloqueada = required.find((chave) => desligadas.has(chave));
```

São **duas** implementações da semântica D4 — semanticamente equivalentes
(uma chave só está desligada se há linha com `ativada: false`), mas escritas
duas vezes. E `chaveDesligada` tem **1 call site** no repo inteiro, enquanto
o guard trata `required[]` (N chaves de uma vez), o que é por que ele nunca
pôde chamar a função de chave única.

### P5 — pior do que o plano dizia

O plano dizia "contada e não nomeada". O gate não **omite** — ele **afirma**.
MEDIDO, mesmo corpo nos dois:

```
$ npx tsx tooling/scripts/pr-refresh-scan.ts --body-file=/tmp/ff-corpo.md --base=main
  0 divergente(s) em 2 claim(s); 2 não mensurável(is) offline — arquivos-suite, testes: …

$ PR_BODY_FILE=/tmp/ff-corpo.md PR_BASE=main npx tsx tooling/scripts/pr-refresh-gate.ts
pr-refresh-gate: 0 claim(s) divergente(s) de 2 reconhecida(s) — nenhuma contagem
desatualizada, e portanto nada a conferir com marcador.          EXIT=0
```

As 2 claims são literalmente **não mensuráveis** e o gate diz que nenhuma está
desatualizada. Pior: o `M` que ele imprime (`2`) **inclui** as que ele não
julga — o denominador de uma divisão cujas partes ele não mediu.

### P10 — *(nova, achada na implementação)* o tripwire da microcopy não alcança 2 das 4 cópias

MEDIDO 2026-10-19, depois de T6 trocar a microcopy: `grep -rn "duas portas" apps`
devolveu **2** hits em spec — `admin-feature-flags.controller.spec.ts` e
`feature-flag.use-cases.spec.ts`, ambos com literais escritos à mão. Ambas as
specs seguiam **vermelhas de verdade** se a tivessem lido do catálogo, e não
leram: o texto é payload. As duas são fixtures que comparam consigo mesmas.

`check-feature-flag-contract` ficou **verde** durante a troca toda. Lendo o
header dele: *"a `descricao` de cada chave vive em DUAS cópias"* — seguido, três
linhas abaixo, por *"`grep` medido: 4 cópias do texto no repositório"*. O gate
**mediu 4, declarou 2** e comparou as 2. É P8 um nível acima: não é a frase que
mente, é a contagem que faz a mentira parecer completa.

As 2 de fora são `admin-feature-flags.controller.spec.ts` e
`feature-flag.use-cases.spec.ts`. Uma delas tem decisão documentada de fixar o
literal como tripwire de microcopy (`feature-flag.use-cases.spec.ts:78-83`), e a
decisão é boa — o literal deve ficar. **O tripwire não tinha onde cair.**

**O que T6 fecha:** as 4 cópias dizem a frase certa.
**O que fica de fora (e é furo novo, não correção):** o gate continuar
comparando 2 de 4. Corrigir isso é trabalho novo — mudar o conjunto que o gate
lê, com risco de recombiná-lo por engano com o fixture das specs (que é a
armadilha óbvia: o gate passaria a ler a spec que ele deveria vigiar). Fica com
issue.

---

## §2. Tarefas

| # | Tarefa | Arquivos | Teste |
|---|---|---|---|
| **T1** | **Corrigir a prosa do contrato** — §8 e §10 passam a descrever as 3 portas trancadas | `contrato-http.md` | reler contra o código; o gate **não serve** (ver §4) |
| **T2** | **`empresa` fixado quanto ao efeito** — o e2e que existe passa a afirmar que a empresa nasceu, não só o 201 | `12-onboarding.e2e.spec.ts` | o próprio e2e |
| **T3** | **O guard passa a usar `chaveDesligada`** — "D4 em um lugar só" vira verdade em vez de sair do comentário | `feature-flag.guard.ts` | spec do guard: multi-chave + D4 |
| **T4** | **O gate nomeia o que não julga** — e o denominador para de contar o que não mediu | `pr-refresh-gate.ts` | 3 specs: denominador, nomeação, e a ausência da contagem duplicada |
| **T5** | **Trilha de bloqueio** — log nos 2 pontos, com `traceId` e **sem** token | `feature-flag.guard.ts`, `users.controller.ts` | spec que injeta token conhecido e afirma que ele não aparece |
| **T6** | **"duas portas" → "três portas"** — as **4** cópias, não 2 | catálogo + contrato §4 + 2 specs | `check-feature-flag-contract` alcança 2; as 2 specs caem por conta própria |

### Ordem e porquê

**T3 e T1 primeiro.** T3 é a mentira mais cara (ela é a razão declarada do
commit anterior) e é a menor: trocar um `Set` inline por um `some` sobre
`required`. T1 é a segunda mentira. T2 é uma linha dentro de um teste que já
existe. T6 é texto, mas tem que andar junto de T1 porque o gate compara as
duas cópias da `descricao`. T4 vem em seguida porque é o conserto mais barato
e mais bem delimitado. T5 é o maior e o único que é decisão de produto.

### T3 — por que isso e não "mover o arquivo"

O plano anterior mandava mover `chaveDesligada` para `application/`, com base
na "lens H4" — que não existe. Além de o movimento não corrigir violação
nenhuma, ele **não** fecharia o P7: a cópia inline continuaria idêntica.
Fazer o guard **chamar** a função fecha as duas coisas de uma vez, é um diff
menor, e não toca importador nenhum.

⚠️ O guard resolve `required[]`, e `chaveDesligada` resolve uma chave. A
forma que fecha sem repetir a semântica é sobre o array:

```ts
for (const chave of required) {
  if (await chaveDesligada(this.repositorio, chave)) throw new NotFoundException();
}
```

⚠️ Custo: `listar()` passa a ser chamado por chave em vez de uma vez. São 1-2
chaves por rota hoje. Se um dia houver dozens, a semântica volta a ser
duplicada por otimização — e o comentário precisa dizer isso.

### T4 — o conserto é dois, e a ordem importa

O plano anterior sugeria só imprimir a linha de não-mensuráveis. Isso, sozinho,
**gera duas contagens que se contradizem no mesmo log**: o gate imprime
`r.errors.length` (divergentes *fora* de parágrafo marcado) e o `resumo`
imprime `claims.filter(divergente).length` (divergentes *no total*). Com um
corpo que tem divergentes parcialmente marcados, o mesmo arquivo diria "3
divergente(s)" e "4 divergente(s)".

Por isso T4 tem duas metades, nesta ordem:

1. **O denominador** deixa de contar o que não mediu: `M` passa a ser só as
   claims com `medido !== null`. Sem isso a linha nova é ruído sobre base errada.
2. **A linha** nomeia as classes não mensuráveis.

E o spec precisa dos **dois** lados: o que a saída diz, e o que ela **não**
pode dizer (duas contagens com a mesma palavra e números diferentes).

### T5 — o que o plano anterior não mediu

MEDIDO: no ponto de bloqueio de `POST /users` **o ator não existe**. O
`JwtAuthGuard` devolve em `jwt-auth.guard.ts:170-171` (`if (isPublic === true)
return true`) **antes** de publicar `req.user` — e o próprio comentário do
controller admite isso (`feature-flag.guard.ts` exige `req.user`, que
`@Public()` nunca publica). Logar "ator" ali é registrar um campo que é
sempre `null`.

O que é logável e correlacionável: `chave`, rota e **`traceId`** — que já
volta ao cliente no corpo do 404 (`global-exception.filter.ts`), então o log
e o erro que o usuário viu apontam para o mesmo lugar.

⚠️ **O token está literalmente no escopo** (`body.destino.token`). Isso não é
nota de prosa: o spec injeta um token conhecido e afirma que ele não aparece
em nenhum argumento do sink.

---

## §3. O que NÃO entra, e por quê

- **Mover `chaveDesligada` para `application/`.** Ver §2/T3: o movimento não
  fecha o P7 e a regra que o justificava não existe.
- **T2 (e2e novo para `empresa`).** Já fixado em dois lugares. O que falta é o
  efeito, não o teste.
- **Fechar os 2 `fp`.** Ver P6.
- **Mudar a ordem 400/404.** Está certa.
- **Gate de drift prosa↔comportamento.** É trabalho novo com limite honesto
  difícil (o par escaneável existe — a §10 é uma tabela com coluna "onde é
  verificado" — mas o gate é novo em espécie). **Issue aberta para não ficar
  órfã**: o P2 é exatamente esse furo, e as issues #110/#111 não o cobrem.

## §4. Um risco que o plano anterior descreveu errado

O plano dizia: *"T1 reescreve prosa que `check-feature-flag-contract` lê
(`descricao` está no §4 do doc)"*.

**Não é o risco.** MEDIDO contra o arquivo real: reescrever a prosa da §8 e
§10 deixa o gate **verde** (`ok=true, errors=0`). O gate só parseia pares
estruturados (`"chave"`, `"descricao"`); nenhuma regex toca prosa.

O risco real é o oposto do que está escrito: **qualquer exemplo JSON
`chave`/`descricao` que T1 adicione fora da §4** quebra o gate, e quebra
fechado. E é exatamente o que T1 produz naturalmente ao documentar as três
portas. Como o pareamento é **por posição**, uma inserção desbalanceada
desloca todo o resto.

⚠️ Consequência maior, e é a que importa para T1: **o gate não pode ser o
teste de T1**, porque o plano acabou de medir que ele é cego para a classe de
defeito que T1 existe para corrigir. Ele vai ficar verde com a prosa
mentindo. O teste de T1 é reler a prosa contra o código e rodar o e2e que a
contradiz — e é por isso que o furo de drift fica com issue, e não com um
teste que finge cobrir.
---

## §5. O que a implementação mediu (MEDIDO 2026-10-19)

Verde não é prova de dente. Cada mutação abaixo foi aplicada no código real e a
suíte rodada; a coluna da direita é **quais** testes caíram, não quantos — uma
mutação que derruba 3 testes, sendo 2 pelo motivo errado, não prova nada.

| Mutação | expectation | O que caiu |
|---|---|---|
| `chaveDesligada` volta ao `Set` inline no guard (P7) | D4 num lugar só | 2 vermelhos: chave ausente = ligada; chave presente = desligada |
| o log passa a levar `${request.url}` (vaza o token) | rastro sem segredo | 1 vermelho, **na asserção do token** — não no `rejects.toBeInstanceOf` |
| denominador volta a `claims.length` (P5/T4) | fração só do medido | 2 vermelhos, os 2 de denominador; a spec de nomeação segue **verde** |
| `linhaNaoMensuraveis` neutralizada | nomear o que não julga | 1 vermelho, o de nomeação |
| gate passa a imprimir `relatorio.resumo` também | uma contagem só | 1 vermelho, o de "não imprime duas vezes" |

⚠️ A 3ª linha é a que mais vale: a spec de nomeação **não** pega a mutação do
denominador, porque a palavra (`medida(s)`) e a conta (`mensuraveis.length`) são
mudanças separadas. Ela pega o *renomear*, não a *contagem*. Duas specs, duas
coisas — e o comentário da spec diz qual é qual, porque um teste que se-credita
de cobrir um defeito que ele não cobre é pior do que nenhum.
