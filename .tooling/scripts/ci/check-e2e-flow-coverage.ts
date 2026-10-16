#!/usr/bin/env tsx
/**
 * Reconcilia o **inventário de fluxos** (`.agents/specs/conventions/
 * e2e-playwright.md` §"Inventário de Fluxos") com os specs de
 * `apps/web/e2e/*.spec.ts`.
 *
 * A regra que este gate torna automática: *todo fluxo mapeado tem spec, e todo
 * spec pertence a um fluxo mapeado*. Meio-cumprido é vermelho, e o vermelho
 * NOMEIA o fluxo.
 *
 * ## O que este gate mede — e o que NÃO mede
 *
 * Ele mede **paridade declarativa**: que os dois lados descrevem o mesmo
 * conjunto. Ele NÃO mede que os testes passam. Um gate que afirma "a suíte
 * está verde" sem rodar nada é a forma mais comum de um controle mentir, e por
 * isso a execução é uma camada separada (`test:e2e` no CI) e não uma coluna
 * desta tabela.
 *
 * ## Por que o inventário é uma TABELA e não é derivado das rotas
 *
 * MEDIDO ao planejar: a aplicação tem 3 rotas com `page.tsx` e 6 fluxos — F2 a
 * F5 são quatro estados **da mesma** rota, e F6 atravessa três. Um mapeamento
 * rota→fluxo 1:1 falha sempre; a saída de emergência — uma segunda tabela de
 * rotas transcrita à mão — é exatamente o literal que `check-teeth-registry.ts`
 * existe para desconfiar. Por isso o inventário é um único conjunto escrito à
 * mão, e este gate o reconcilia com o outro único conjunto escrito à mão: os
 * cabeçalhos `// FLUXO: F<N>` dos specs.
 *
 * ## E as rotas? — o terceiro conjunto, que NÃO é escrito à mão
 *
 * MEDIDO 2026-10-16: reconciliar dois conjuntos escritos à mão provou paridade
 * entre eles, e paridade não é cobertura. `/me/profile` era uma tela real
 * (`apps/web/app/me/profile/page.tsx`), não tinha linha no inventário, não
 * tinha spec, e o preflight anunciava "reconciliado sobre 12 fluxo(s) e 12
 * spec(s)" como se estivesse tudo medido. Um gate que só compara o que alguém
 * escreveu com o que alguém escreveu não vê a tela que ninguém declarou.
 *
 * A coluna `Rota` do inventário é o gancho: ela é transcrita à mão, mas cada
 * token dela é conferido contra as rotas **do disco**, que ninguém escreve. É
 * a única asserção do arquivo que não é declarativa — e é a que fecha o
 * buraco. Rota nova no código sem linha no inventário é vermelha, nomeando o
 * path.
 *
 * ## Por que o parse acha a coluna pelo NOME e não pela posição
 *
 * Mesma doutrina de `check-teeth-registry.ts`: `split('|')[3]` funciona até
 * alguém reordenar a tabela, e aí falha covering a forma que existe hoje.
 * Aqui a coluna é localizada pelo cabeçalho (`Spec`), e a ausência do cabeçalho
 * é erro nomeado — não um `-1` silencioso que faria a coluna 3 virar o spec.
 *
 * ## Um conjunto vazio NÃO é verde
 *
 * Um inventário com 0 linhas faz as três comparações passarem vacuamente: não
 * há spec com id desconhecido porque não há id, não há fluxo sem spec porque
 * não há fluxo, e a contagem final de "medido" é 0. Isso é a forma
 * "critério inerte sobre conjunto vazio", e por isso 0 linhas é erro, com o
 * heading esperado no texto.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { CheckResult } from './check-types';
import { linhasDoRelato } from './check-types';

/** Heading que delimita o inventário dentro da convenção. */
const INVENTARIO_HEADING = /^##\s+Inventário de Fluxos\s*$/m;

