---
name: guard-classes-autoauditoria
description: Task 4.2 do plano guard-classes - autoauditoria do plano contra as 7 classes de guard que ele mesmo inventaria. Versao o veredito por classe e, onde o plano cai em alguma delas, traz a medicao em vez de justificativa. Registra que o plano cai em 4 das 7.
demand: guard-classes
base_commit: 172521d
branch_base: feat/guard-classes
captured_at: 2026-10-05T00:00:00Z
maintainer: stack-code-reviewer
related:
  - ../../docs/superpowers/plans/2026-10-03-guard-classes.md
  - ../../docs/superpowers/plans/2026-10-03-guard-classes-baseline.md
  - ../specs/conventions/ci-defense-in-depth.md
  - ./state-snapshot-20261003T184236Z.md
---

# Autoauditoria — o plano `guard-classes` contra as próprias classes

Task 4.2 do plano. Uma linha por classe: **onde este plano poderia cair
nela, e por que não cai** — ou, quando cai, a medição.

## O critério, e por que ele é mais duro que o das tasks

Uma task de implementação é aceita se o artefato está verde e o teste prova
dente. Uma **autoauditoria** não tem esse refund: o produto é o veredito, e um
veredito em que o auditado passa nas 7 classes é indistinguível de um veredito
em que ninguém olhou. Por isso o teste de sanidade desta auditoria é o
contrário do das tasks: ela **precisa** acusar alguma coisa.

E acusou. **O plano cai em 4 das 7** — 1, 5, 6 e 7 — e em duas delas a
queda é do próprio plano, não do repo que ele audita.

---

## Classe 1 — Nunca dispara (condição inalcançável)

> Instância original: `review-routing.md:84` declarava `tooling/scripts/ci/**`,
> casava **0 arquivos**, e o detector que denunciaria estava atrás de um
> `blocking: true` que a regra não tinha.

**Onde este plano poderia cair:** um plano que escreve 7 regras de
"controle ligado" constrói gates para o destino, o payload e o registro — e
**não constrói gate para duas regras que o repo já declarava por escrito**.
Declarar não é construir; é a mesma diferença que o plano denuncia no
backlog.

**Medido — o plano cai:**

1. **`.md ≤ 300 linhas` não é checada por nada** → registrado como
   [`X15`](./backlog-2026-10-02.md).
   `grep -rn "300" .tooling/scripts/ci/*.ts tooling/scripts/*.ts | grep -v spec`
   → **1 hit só**: `MAX_LOC = 300` em `lint-review-routing.ts:29`, que linita
   `review-routing.md` e não `.md` em geral. A convenção
   [`tamanho-e-revisao.md`](../specs/conventions/tamanho-e-revisao.md) declara
   a regra e traz um checklist — nenhum dos dois é automatizado. Este próprio
   arquivo de convenção ficou **317 linhas** com o preflight verde, e há um
   commit meu anunciando "300/300 linhas — sem margem" como se houvesse quem
   conferisse.
2. **`.markdownlint.json` existe e o markdownlint não está instalado** →
   registrado como [`X16`](./backlog-2026-10-02.md).
   `ls node_modules/.bin | grep -i markdown` → vazio;
   `grep -rn markdownlint package.json .github/workflows .husky` → vazio.
   A config declara um lint que nada executa.

**Por que não é auto-refutação:** as duas são **pré-existentes** e estão fora
do escopo declarado das 13 tasks. A task que deveria ter as pego — "auditar o
plano contra as próprias classes" — é esta, e ela as **nomeia** em vez de
declarar o plano completo. O que faltava era o gate, e gate novo é change
próprio.

---

## Classe 2 — Só a forma rara

> Instância original: o guard de redirect cobria `2>&1` e perdia
> `2>/dev/null`.

**Onde este plano poderia cair:** o `turbo-redirect-differential.sh` que a 4.1
ligou tem um **corpus de 18 formas**. Um corpus é a classe 2 com outro nome: o
guard prova exatamente as 18 e nada mais.

