// apps/web/vitest-include.spec.ts
//
// GUARD: nenhum arquivo de teste pode existir sem ser COLETADO.
//
// pt-BR: o modo de falha que este arquivo existe para impedir é o verde por
// ausência — o teste é escrito, `pnpm ci:local` passa, e o teste nunca rodou.
// Ele não é hipótese: aconteceu nesta própria tela. Ao criar
// `instrumentation-client.spec.ts` na raiz do app, o `vitest run` a partir
// de apps/web respondeu "No test files found" e o relatório continuou
// contando 56 testes — os mesmos 56 de antes, sem o novo. Quem lê
// "Tests 56 passed" não tem como saber que o 57º existe e não rodou.
//
// A armadilha é estrutural, não um erro de escrita: `include` do Vitest é
// uma lista de globs, e um diretório novo é roteado só se alguém lembrar de
// acrescentar o glob. O sintoma (`exit 0`) é indistinguível do sucesso.
//
// O que este guard NÃO promete: ele não se protege de ser removido junto com
// o glob. Se alguém apagar a linha do glob raiz do `include` E este arquivo
// no mesmo commit, o guard cala junto — verificar no review que o `include`
// e este spec mudaram juntos é o que fecha esse resto.
//
// pt-BR (o resto): nenhum bloco de comentário deste arquivo pode conter a
// sequência barra-asterisco-asterisco, nem duas estrelas seguidas de barra.
// As duas fecham o comentário no meio da frase e matam o arquivo inteiro no
// esbuild — sem erro de TypeScript, e o sintoma (uma suíte inteira que
// desaparece do relatório) é verde. Já aconteceu duas vezes neste mesmo
// arquivo enquanto ele era escrito.

import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import config from './vitest.config';

// Converte um glob do `include` em RegExp ancorado, no dialecto do Vitest.
//
// pt-BR: a ORDEM das substituições é load-bearing. Na ordem "natural" este
// guard não acusava nada. A expansão do glob recursivo produz um grupo
// opcional de prefixo; o passo seguinte — que reescreve todo ponto de
// interrogação como classe de um caractere — comia o quantificador que ela
// mesma tinha acabado de criar. O grupo saía com os parênteses trocados por
// uma classe, e passava a só casar caminho com pelo menos duas pastas. Os 4
// globs com duplo-asterisco paravam de casar qualquer coisa, e o guard
// acusava as 6 specs que rodavam faziam semanas como "órfãs".
//
// Por isso o ponto de interrogação é gasto PRIMEIRO, e por isso a conversão
// tem teste próprio: ela é uma seam, e uma seam sem teste é um guard que
// mente — que foi exatamente a primeira versão deste arquivo.
function paraRegex(glob: string): RegExp {
  const corpo = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\?/g, '[^/]')
    // o glob recursivo precisa virar "zero ou mais diretórios" ANTES de
    // qualquer duplo-asterisco solto virar "qualquer coisa, inclusive barra"
    .replace(/\*\*\//g, ' SLASHPAD ')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/ SLASHPAD /g, '(?:.*/)?');
  return new RegExp(`^${corpo}$`);
}

// Diretórios que o guard NÃO varre: lixo de build, e agora `e2e`.
//
// pt-BR (2026-10-08): `e2e` entrou aqui ao chegar a suíte de Playwright do
// frontend, e a entrada é deliberada — não é um "furo" conveniente.
//
// 1. Os specs de `e2e/` são coletados pelo Playwright (`testDir`), não pelo
//    Vitest. Sem esta entrada o guard acusa cada um deles como órfão e o
//    `pnpm typecheck`/`ci:local` fica vermelho com um nome de arquivo que o
//    Vitest jamais executaria. Medido antes de decidir: criar
//    `e2e/zz-probe.spec.ts` e rodar este guard produziu
//    `Tests 1 failed | 9 passed`, com o probe listado como órfão.
//
// 2. A alternativa — nomear os arquivos `*.e2e.ts` e configure `testMatch` —
//    desliga este guard para eles POR CONSTRUÇÃO: o nome deixa de casar com a
//    convenção `*.spec.ts` do resto do app, então a checagem deixa de alcançar
//    esses arquivos. Trocaria um guard barulhento por um silencioso, que é o
//    modo de falha que este arquivo foi escrito para impedir.
//
// O que continua valendo: todo outro diretório da árvore segue coberto, e o
// gate de paridade dos fluxos (`.tooling/scripts/ci/check-e2e-flow-coverage.ts`)
// é quem garante que os specs de `e2e/` existem e são rastreáveis — o que
// este guard não pode mais fazer por eles.
const IGNORAR = new Set(['node_modules', '.next', 'coverage', '.turbo', 'e2e']);