/** Coluna do cabeçalho da tabela que guarda o nome do spec. */
const COLUNA_SPEC = 'spec';

/** Coluna do cabeçalho da tabela que guarda a rota exercida pelo fluxo. */
const COLUNA_ROTA = 'rota';

/** Cabeçalho de fluxo que amarra um spec ao inventário. */
const FLUXO_RE = /^\s*(?:\/\/|\/\*)\s*FLUXO:\s*(F\d+)\b/m;

/** Ids de fluxo válidos: `F` + dígitos. */
const ID_RE = /^F\d+$/;

export interface LinhaFluxo {
  id: string;
  spec: string;
  /** Rotas que o fluxo exercita — reconciliadas com as rotas do disco. */
  rotas: string[];
}

export interface SpecE2E {
  /** Path repo-relative, usado nas mensagens. */
  arquivo: string;
  conteudo: string;
}

export interface EntradasE2E {
  convencaoMarkdown: string;
  specs: SpecE2E[];
  /**
   * Rotas que EXISTEM no código, derivadas de `apps/web/app/**\/page.tsx`.
   * Este é o único conjunto do gate que ninguém escreve à mão — é o que
   * impede o inventário de ficar em paridade consigo mesmo enquanto uma tela
   * nova passa sem fluxo. Vazio com o diretório de app presente é erro.
   */
  rotas: string[];
}

export interface ResultadoE2E {
  ok: boolean;
  errors: string[];
  /** Fluxos efetivamente medidos — o denominador do "verifiquei". */
  medidos: number;
  /** Rotas do disco conferidas contra a coluna `Rota`. */
  rotasMedidas: number;
}