**Medido:** a mutação nula — remover o `nextIsRedirectTarget = false` de
dentro do `if`, que é o bug da 3ª versão do parser — **deixa o differential
VERDE** nas 18 formas. Motivo: o corpus tem `build > ALVO` (uma task depois) e
`build >out.log ALVO` (alvo colado), nunca `build > ALVO build2`, que é a única
forma em que aquele `reset` muda o resultado.

**Por que não cai:** duas mutações que **são** behaviour-preserving sobre as 18
formas encontradas e medida — perder o tratamento de `>&` (1 de 18 divergente) e
perder a proteção de aspas (3 de 18). O limite está **nomeado na convenção**,
não escondido: um leitor que tentar a mutação nula encontra a ressalva antes
de concluir que o gate é inerte. Um gate diferencial mede o corpus dele;
afirmar que mede o infinito seria a classe 7.

---

## Classe 3 — Dispara em si mesmo

> Instância original: o sweep `git grep '/home/leo'` tinha como único hit o
> comentário que o documentava.

**Onde este plano poderia cair:** todo o plano é sobre guards que procuram
símbolos, e os próprios guards desta demanda **citam** esses símbolos nos
docstrings que os descrevem. Um check novo é a forma mais provável de se
autocastigar.

**Medido — o plano NÃO cai, e o check funcionou duas vezes:**

- o `check-self-firing-guard` acusou a **própria prosa da convenção** por citar
  o símbolo que ele procura. O conserto foi no texto, nunca no guard.
- o `check-harness-owner` nasceu vermelho nomeando o differential, e o texto
  do `preflight.ts` que eu escrevi para **documentar** o dono citava o path do
  harness — o que teria feito o check dar crédito a uma menção. Foi o
  `shellWords()` (tokenização com noção de aspas) que impediu: `echo "veja
  x.sh no backlog"` é **uma** palavra, e `x.sh` é parte dela, não a palavra.

**Veredito:** aqui o plano é melhor do que a média — o guard que deveria se
acusar **acusou**, duas vezes, e as duas correções foram no documento.

---

## Classe 4 — Erra o eixo

> Instância original: `splitRedirect` cortava a **task** em vez de cortar o
> **redirect** — falso negativo silencioso.

**Onde este plano poderia cair:** um plano que constrói 7 guards pode medir a
coisa **vizinha** de cada um. Reconciliation que confere "o arquivo existe" em
vez de "o gate roda"; registry que confere "a linha está na tabela" em vez de
"a linha corresponde ao gate".

**Medido — o plano não cai, porque cada reconciliação foi confrontada com a
forma que ela deveria rejeitar:**

- **registro → artefato** (existe): o RED é um path digitado errado, e o erro
  nomeia o path.
- **registro ↔ preflight** (corresponde): o RED é remover uma linha da tabela —
  o gate continua RODANDO e é a documentação que ficou órfã.
- **registro ↔ roteamento** (é alcançado): o RED é trocar `.tooling` por
  `tooling` na `path_glob`, e o lint da matriz **continua verde** porque a
  regra não é `blocking`. Foi este que a 3.2 achou: a rota existe, o lint
  passa, e nenhum arquivo de CI tem revisão despachada.
- **harness → dono** (é invocado): o RED é uma menção que não executa, que é a
  classe 1 com o nome mais caro — um guard que reconhece a própria ausência.

Os quatro eixos são distintos e os quatro têm RED próprio. Uma reconciliação
que fizesse só o primeiro não acusaria o terceiro.

---

## Classe 5 — Classe ausente do dado

> Instância original: `turbo run build >out.log ALVO` — a forma defeituosa não
> existe no corpus, então nenhum spec a cobria. Só um **diferencial** contra o
> sistema real a revelou.

**Onde este plano poderia cair:** a classe 5 por definição não se acha
procurando. Ela aparece quando **falta o instrumento que gera o dado**. E há
uma categoria inteira de defeito aqui cujos dados **ninguém produz**: nada
type-checka `.tooling/` nem `tooling/`.

