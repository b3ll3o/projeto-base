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
import { join, resolve } from 'node:path';
import type { CheckResult } from './check-types';
import { linhasDoRelato } from './check-types';

/** Heading que delimita o inventário dentro da convenção. */
const INVENTARIO_HEADING = /^##\s+Inventário de Fluxos\s*$/m;

/** Coluna do cabeçalho da tabela que guarda o nome do spec. */
const COLUNA_SPEC = 'spec';

/** Cabeçalho de fluxo que amarra um spec ao inventário. */
const FLUXO_RE = /^\s*(?:\/\/|\/\*)\s*FLUXO:\s*(F\d+)\b/m;

/** Ids de fluxo válidos: `F` + dígitos. */
const ID_RE = /^F\d+$/;

export interface LinhaFluxo {
  id: string;
  spec: string;
}

export interface SpecE2E {
  /** Path repo-relative, usado nas mensagens. */
  arquivo: string;
  conteudo: string;
}

export interface EntradasE2E {
  convencaoMarkdown: string;
  specs: SpecE2E[];
}

export interface ResultadoE2E {
  ok: boolean;
  errors: string[];
  /** Fluxos efetivamente medidos — o denominador do "verifiquei". */
  medidos: number;
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

  const linhas: LinhaFluxo[] = [];
  for (const bruta of linhasTabela.slice(2)) {
    // Linha separadora `|---|---|`.
    if (/^[-: ]+$/.test(bruta.replace(/\|/g, '').trim())) continue;
    const colunas = celulas(bruta);
    const id = (colunas[0] ?? '').trim();
    if (id === '' || !ID_RE.test(id)) continue;
    linhas.push({ id, spec: semCrases(colunas[indiceSpec] ?? '') });
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
  if (erro !== undefined) return { ok: false, errors: [erro], medidos: 0 };

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

  return { ok: errors.length === 0, errors, medidos: inventario.length };
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

  const resultado = reconciliarFluxosE2E({
    convencaoMarkdown: readFileSync(convencao, 'utf8'),
    specs,
  });

  return {
    ok: resultado.ok,
    errors: resultado.errors,
    advisories:
      resultado.ok && resultado.medidos > 0
        ? [
            `reconciliado sobre ${resultado.medidos} fluxo(s) e ${specs.length} spec(s) ` +
              '— paridade DECLARATIVA: este gate não roda a suíte. A execução é ' +
              '`test:e2e` no CI.',
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
