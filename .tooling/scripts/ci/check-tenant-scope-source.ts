#!/usr/bin/env tsx
/**
 * O escopo de tenancy NUNCA pode vir da rota — só de quem já provou ser membro.
 *
 * ## O furo que este gate fecha
 *
 * MEDIDO no PR #101 (2026-10-17): todo predicado de RLS do projeto compara uma
 * COLUNA da linha ALVO contra `escopo_atual()`, e `grep` em TODAS as migrations
 * não acha uma única função que pergunte se o REQUERENTE pertence à empresa.
 * `set_config('app.tenant_id', …, true)` é transacional e AUTO-DECLARADO: quem
 * escreve o GUC é quem decide de que empresa está falando.
 *
 * A correção do C0 pôs a conferência de membership no `JwtAuthGuard`, que é a
 * fronteira onde a empresa é AFIRMADA e o token prova quem afirmou. Isso fecha
 * o vetor do HEADER. O que NÃO fecha é o **call site futuro**: `escopoDoTenant`
 * é uma TRADUÇÃO (`escopo.ts:78` — "isto é uma tradução, não uma autorização"),
 * então qualquer repositório que receba um `tenantId` e abra o escopo aceita
 * abrir o escopo de qualquer empresa, desde que alguém lhe passe a string.
 *
 * MEDIDO 2026-10-28: **39 call sites** de escopo em `apps/api/src` — é o
 * número que o gate IMPRIME, e o único que vale: um painel que aponta 62 (a
 * prosa de 2026-10-27) ou 77 (o registro de dentes de 2026-10-21) quando o
 * código diz 39 não serve para dimensionar o resíduo cross-file, que é para
 * isso que o número existe.
 *
 * (A queda de 77 é do #118: os 8 call sites de escopo de SISTEMA viraram
 * `comEscopoDeSistema`, que abre a transação na CREDENCIAL de sistema e não
 * recebe o escopo como argumento; e os 3 `abrirEscopo(tx, escopoDoTenant(null))`
 * do onboarding saíram, porque o escopo é aberto dentro de
 * `comEscopoDeSistema`.) Recebem `null`,
 * um identificador local, ou um acessor de domínio (`ctx.tenantId`,
 * `profile.tenantId()`, `convite.tenantId`). Nenhuma recebe valor derivado da
 * rota. O gate existe para o **próximo**.
 *
 * ## Por que não é um tipo
 *
 * Um tipo nominal (`TenantConfirmado`) impediria o fluxo em tempo de
 * compilação, mas o factory que o produziria precisa ser importável em todo
 * lugar senão o `JwtAuthGuard` deixa de ser o único ponto de prova — e aí o tipo
 * é teatro com 40 assinaturas trocadas. Um gate é mais fraco e honesto: ele
 * mede o texto que realmente roda.
 *
 * ## O que conta como "veio da rota" — e o que NÃO conta (leia antes de confiar)
 *
 * Duas regras, ambas com um caso de teste vermelho:
 *
 * 1. **Acesso literal**: `request`/`req` (o header vive em `request.headers`, e o
 *    path em `request.params`) e as palavras soltas `headers`, `params`, `query`,
 *    `body`. pega a forma RARA — `escopoDoTenant(request.user.tenantId)`.
 * 2. **Nome preso na rota NO MESMO ARQUIVO**: se o arquivo amarra um nome a
 *    `@Param`/`@Body`/`@Query`/`@Headers`/`@Req` e passa esse nome para o escopo,
 *    é a forma direta — `escopoDoTenant(id)` dentro do próprio controller.
 *
 * **O residual, medido e NÃO coberto:** a forma COMUM num monorepo hexagonal é
 * cross-file — o controller recebe `@Param('id') tenantId` e o REPOSITÓRIO abre
 * o escopo. `escopoDoTenant(tenantId)` no repositório não nomeia a rota, e um
 * gate de texto não prova de onde o `tenantId` veio sem montar o grafo de
 * chamadas. Fechar esse salto não é trabalho de gate: ou o escopo passa a ser
 * aberto por um valor que só a fronteira cunha (mudança de assinatura nos 66
 * call sites), ou a rota para de chegar a um repositório que aceita
 * identificador. Por isso o gate **conta e publica** os call sites sem prova
 * em `advisories` — e é o que impede alguém de vender silêncio como cobertura.
 *
 * ⚠️ O QUE O NÚMERO **NÃO** FAZ, porque a prosa é tentadora e a medição é
 * contrária (achado do revisor, 2026-10-17): **nenhum gate compara este número
 * com o do commit anterior.** Um 67º call site cross-file deixa o gate VERDE,
 * com o advisory maior. Ler o número e comparar com o run anterior é ato HUMANO,
 * não automatizado — não escreva (nem deixe escrever) que o gate "avisa quando
 * cresce", porque nada avisa. O que ele impede é o silêncio, que é a metade que
 * importa: o número está lá para quem for olhar.
 *
 * ## Por que os comentários são removidos antes
 *
 * MEDIDO: `auth-use-cases.ts:95`, `user-repository.port.ts:61` e
 * `users.controller.ts:169` citam `escopoDoTenant(null)` em prosa. Sem remoção
 * de comentário o gate acusa a documentação de um defeito que ela não tem — e
 * um gate que acusa a própria documentação é um gate que a gente começa a
 * desligar.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CheckResult } from './check-types';
import { linhasDoRelato } from './check-types';

/**
 * As funções que abrem o escopo de tenancy.
 *
 * ⚠️ `comEscopoDeEmpresa` entrou aqui em 2026-10-28, e a entrada NÃO é
 * vaidade: a #118 criou a costura que escolhe a CREDENCIAL pelo `tenantId`
 * (nulo = o bucket de SISTEMA), e os repositórios passaram a usá-la. Sem
 * esta entrada, o gate deixaria de enxergar os call sites que passaram a
 * existir — e o número cairia de 39 para 20 sem que NINGUÉM tivesse
 * removido um escopo. Um gate que só enxerga a forma antiga do código
 *accompanha a forma antiga, e para de acompanhar o defeito.
 */