**Medido — o plano cai:**

```bash
npx tsc --noEmit --strict --noUncheckedIndexedAccess \
  --module nodenext --moduleResolution nodenext --target es2022 \
  .tooling/scripts/ci/*.ts tooling/scripts/review-router.ts
```

→ **15 erros** em 4 arquivos: `check-doc-refs` (7), `review-router` (4),
`check-package-json-drift` (3), `check-self-firing-guard` (2). Nenhum nos
arquivos que a 4.1 tocou, e **nenhum visto por gate nenhum**, porque
`.tooling/` não tem tsconfig e `pnpm typecheck` roda 4 tasks que não o cobrem.

A lacuna já era conhecida e registrada: [`X5`](./backlog-2026-10-02.md) mediu
exatamente isto — *"a camada de tooling inteira não é typecheckada… os
**gates** são a superfície mais crítica e a única sem verificação de tipos"* —
e o custo também está lá: *"exige um `tsconfig.json` + pacote no workspace, o
que muda a topologia do monorepo — decisão de arquitetura, não de correção"*.
O que esta auditoria acrescenta é a **contagem**, que X5 não tinha: 15 erros
concretos, nomeados por arquivo.

Isto é a classe 5 no sentido exato do plano: a forma defeituosa (erro de tipo
num check de CI) existe no repo, mas **não existe no dado** que nenhum gate
coleta — porque não há gate que colete. E é a mesma frase que o plano usa para
justificar o `check-harness-owner`: *"onde o repo construiu um gate
determinístico, ele funciona"*. Aqui o repo **não** construiu, e portanto
funciona ou não sem que nada saiba.

**Três dos quatro achados anteriores (o path de máquina, a notação em prosa, o
`check-types` na tabela) eram exatamente isto** — e a task 1.1 só os achou
porque o B38 rodou uma auditoria manual. Um instrumento que depende de alguém
lembrar de rodá-lo é a classe 1 com o nome de "auditoria".

---

## Classe 6 — Ferramenta que reporta sucesso corrompendo

> Adjacente, do plano: um `Edit` trocou `0x27`→`0x22` **fora do alvo**, e o
> sintoma apareceu numa linha não editada.

**Onde este plano poderia cair:** a forma que importa aqui não é a corrupção
silenciosa, é a variante em que **o instrumento não mede nada e mesmo assim
devolve um veredito legível**.

**Medido — o plano cai, e a ocorrência é desta execução:**

`pnpm exec markdownlint-cli2 <arquivo>` → **exit 254**, stdout de 89 bytes
contendo `Command "markdownlint-cli2" not found`. O binário não existe. Eu rodei
o comando duas vezes, recebi saída vazia, e li como "markdownlint clean". Um
exit≠0 com nada no stdout é indistinguível de uma aprovação — e foi aceito como
uma, dentro do texto de uma task.

Isto é pior que a corrupção: a corrupção produz sintoma, e o sintoma aparece
longe da causa. A ferramenta ausente produz **silêncio**, e silêncio se
confunde com aprovação com muito mais facilidade. O MD028 foi corrigido assim
mesmo (é markdownlint válido, e a correção é boa por qualquer leitura), mas a
afirmação de "clean" não tinha lastro e não foi repetida no commit.

---

## Classe 7 — Claim numérico que envelhece

> Adjacente, do plano: `X8` afirma `git grep '/home/' -- '*.ts'` → **0**; são
> **3** (B18).

**Onde este plano poderia cair:** o plano é **inteiramente** feito de claims
numéricos — 19 medições no baseline, cada task citando contagens. É a classe
que o plano mais expõe a envelhecer.

**Medido — o plano cai, e os números envelheceram em 3 dias de execução:**