/** Divide uma linha de tabela em células, já sem as bordas. */
function celulas(linha: string): string[] {
  return linha
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Remove as crases de um token da tabela: `` `f1.spec.ts` `` → `f1.spec.ts`. */
function semCrases(token: string): string {
  const m = /`([^`]+)`/.exec(token);
  return (m?.[1] ?? token).trim();
}

/**
 * Extrai as rotas de uma célula da coluna `Rota`.
 *
 * A célula descreve um PERCURSO, não um caminho: `` `/users/novo` →
 * `/login?cadastrado=1` → `/users` `` e `` `/` ↔ `/users` ↔ `/users/novo` ``.
 * Separar por `→`/`↔`, tirar a query string e normalizar a barra final é o que
 * torna comparável com o que o App Router gera. `[slug]` fica como `[slug]`:
 * o segmento dinâmico é a rota, e o disco tem a pasta com esse nome.
 */
export function rotasDeclaradas(celula: string): string[] {
  return celula
    .split(/→|↔/)
    .map((p) => semCrases(p).split('?')[0]!.trim())
    .filter((p) => p.startsWith('/'))
    .map((p) => (p.length > 1 ? p.replace(/\/+$/, '') : p));
}

/**
 * Deriva as rotas do App Router a partir dos `page.tsx` em disco.
 *
 * `app/page.tsx` → `/`; `app/users/novo/page.tsx` → `/users/novo`. É a
 * definição de rota do próprio Next, não uma convenção nossa: qualquer
 * segmento de pasta é um segmento de URL, incluindo `[slug]`.
 */
export function rotasDoApp(dirApp: string): string[] {
  if (!existsSync(dirApp)) return [];
  const achar = (dir: string): string[] => {
    const rotas: string[] = [];
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        rotas.push(...achar(caminho));
      } else if (entrada.isFile() && entrada.name === 'page.tsx') {
        const rel = relative(dirApp, dir).split('\\').join('/');
        rotas.push(rel === '' ? '/' : `/${rel}`);
      }
    }
    return rotas;
  };
  return achar(dirApp).sort();
}

/**
 * Lê a tabela do inventário.
 *
 * Localiza a coluna pelo cabeçalho em vez da posição. Um inventário sem a coluna
 * `Spec` é erro que nomeia a coluna esperada — não um índice fora da faixa que
 * devolveria um array vazio e deixaria o gate verde por não ter encontrado
 * nada para casar.
 */
export function lerInventario(markdown: string): { linhas: LinhaFluxo[]; erro?: string } {
  const heading = INVENTARIO_HEADING.exec(markdown);
  if (heading === null) {
    return {
      linhas: [],
      erro:
        'a convenção e2e-playwright.md não tem a seção `## Inventário de Fluxos` — ' +
        'é dela que este gate lê o conjunto de fluxos',
    };
  }

  const corpo = markdown.slice(heading.index + heading[0].length);
  // A tabela acabou: a primeira linha que não é de tabela encerra a varredura.
  // Sem esta quebra, os exemplos em prosa mais abaixo entrariam no inventário.
  const linhasTabela: string[] = [];
  for (const linha of corpo.split('\n')) {
    if (!linha.trimStart().startsWith('|')) {
      if (linhasTabela.length > 0) break;
      continue;
    }
    linhasTabela.push(linha);
  }

  const cabecalho = celulas(linhasTabela[0] ?? '');
  const indiceSpec = cabecalho.findIndex((c) => c.toLowerCase() === COLUNA_SPEC);
  if (indiceSpec < 0) {
    return {
      linhas: [],
      erro:
        `a tabela do inventário não tem a coluna "${COLUNA_SPEC}" — cabeçalho medido: ` +
        `[${cabecalho.join(' | ')}]. Sem ela não há como ligar fluxo a arquivo.`,
    };
  }
  const indiceRota = cabecalho.findIndex((c) => c.toLowerCase() === COLUNA_ROTA);
  if (indiceRota < 0) {
    return {
      linhas: [],
      erro:
        `a tabela do inventário não tem a coluna "${COLUNA_ROTA}" — cabeçalho medido: ` +
        `[${cabecalho.join(' | ')}]. Sem ela o inventário só se reconcilia com ele ` +
        'próprio, e uma tela nova no código entra sem fluxo sem ninguém perceber.',
    };
  }

  const linhas: LinhaFluxo[] = [];
  for (const bruta of linhasTabela.slice(2)) {
    // Linha separadora `|---|---|`.
    if (/^[-: ]+$/.test(bruta.replace(/\|/g, '').trim())) continue;
    const colunas = celulas(bruta);
    const id = (colunas[0] ?? '').trim();
    if (id === '' || !ID_RE.test(id)) continue;
    linhas.push({
      id,
      spec: semCrases(colunas[indiceSpec] ?? ''),
      rotas: rotasDeclaradas(colunas[indiceRota] ?? ''),
    });
  }
  return { linhas };
}

/** Extrai o id de fluxo declarado no cabeçalho de um spec, se houver. */
export function fluxoDeclarado(conteudo: string): string | null {
  return FLUXO_RE.exec(conteudo)?.[1] ?? null;
}

/**
 * Reconcilia inventário ⇄ specs.
 *
 * Quatro falhas, cada uma nomeando o artefato culpado: spec com id fora do
 * inventário, fluxo do inventário sem spec, spec sem cabeçalho `FLUXO:`, e id
 * declarado por dois specs — caso em que a pergunta "qual dos dois é o dono"
 * fica sem resposta dentro do próprio gate.
 */