const FUNCOES_DE_ESCOPO = [
  'escopoDoTenant',
  'comEscopo',
  'comEscopoDeEmpresa',
  'abrirEscopo',
] as const;

/**
 * `comEscopo(prisma, ESCOPO, fn)` — o escopo é o SEGUNDO argumento.
 * `comEscopoDeEmpresa(prisma, TENANT_ID, fn)` — também o segundo.
 * `escopoDoTenant(x)` e `abrirEscopo(tx, x)` — é o PRIMEIRO.
 */
const POSICAO_DO_ESCOPO: Record<(typeof FUNCOES_DE_ESCOPO)[number], number> = {
  escopoDoTenant: 0,
  abrirEscopo: 1,
  comEscopo: 1,
  comEscopoDeEmpresa: 1,
};

/** Fonte derivada da rota: por onde um `tenantId` entra NÃO verificado. */
const FONTE_DE_ROTA = /\b(req|request)\s*(\?\.|\.|\[)|\b(headers|params|query|body)\b/;

/** Decorators que amarram um parâmetro ao que a rota recebeu. */
const DECORATOR_DE_ROTA = /@(Param|Body|Query|Headers|Req)\s*\(/g;

/**
 * Os nomes que ESTE ARQUIVO amarra à rota.
 *
 * Escopo: o arquivo, não a função. O desacoplamento seria mais exato, e também
 * mais caro: exigiria achar o parêntese de abertura de cada função e casar o
 * parâmetro. O custo do excesso é um falso positivo quando um repositório
 *vizinho do controller no mesmo arquivo também tem um parâmetro chamado `id` —
 * e esse falso positivo é `escopoDoTenant(id)` num arquivo que tem rota, que é
 * exatamente o que se quer ver.
 */
export function nomesPresosNaRota(contents: string): Set<string> {
  const nomes = new Set<string>();
  for (const linha of semRuido(contents).split('\n')) {
    DECORATOR_DE_ROTA.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DECORATOR_DE_ROTA.exec(linha)) !== null) {
      // O que vem depois do `(` é o ARGUMENTO do decorator — `@Param('id')`:
      // ler o próximo identificador dava `id`, a chave do path, e acusava
      // qualquer arquivo que tenha um `escopoDoTenant(id)` sem relação nenhuma.
      const depois = linha.slice(m.index + m[0].length);
      const fecha = depois.indexOf(')');
      const nome = depois
        .slice(fecha + 1)
        .trimStart()
        .match(/^([A-Za-z_$][\w$]*)/)?.[1];
      if (nome) nomes.add(nome);
    }
  }
  return nomes;
}