| Claim do plano (2026-10-03) | Medido em 2026-10-05 | Por que |
|---|---|---|
| `turbo-redirect-differential.sh` custa **8,16/8,16/8,19 s** | **8,17/8,15/8,20 s** | medição nova, n=3 |
| preflight passa de **2,5 s** para **~11 s** | **10,78 s** (n=3) | o `~11` era estimativa |
| `.tooling/scripts/ci/` tem **16** arquivos | **25** | 5 gates + 2 specs novos neste plano |
| **3 jobs** do CI pinam 20 | **5 pins em 3 arquivos** | `ci.yml`×3, `sync-docs.yml`, `review-stack.yml` |

**Nenhum desses claims estava errado quando foi escrito.** O de `16` estava
certíssimo em 2026-10-03 — havia 16 arquivos. O que falta em todos é a mesma
coisa: **a data ao lado do número**. O plano é um documento vivo sem
`captured_at`, e um documento vivo sem data envelhece em silêncio — que é a
definição da classe 7.

O que a task 2.1 fez certo e serve de contraste: onde a convenção cita
número, ela escreve o `n` ao lado (`2,62 / 2,64 / 2,62 s`, n=3) e **o
preflight inteiro**, para que um número que não fecha com o todo seja visível
(`2,62 + 8,17 = 10,79` ≈ os 10,78 medidos). Esse é o padrão que o plano, ao
longar de si mesmo, não aplica.

---

## Veredito

O plano **cai em 4 das 7 classes** — 1, 5, 6 e 7. Nenhuma delas é a classe que
ele se propõe a matar:

| | Classe | O plano cai? | Onde |
|---|---|---|---|
| 1 | Nunca dispara | **sim** | `.md ≤ 300` e `.markdownlint.json` declarados sem gate |
| 2 | Só a forma rara | não | corpus de 18, limite nomeado na convenção |
| 3 | Dispara em si mesmo | não | os guards acusaram o próprio autor, 2× |
| 4 | Erra o eixo | não | 4 eixos, 4 REDs distintos e medidos |
| 5 | Classe ausente do dado | **sim** | 15 erros de tipo que nenhum gate coleta |
| 6 | Sucesso enquanto corrompe | **sim** | `markdownlint-cli2` inexistente lido como "clean" |
| 7 | Claim que envelhece | **sim** | 4 números do plano já envelhecidos em 3 dias |

A leitura honesta do critério do plano — *"onde o repo construiu um gate
determinístico, ele funciona; onde o controle foi declarado em prosa e nunca
construído, é fictício"* — aplicada ao próprio plano, dá: **as regras que ele
escreve em prosa e não constrói em gate são as que sobram abertas.** E elas
são, exatamente, as que **ninguém vai notar quebradas**, porque não há nada
que as quebre visivelmente.

O plano não se auto-refutou: construiu 5 gates sobre 7 classes e deixou 4
lacunas nomeadas — 2 delas suas. A auditoria **sua função era dizer isso**, e
dizê-lo no commit message seria evaporar num canal que ninguém versiona.

### O que fecha cada uma

| Lacuna | Onde está | Fechamento | Custo |
|---|---|---|---|
| `.md ≤ 300` sem gate | [`X15`](./backlog-2026-10-02.md) | `check-md-size.ts` no preflight, com lista de exceção versionada | change próprio, com spec |
| `.markdownlint.json` sem binário | [`X16`](./backlog-2026-10-02.md) | remover a config, ou adicionar o lint ao `tooling:test` — hoje ela promete o que não há | change pequeno |
| 15 erros de tipo sem gate | [`X5`](./backlog-2026-10-02.md) | `tsconfig.json` em `.tooling/` + task de `typecheck` que o cubra | decisão de arquitetura; os 15 erros saem antes |
| claims do plano | a tabela de recontagem acima | pôr `captured_at` e as recontagens no documento | recontagem, sem gate |

Nenhuma é urgente e nenhuma está escondida — as quatro estão em prosa
versionada, que pelo critério do próprio plano é o começo da correção e não a
correção.

---

> **O que este arquivo não é.** Não é a lista de correções do plano: as 13
> tasks foram entregues e verificadas. É o registro do que o plano **não**
> cobriu, medido no dia — porque a única forma de saber se um plano começa
> falso é procurar, não perguntar ao próprio autor.