export function reconciliarFluxosE2E(entrada: EntradasE2E): ResultadoE2E {
  const errors: string[] = [];
  const { linhas: inventario, erro } = lerInventario(entrada.convencaoMarkdown);
  if (erro !== undefined) return { ok: false, errors: [erro], medidos: 0, rotasMedidas: 0 };

  // Vazio não é verde: ver o cabeçalho deste arquivo.
  if (inventario.length === 0) {
    return {
      ok: false,
      errors: [
        'o inventário de fluxos tem 0 linhas — com o conjunto vazio as três ' +
          'reconciliações passam vacuamente e este gate reportaria verde sem ter ' +
          'medido nada',
      ],
      medidos: 0,
      rotasMedidas: 0,
    };
  }

  const porId = new Map(inventario.map((l) => [l.id, l]));
  const specsPorFluxo = new Map<string, string[]>();
  const semCabecalho: string[] = [];
  const forasDoInventario: string[] = [];

  for (const spec of entrada.specs) {
    const id = fluxoDeclarado(spec.conteudo);
    if (id === null) {
      semCabecalho.push(spec.arquivo);
      continue;
    }
    if (!porId.has(id)) {
      forasDoInventario.push(`${spec.arquivo} declara \`// FLUXO: ${id}\``);
      continue;
    }
    specsPorFluxo.set(id, [...(specsPorFluxo.get(id) ?? []), spec.arquivo]);
  }

  for (const frase of semCabecalho) {
    errors.push(
      `spec sem cabeçalho \`// FLUXO: F<N>\`: ${frase} — sem o cabeçalho o arquivo ` +
        'não é rastreável a nenhum fluxo do inventário, e "o nome do arquivo já ' +
        'diz" não é rastreabilidade',
    );
  }
  for (const frase of forasDoInventario) {
    errors.push(
      `${frase}, que não está no inventário de ` +
        '`.agents/specs/conventions/e2e-playwright.md` — ou o fluxo é novo e ' +
        'falta a linha na tabela, ou o id está errado',
    );
  }

  const specsNoDisco = new Set(entrada.specs.map((s) => s.arquivo));
  for (const linha of inventario) {
    if (linha.spec === '') {
      errors.push(`fluxo ${linha.id} no inventário sem nome de spec na coluna "${COLUNA_SPEC}"`);
      continue;
    }
    const declarado = specsPorFluxo.get(linha.id) ?? [];
    if (declarado.length === 0) {
      errors.push(
        `fluxo ${linha.id} está no inventário apontando para \`${linha.spec}\`, ` +
          'e nenhum spec declara esse fluxo',
      );
      continue;
    }
    if (declarado.length > 1) {
      errors.push(
        `fluxo ${linha.id} é declarado por ${declarado.length} specs: ` +
          `${declarado.join(', ')} — o inventário aponta para \`${linha.spec}\` e ` +
          'não diz qual deles é o dono do fluxo',
      );
      continue;
    }
    const dono = declarado[0]!;
    const esperado = linha.spec;
    if (
      dono !== undefined &&
      esperado !== '' &&
      !dono.endsWith(`/${esperado}`) &&
      dono !== esperado
    ) {
      errors.push(
        `fluxo ${linha.id}: o inventário aponta para \`${esperado}\`, mas o spec que ` +
          `declara o fluxo é \`${dono}\` — um dos dois lados está desatualizado`,
      );
    }
    if (!specsNoDisco.has(esperado) && esperado.includes('/')) {
      errors.push(`spec do fluxo ${linha.id} não existe no disco: \`${esperado}\``);
    }
  }

  // ─── Terceiro conjunto: as rotas do disco ────────────────────────────
  //
  // As duas reconciliações acima comparam o que foi escrito com o que foi
  // escrito. Esta compara com o que o App Router montou, e é a única que
  // acusa a tela que NINGUÉM declarou. Sem ela o gate fecha um círculo.
  //
  // Vazio aqui também não é verde: com `rotas: []` o `every` passaria e o
  // gate anunciaria cobertura de zero rotas.
  if (entrada.rotas.length === 0) {
    errors.push(
      'nenhuma rota foi derivada de `page.tsx` — com o conjunto vazio a ' +
        'conferência de rotas passaria vacuamente, e um app sem nenhuma tela ' +
        'seria indistinguível de um app todo coberto',
    );
  }
  const declaradas = new Set(inventario.flatMap((l) => l.rotas));
  for (const rota of entrada.rotas) {
    if (!declaradas.has(rota)) {
      errors.push(
        `a rota \`${rota}\` existe no código (há um \`page.tsx\` para ela) e não ` +
          'aparece na coluna "Rota" do inventário de ' +
          '`.agents/specs/conventions/e2e-playwright.md` — toda tela precisa de ' +
          'um fluxo com spec, ou de uma linha que diga por que não tem',
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    medidos: inventario.length,
    rotasMedidas: entrada.rotas.length,
  };
}

/** Lê os specs `*.spec.ts` de um diretório de e2e, ordenados. */
export function lerSpecs(diretorio: string): SpecE2E[] {
  if (!existsSync(diretorio)) return [];
  return readdirSync(diretorio)
    .filter((f) => f.endsWith('.spec.ts'))
    .sort()
    .map((f) => ({ arquivo: f, conteudo: readFileSync(join(diretorio, f), 'utf8') }));
}

export function checkE2eFlowCoverage(opts: { repoRoot: string }): CheckResult {
  const raiz = resolve(opts.repoRoot);
  const convencao = join(raiz, '.agents/specs/conventions/e2e-playwright.md');
  const dirE2E = join(raiz, 'apps/web/e2e');
  const dirApp = join(raiz, 'apps/web/app');

  if (!existsSync(convencao)) {
    // Sem a convenção não há inventário: `skipped`, e não erro. Um template
    // que ainda não adotou a regra não pode ser bloqueado por ela — mas também
    // não pode receber um `✓` que finja ter medido.
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `${convencao} não existe — nada declarado para reconciliar`,
    };
  }

  if (!existsSync(dirE2E)) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `${dirE2E} não existe — nenhum spec de e2e no frontend`,
    };
  }

  const specs = lerSpecs(dirE2E);
  // Mesmo critério do inventário vazio, do outro lado: um diretório de e2e sem
  // spec nenhum faria "fluxo sem spec" passar por ausência, e o inventário
  // inteiro ficaria verde por nada.
  //
  // MEDIDO: este `if` ficava DEPOIS do skip de `apps/web/app`, e um repo sem
  // frontend com diretório de e2e vazio voltava `skipped` — o defeito real
  // (diretório de e2e sem spec nenhum) escondido atrás de um motivo que não
  // era o dele. Um skip nunca pode virar teto para um erro que já é erro.
  if (specs.length === 0) {
    return {
      ok: false,
      errors: [
        `${dirE2E} existe mas não tem nenhum *.spec.ts — o inventário declara ` +
          'fluxos e não há spec para medi-los; um gate verde aqui é verde por ' +
          'ausência de objeto',
      ],
    };
  }

  // Sem o app não há rota a conferir. `skipped` e não erro — pelo mesmo
  // motivo da convenção ausente: um template que não tem frontend não é
  // bloqueado por uma regra de frontend. O que não pode é virar `✓`
  // fingindo que mediu.
  if (!existsSync(dirApp)) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `${dirApp} não existe — nenhuma rota de página para conferir`,
    };
  }

  const resultado = reconciliarFluxosE2E({
    convencaoMarkdown: readFileSync(convencao, 'utf8'),
    specs,
    rotas: rotasDoApp(dirApp),
  });

  return {
    ok: resultado.ok,
    errors: resultado.errors,
    advisories:
      resultado.ok && resultado.medidos > 0
        ? [
            `reconciliado sobre ${resultado.medidos} fluxo(s) e ${specs.length} spec(s), ` +
              `com ${resultado.rotasMedidas} rota(s) de página conferidas contra o ` +
              'código — paridade DECLARATIVA dos fluxos; a execução é `test:e2e` no CI.',
          ]
        : [],
  };
}

// Executado como CLI.
if (process.argv[1]?.endsWith('check-e2e-flow-coverage.ts')) {
  const r = checkE2eFlowCoverage({ repoRoot: '.' });
  for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
  process.exit(r.ok ? 0 : 1);
}