/** Uma chamada de escopo, com o argumento de escopo já extraído. */
export interface ChamadaDeEscopo {
  linha: number;
  funcao: (typeof FUNCOES_DE_ESCOPO)[number];
  /**
   * O argumento de escopo, como ele aparece no texto SEM RUÍDO — ou seja,
   * literais vêm como espaços. É o que permite acusar sem citar texto que não
   * casa com o código, e é o que impede uma string que contém
   * `request.params.id` de virar acusação.
   */
  escopo: string;
}

/**
 * Apaga COMENTÁRIOS e o CONTEÚDO DE STRINGS numa passada só, preservando o
 * comprimento e a contagem de linhas.
 *
 * Preservar a contagem não é vaidade: o gate reporta `arquivo:linha`, e um
 * número deslocado pela remoção manda quem ler procurar o defeito no lugar
 * errado — que é a forma mais barata de um gate ser desacreditado.
 *
 * UMA passada porque as duas regras se alimentam, e medindo o estrago de cada
 * uma sozinha (2026-10-17, achados do revisor):
 *   - uma aspa DENTRO de comentário (`// don't`) abria uma string que engolia o
 *     resto do arquivo;
 *   - um `//` DENTRO de string apagava o resto da linha, e o call site saía do
 *     CORPUS (não só da acusação): `'x//y'; escopoDoTenant(request.params.id)`
 *     virava "ZERO call sites" e, em árvore com outros call sites, virava
 *     contagem defasada em silêncio;
 *   - uma vírgula DENTRO de string partia o argumento no lugar errado, e o id que
 *     vinha da rota nunca era lido: `escopoDoTenant('padrao,invalido' +
 *     request.params.id)` saía com 1 achada e 0 acusações — o gate passando
 *     exatamente o defeito que ele existe para pegar.
 *
 * Atalho com limite conhecido: o `${}` de um template é apagado junto com o
 * texto, porque tratar a interpolação exigiria um parser de JS. Um call site
 * dentro de `${}` fica invisível — impensável na prática, já que a interpolação
 * devolve string, não id de empresa. Suba para um parser real se algum dia
 * precisar ler DENTRO de `${}`.
 *
 * DOIS LIMITES A MAIS, medidos 2026-10-18 (achado do revisor) — nenhum deles
 * é ativo hoje, mas os dois são o MESMO defeito que esta função existe para
 * fechar (o call site saindo do CORPUS em silêncio), então valem escritos:
 *
 * - **regex literal**: `semRuido` não sabe onde uma regex começa. Um
 *   `replace(/\/\//g, '/')` traz `//` para fora de string, o `//` abre
 *   comentário de linha e come a cauda. MEDIDO: `achadas = 0` nesse caso, e
 *   `escopo = ''` (acusação some) quando a regex vem DENTRO do argumento.
 *   Hoje o corpus não tem nenhuma: `grep -rnE` por `//` dentro de `/…/` em
 *   `apps/api/src --include='*.ts'` devolve 0. As duas regex literais que
 *   existem (`global-exception.filter.ts:131`, `user-name.vo.ts:23`) não têm
 *   `//` dentro.
 * - **backtick aninhado**: `` const s = `a${`//`}b` `` — o backtick interno
 *   fecha a string prematuramente e o `//` do `${}` abre comentário. MEDIDO:
 *   `achadas = 0`. O escape `\`` funciona; o aninhamento sem escape, não.
 *
 * Fechar os dois é trabalho de parser, e o custo é um `gate` que ninguém roda
 * porque é lento. Até lá, a decisão é de quem escreve: não deixar regex com
 * `//` nem template aninhado na MESMA LINHA de um call site de escopo.
 */