/** Todos os `*.spec.{ts,tsx}` do app, exceto lixo de build. */
function specsNoDisco(raiz: string): string[] {
  const achados: string[] = [];
  const andar = (dir: string): void => {
    for (const entrada of readdirSync(dir)) {
      if (IGNORAR.has(entrada)) continue;
      const caminho = join(dir, entrada);
      if (statSync(caminho).isDirectory()) {
        andar(caminho);
      } else if (/\.spec\.tsx?$/.test(entrada)) {
        achados.push(relative(raiz, caminho).split(sep).join('/'));
      }
    }
  };
  andar(raiz);
  return achados.sort();
}

const APP_ROOT = new URL('.', import.meta.url).pathname;
const INCLUDE = (config.test?.include ?? []) as string[];
const doDisco = specsNoDisco(APP_ROOT);

describe('paraRegex — a conversão de glob que o guard inteiro depende', () => {
  it('glob recursivo casa zero diretórios e também vários níveis', () => {
    const r = paraRegex('app/**/*.spec.ts');

    expect(r.test('app/users.spec.ts')).toBe(true);
    expect(r.test('app/users/novo/actions.spec.ts')).toBe(true);
    expect(r.test('app/a/b/c/d.spec.ts')).toBe(true);
  });

  it('asterisco simples NÃO atravessa a fronteira de diretório', () => {
    // pt-BR: sem isto, um glob de um nível casaria um arquivo de dois níveis
    // e o guard acharia que está tudo coberto quando um subdiretório novo
    // continuaria órfão — o guard mentindo na direção que ele existe para
    // proteger.
    const simples = paraRegex('lib/*.spec.ts');

    expect(simples.test('lib/x.spec.ts')).toBe(true);
    expect(simples.test('lib/a/b.spec.ts')).toBe(false);
    expect(simples.test('other/x.spec.ts')).toBe(false);
  });

  it('o prefixo é âncora, não sugestão', () => {
    const r = paraRegex('lib/**/*.spec.ts');

    expect(r.test('lib/x.spec.ts')).toBe(true);
    expect(r.test('lib/a/b/x.spec.ts')).toBe(true);
    expect(r.test('prefixo/lib/x.spec.ts')).toBe(false);
    expect(r.test('applib/x.spec.ts')).toBe(false);
  });

  it('ponto de interrogação casa UM caractere, e só um, no mesmo segmento', () => {
    const r = paraRegex('src/v?.spec.ts');

    expect(r.test('src/v1.spec.ts')).toBe(true);
    expect(r.test('src/v12.spec.ts')).toBe(false);
    expect(r.test('src/v/1.spec.ts')).toBe(false);
  });

  it('o ponto é literal — não vira curinga', () => {
    const r = paraRegex('*.spec.ts');

    expect(r.test('a.spec.ts')).toBe(true);
    expect(r.test('aXspec.ts')).toBe(false);
  });

  it('o RegExp gerado é ancorado nas duas pontas', () => {
    const r = paraRegex('lib/*.spec.ts');

    expect(r.test('prefixo/lib/x.spec.ts')).toBe(false);
    expect(r.test('lib/x.spec.ts.suffix')).toBe(false);
  });
});

describe('guard: include do Vitest cobre todo spec que existe', () => {
  it('a lista de specs no disco não está vazia (senão o guard é inerte)', () => {
    // pt-BR: sem esta linha, uma varredura que não encontra nada produz
    // lista vazia, o filtro passa, e o guard fica verde sem ter olhado
    // nada. É o critério inerte sobre conjunto vazio,ubytes de uma classe
    // que este repositório já catalogou.
    expect(doDisco.length).toBeGreaterThan(0);
  });

  it('o include do config não está vazio (mesma razão, um nível acima)', () => {
    // pt-BR: `?? []` faz o guard passar em silêncio se a chave `include`
    // sumir do config. Sem esta linha, apagar o `include` inteiro é um
    // VERDE.
    expect(INCLUDE.length).toBeGreaterThan(0);
  });

  it('todo spec em disco é casado por algum glob de include', () => {
    const regexes = INCLUDE.map(paraRegex);
    const orfaos = doDisco.filter((spec) => !regexes.some((r) => r.test(spec)));

    expect(orfaos).toEqual([]);
  });

  it('este próprio guard é coletado (ele não pode ficar fora do próprio guarda)', () => {
    const regexes = INCLUDE.map(paraRegex);
    const este = 'vitest-include.spec.ts';

    expect(regexes.some((r) => r.test(este))).toBe(true);
  });
});