export function semRuido(contents: string): string {
  let saida = '';
  let i = 0;
  while (i < contents.length) {
    const dois = contents.slice(i, i + 2);
    if (dois === '//') {
      while (i < contents.length && contents[i] !== '\n') i += 1;
      continue;
    }
    if (dois === '/*') {
      while (i < contents.length && contents.slice(i, i + 2) !== '*/') {
        if (contents[i] === '\n') saida += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    const c = contents[i];
    if (c === "'" || c === '"' || c === '`') {
      saida += c;
      i += 1;
      while (i < contents.length && contents[i] !== c) {
        if (contents[i] === '\\') {
          // O escape consome DOIS caracteres; `\n` escapado continua sendo
          // newline, senão a contagem de linhas do gate sai errada.
          const alvo = contents[i + 1] ?? '';
          saida += alvo === '\n' ? ' \n' : '  ';
          i += 2;
          continue;
        }
        saida += contents[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      saida += c;
      i += 1;
      continue;
    }
    saida += c;
    i += 1;
  }
  return saida;
}

/**
 * Divide os argumentos de uma chamada no nível do parêntese de abertura.
 *
 * Um split por vírgula ingênuo parte dentro de `comEscopo(prisma, escopo, (tx) =>
 * { a(1, 2) })` e devolve `tx => { a(1` como se fosse o escopo.
 */
function argumentosDaChamada(texto: string, abreNo: number): string[] {
  let profundidade = 0;
  let atual = '';
  const args: string[] = [];
  // Começa EM `abreNo + 1`: incluir o `(` da chamada faz ele virar parte do
  // PRIMEIRO argumento, e o erro sai como `escopoDoTenant(… (tenantId …)` — o
  // parêntese é a pista de qual chamada está sendo citada, e um texto que
  // ninguém consegue casar com o código não é apontável.
  for (let i = abreNo + 1; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === '(' || c === '[' || c === '{') profundidade += 1;
    if (c === ')' || c === ']' || c === '}') {
      if (profundidade === 0) {
        args.push(atual);
        return args;
      }
      profundidade -= 1;
    }
    if (c === ',' && profundidade === 0) {
      args.push(atual);
      atual = '';
      continue;
    }
    atual += c;
  }
  return args;
}

/**
 * Toda chamada de escopo do arquivo, com o argumento de escopo já isolado.
 *
 * A DEFINIÇÃO das funções não conta: `export async function abrirEscopo(tx,
 * escopo)` casaria com a regra e acusaria `escopo.ts` — o arquivo que DEFINE o
 * ponto único de tradução.
 */
export function achamChamadasDeEscopo(contents: string): ChamadaDeEscopo[] {
  const limpo = semRuido(contents);
  const achadas: ChamadaDeEscopo[] = [];

  for (const funcao of FUNCOES_DE_ESCOPO) {
    const re = new RegExp(`(?<![\\w.])${funcao}\\s*\\(`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(limpo)) !== null) {
      const abreNo = m.index + m[0].length - 1;
      // A definição: `function abrirEscopo(` / `function escopoDoTenant(`.
      const antes = limpo.slice(Math.max(0, m.index - 24), m.index);
      if (/\bfunction\s*$/.test(antes)) continue;

      const args = argumentosDaChamada(limpo, abreNo);
      const escopo = (args[POSICAO_DO_ESCOPO[funcao]] ?? '').trim();
      achadas.push({
        linha: limpo.slice(0, m.index).split('\n').length,
        funcao,
        escopo,
      });
    }
  }
  return achadas.sort((a, b) => a.linha - b.linha);
}

/** O argumento abre o escopo a partir de um valor que a rota forneceu? */
export function escopoVemDaRota(escopo: string): boolean {
  return FONTE_DE_ROTA.test(escopo);
}

function arquivosTs(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) arquivosTs(caminho, acc);
    else if (entrada.name.endsWith('.ts') && !entrada.name.endsWith('.spec.ts')) {
      acc.push(caminho);
    }
  }
  return acc;
}

export function checkTenantScopeSource(opts: { srcRoot: string }): CheckResult {
  const erros: string[] = [];
  const root = opts.srcRoot;
  let total = 0;
  let semProva = 0;

  for (const arquivo of arquivosTs(root)) {
    const rel = relative(process.cwd(), arquivo);
    const conteudo = readFileSync(arquivo, 'utf8');
    const presos = nomesPresosNaRota(conteudo);
    // Uma LINHA é um defeito. `comEscopo(p, escopoDoTenant(request.headers[x]), fn)`
    // casa duas vezes e é um furo só — acusar duas vezes faz o relatório
    // parecer duas falhas distintas e leva a pessoa a procurar dois bugs.
    const acusado = new Set<number>();

    for (const chamada of achamChamadasDeEscopo(conteudo)) {
      total += 1;
      const nomeDaRota = [...presos].find((n) => new RegExp(`\\b${n}\\b`).test(chamada.escopo));
      if (!escopoVemDaRota(chamada.escopo) && !nomeDaRota) {
        // Cross-file, o texto não diz de onde veio. "Sem prova" é o estado
        // DEFAULT de todo call site que este gate não accused — inclusive os
        // que recebem `ctx.tenantId` do contexto verificado, porque este gate
        // não rastreia de onde o contexto veio. Contar menos que isso seria
        // vender uma cobertura que a varredura não fez.
        semProva += 1;
        continue;
      }
      if (acusado.has(chamada.linha)) continue;
      acusado.add(chamada.linha);
      const origem = nomeDaRota
        ? `\`${nomeDaRota}\` está amarrado a um decorator de rota NESTE arquivo`
        : 'acesso literal a `request`/`headers`/`params`/`query`/`body`';
      erros.push(
        `${rel}:${chamada.linha} — \`${chamada.funcao}(… ${chamada.escopo} …)\` abre o ` +
          `escopo a partir de um valor QUE VEIO DA ROTA (${origem}). Todo predicado de RLS ` +
          `compara a coluna ALVO contra \`escopo_atual()\` e nenhuma função do banco pergunta ` +
          `pelo REQUERENTE (medido em todas as migrations, PR #101): quem escreve o GUC decide ` +
          `de que empresa fala. O valor verificado é o que o \`JwtAuthGuard\` publica em ` +
          `\`request.user.tenantId\` depois do \`findRole\`; um \`@Param\`/\`@Body\`/\`@Query\` ` +
          `passa sem passar por ele.`,
      );
    }
  }

  // Anti-vacuuidade. Um gate que mede ZERO call sites está verde porque não
  // mediu nada: renomear o helper, ou a árvore perder os repositórios, esvazia o
  // corpus sem nenhum sinal. MEDIDO hoje: 70 chamadas. O número no painel é o
  // que distingue "a classe está fechada" de "o corpus sumiu".
  if (total === 0) {
    erros.push(
      `ZERO call sites de escopo medidos em ${root}. Ou os helpers foram renomeados ` +
        `(${FUNCOES_DE_ESCOPO.join('/')} não existem mais), ou a árvore ficou vazia — e um ` +
        `gate que não mede nada não pode reportar verde.`,
    );
  }

  const advisories =
    total > 0
      ? [
          `${total} call site(s) de escopo medidos em ${root}`,
          `${semProva} call site(s) abriram o escopo SEM PROVA de origem (a rota chega pelo ` +
            `repositório, em outro arquivo — ver o cabeçalho). Nenhum gate compara este ` +
            `número com o do run anterior: ler e comparar é ato humano. Fechar o resíduo ` +
            `exige mudar a assinatura dos call sites.`,
        ]
      : [];

  return { ok: erros.length === 0, errors: erros, advisories };
}

// Gate IIFE: sem isto, importar `checkTenantScopeSource` num spec executa a
// varredura inteira. Mesmo padrão de `preflight.ts` e `stack-code-reviewer.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = checkTenantScopeSource({ srcRoot: 'apps/api/src' });
  for (const linha of linhasDoRelato(r)) console.error(linha);
  process.exit(r.ok ? 0 : 1);
}
