/**
 * `pr-refresh-apply` — reescreve as claims DIVERGENTES que o corpo do PR
 * declarou como vivas, e nada mais.
 *
 * ## Por que isto é um arquivo separado do `pr-refresh-scan`
 *
 * O scanner tem uma propriedade escrita no topo dele: **ele não reescreve
 * nada**. Quem reescreve é quem roda o workflow. Separar mantém essa frase
 * verdadeira — o scanner continua sendo leitura, e a escrita mora num módulo
 * cujo nome diz que escreve.
 *
 * ## A fronteira de segurança é a MESMA, e ela não se repete por convenience
 *
 * O corpo do PR é entrada não confiável e mutável. Aqui ele é **texto**:
 * nenhuma linha dele chega a uma posição de comando, nenhum `exec`, nenhum
 * `shell: true`. A escrita substitui um substring por outro dentro de uma
 * string em memória. O `git` é quem mede, e os argumentos dele são
 * construídos no `pr-refresh-scan`.
 *
 * ## A reescrita é por OFFSET, e substring não serve
 *
 * Este é o centro do arquivo, e ele nasceu de duas medições, não de
 * preferência de estilo.
 *
 * **`insercoes` e `remocoes` compartilham o mesmo `m[0]`.** As duas classes
 * saem do mesmo regex `\+NUM\s*\/\s*(?:−|-)(\d+)`, nos grupos 1 e 2. MEDIDO no
 * corpo real do PR #44, em `**38 commits, 42 arquivos, +5905/−124**`:
 *
 *     insercoes.declarado === remocoes.declarado   ->  true   (ambas "+5905/−124")
 *
 * Localizar o alvo por substring `replace()` faz as duas disputarem o mesmo
 * texto. MEDIDO end-to-end: a linha vira `**45, 50, 6000**` — sem "commits",
 * sem "arquivos", sem o `−`. E o pior não é o corpo estragado: **o scanner
 * deixa de reportar aquelas claims** (11 → 7), porque sem a palavra da classe
 * não há mais claim. A corrupção não se anuncia por sinal nenhum.
 *
 * **A substring também não é chave.** MEDIDO: com `**38 commits, 38
 * arquivos**`, onde `commits` está CORRETO e `arquivos` stale, um
 * `replace(/38/, '42')` para `arquivos` acha a PRIMEIRA ocorrência — a de
 * `commits`. Depois de 4 execuções o corpo estabiliza em `**42 commits, 38
 * arquivos**`, com os dois números errados, e `mudou=false`: um guard que só
 * grava quando algo mudou reporta "nada a fazer" sobre um corpo corrompido.
 *
 * Por isso a claim carrega `ini`/`fim` — os offsets do GRUPO capturado, não
 * do match inteiro — e a escrita desce da direita para a esquerda, para que
 * cada deslocamento não invalide o próximo.
 */
import { describe, expect, it } from 'vitest';

import type { Relatorio } from './pr-refresh-scan.js';
import { extrairClaims } from './pr-refresh-scan.js';
import { linhasVivas, reescrever } from './pr-refresh-apply.js';

/**
 * Relatório montado à mão a partir de uma medição fixa.
 *
 * A medição é um parâmetro do teste, não do ambiente: nenhum número aqui vem
 * de `git`, do remoto ou da profundidade do clone. Um teste que mede o repo
 * real passa aqui e quebra no runner — foi o que o próprio
 * `pr-refresh-scan.spec.ts` registrou.
 */
function relatorioDe(texto: string, medido: Record<string, number>): Relatorio {
  const padroes: Record<string, number | null> = {
    commits: null,
    arquivos: null,
    testes: null,
    insercoes: null,
    remocoes: null,
  };
  for (const [k, v] of Object.entries(medido)) padroes[k] = v;
  const claims = extrairClaims(texto).map((c) => {
    const m = padroes[c.classe] ?? null;
    return { ...c, medido: m, divergente: m !== null && m !== c.valor };
  });
  return { base: 'base-de-teste', claims, resumo: 'fixture' };
}

describe('linhasVivas — a região que o corpo declarou reescrevível', () => {
  it('marca a linha do cabeçalho e a linha vizinha de verdade', () => {
    // Parágrafo = bloco de linhas não-vazias. O cabeçalho do #44 é um
    // parágrafo de UMA linha porque L6 e L8 são vazias.
    const texto = [
      '## Contexto',
      '',
      '**38 commits, 42 arquivos** <!--pr-refresh:live-->',
      '',
      'fim',
      '',
    ].join('\n');
    expect([...linhasVivas(texto)].sort((a, b) => a - b)).toEqual([3]);
  });

  it('um parágrafo marcado torna vivas TODAS as suas linhas, não só a do marcador', () => {
    // MEDIDO no corpo real: a frase de prosa quebra em duas linhas com
    // frequência — "20 commits, 34" / "arquivos, +4402/−102". Se o escopo fosse
    // a LINHA do marcador, metade das claims de um cabeçalho escrito em duas
    // linhas cairia fora e envelheceria em silêncio, sem nenhum sinal.
    const texto = [
      '**30 commits, 40',
      'arquivos, +5000/−100** <!--pr-refresh:live-->',
      '',
      'outro',
      '',
    ].join('\n');
    expect([...linhasVivas(texto)].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('corpo sem marcador nenhum não tem região viva — e isso é distinto de "sem divergência"', () => {
    const texto = ['**30 commits, 40 arquivos**', '', 'texto', ''].join('\n');
    expect(linhasVivas(texto).size).toBe(0);
  });

  // MEDIDO 2026-10-06 escrevendo o corpo do PR #44: o parágrafo que EXPLICAVA o
  // marcador colou o token dentro de crases, e `grep -c` passou a devolver 2. O
  // parágrafo virou região viva sem ninguém pedir — a classe 3, o guard
  // disparando no texto que o documenta. Não há como o token aparecer na prosa
  // sem ativar o parágrafo: é a mesma string.
  it('o token colado na prosa ATIVA o parágrafo, mesmo dentro de crases', () => {
    const texto = [
      '**30 commits, 40 arquivos** <!--pr-refresh:live-->',
      '',
      'quem decide é o marcador `<!--pr-refresh:live-->`, e ele está aqui',
      '',
      '**20 commits**, citação',
      '',
    ].join('\n');
    // Ativadas: o cabeçalho (L1) e o parágrafo da prosa (L3). A citação (L5),
    // que é o parágrafo que a pessoa NÃO queria reescrever, fica de fora.
    expect([...linhasVivas(texto)].sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it('a prosa que nomeia o marcador sem colar o token NÃO ativa o parágrafo', () => {
    const texto = [
      '**30 commits, 40 arquivos** <!--pr-refresh:live-->',
      '',
      'quem decide é o marcador de região viva no parágrafo do cabeçalho',
      '',
    ].join('\n');
    expect([...linhasVivas(texto)]).toEqual([1]);
  });
});

describe('reescrever — as duas armadilhas que a substring cria', () => {
  it('`+N/−M`: reescreve os DOIS grupos e preserva o "+" e o "−"', () => {
    // O teste que o `refut:correcao` mediu: reescrever por `m[0]` produz
    // `**45, 50, 6000**` e o scanner DEIXA de reportar a linha.
    const texto = '**30 commits, 40 arquivos, +5000/−100** <!--pr-refresh:live-->';
    const r = relatorioDe(texto, { commits: 38, arquivos: 42, insercoes: 5905, remocoes: 124 });
    const saida = reescrever(texto, r);
    expect(saida.texto).toBe('**38 commits, 42 arquivos, +5905/−124** <!--pr-refresh:live-->');
    // A prova de que a linha continua sendo legível como claim. Sem isto o
    // teste acima passa com uma reescrita que apagou as palavras.
    expect(saida.texto).toContain('commits');
    expect(saida.texto).toContain('arquivos');
    expect(
      extrairClaims(saida.texto)
        .map((c) => c.classe)
        .sort(),
    ).toEqual(['arquivos', 'commits', 'insercoes', 'remocoes']);
  });

  it('número repetido na mesma linha: corrige o stale sem tocar no que já estava certo', () => {
    // MEDIDO pelo `refut:idempotencia`: com `**38 commits, 38 arquivos**` uma
    // reescrita por substring acha a PRIMEIRA ocorrência e converge para
    // `**42 commits, 38 arquivos**` — dois números errados, `mudou=false`.
    const texto = '**38 commits, 38 arquivos** <!--pr-refresh:live-->';
    const r = relatorioDe(texto, { commits: 38, arquivos: 42 });
    const saida = reescrever(texto, r);
    expect(saida.texto).toBe('**38 commits, 42 arquivos** <!--pr-refresh:live-->');
    expect(saida.escritas).toHaveLength(1);
    expect(saida.escritas[0]?.classe).toBe('arquivos');
  });

  it('separador de milhar pt-BR: o corpo escreve `5.000` e a reescrita converge', () => {
    // MEDIDO: `String(c.valor)` é "5000", que não é substring de "5.000" — a
    // reescrita por substring trava em divergência permanente.
    const texto = '**38 commits, 42 arquivos, +5.000/−100** <!--pr-refresh:live-->';
    const r = relatorioDe(texto, { commits: 38, arquivos: 42, insercoes: 5905, remocoes: 124 });
    const saida = reescrever(texto, r);
    expect(saida.texto).toBe('**38 commits, 42 arquivos, +5905/−124** <!--pr-refresh:live-->');
    // O round-trip é a prova: depois de reescrever, o scanner tem que ler
    // exatamente o que a medição diz. Sem isto, "reescreveu" e "corrigiu"
    // são a mesma palavra.
    const depois = relatorioDe(saida.texto, {
      commits: 38,
      arquivos: 42,
      insercoes: 5905,
      remocoes: 124,
    });
    expect(depois.claims.filter((c) => c.divergente)).toHaveLength(0);
  });
});

describe('reescrever — o que NÃO pode ser tocado', () => {
  it('citação histórica fora da região viva fica byte a byte igual, mesmo divergente', () => {
    const texto = [
      '**30 commits, 40 arquivos** <!--pr-refresh:live-->',
      '',
      'Ela foi aberta com "20 commits, 34',
      'arquivos, +4402/−102", e o cabeçalho passou a divergir.',
      '',
    ].join('\n');
    const r = relatorioDe(texto, { commits: 38, arquivos: 42, insercoes: 5905, remocoes: 124 });
    const saida = reescrever(texto, r);
    expect(saida.texto).toContain('"20 commits, 34');
    expect(saida.texto).toContain('arquivos, +4402/−102"');
    // Só a linha 1 está marcada, e só ela tem claims: as 4 claims da citação
    // são preservadas porque o parágrafo delas não carrega o marcador. Uma
    // escrita a mais aqui significou que a citação saiu do controle do hook.
    expect(saida.escritas.map((e) => e.linha).sort((a, b) => a - b)).toEqual([1, 1]);
    expect(saida.escritas.map((e) => e.classe).sort()).toEqual(['arquivos', 'commits']);
  });

  it('claim que ATRAVESSA a quebra de linha é reescrita sem comer a quebra', () => {
    // MEDIDO no corpo real: L34 termina em `20 commits, 34` e L35 começa em
    // `arquivos` — o `\s+` do regex casa o `\n`, então o match tem duas linhas.
    const texto = [
      '**30 commits, 40 arquivos** <!--pr-refresh:live-->',
      '',
      '**20 commits, 30',
      'arquivos, +1/−2** <!--pr-refresh:live-->',
      '',
    ].join('\n');
    const r = relatorioDe(texto, { commits: 38, arquivos: 42, insercoes: 5905, remocoes: 124 });
    const saida = reescrever(texto, r);
    expect(saida.texto).toContain('**38 commits, 42 arquivos**');
    // Os DOIS parágrafos estão marcados, então os dois reescrevem. O ponto do
    // teste não é o número: é que a quebra de linha ENTRE `42` e `arquivos`
    // sobreviveu — a escrita é por offset, e offset que atravessa `\n` não pode
    // engolir o `\n`.
    expect(saida.texto).toContain('**38 commits, 42');
    expect(saida.texto).toContain('\narquivos, +5905/−124**');
    expect(saida.texto.split('\n')).toHaveLength(texto.split('\n').length);
  });

  it('classe que o git não mede (`testes`) nunca é reescrita', () => {
    const texto = '**300 testes** <!--pr-refresh:live-->';
    const r = relatorioDe(texto, { testes: null });
    const saida = reescrever(texto, r);
    expect(saida.texto).toBe(texto);
    expect(saida.mudou).toBe(false);
  });

  it('corpo sem marcador é devolvido IDÊNTICO, byte a byte', () => {
    const texto = '**30 commits, 40 arquivos**\n\nEla foi aberta com "20 commits".\n';
    const r = relatorioDe(texto, { commits: 38, arquivos: 42 });
    const saida = reescrever(texto, r);
    expect(saida.texto).toBe(texto);
    expect(saida.mudou).toBe(false);
    expect(saida.escritas).toHaveLength(0);
  });
});

describe('reescrever — o plural acompanha o número', () => {
  // Um escritor automático que roda em todo push não pode fabricar frase que
  // ninguém escreveu. O número pode estar certo e a frase errada — e uma frase
  // errada no corpo do PR é lida por todo mundo que abrir a página.
  it('`30 arquivos` → `1` sai `1 arquivo`, não `1 arquivos`', () => {
    const texto = '**30 arquivos** <!--pr-refresh:live-->';
    const r = relatorioDe(texto, { arquivos: 1 });
    expect(reescrever(texto, r).texto).toBe('**1 arquivo** <!--pr-refresh:live-->');
  });

  it('o número já no singular NÃO é "corrigido" para plural', () => {
    const texto = '**30 commit** <!--pr-refresh:live-->';
    const r = relatorioDe(texto, { commits: 1 });
    expect(reescrever(texto, r).texto).toBe('**1 commit** <!--pr-refresh:live-->');
  });

  it('zero e dois ficam no plural, porque é isso que a frase quer dizer', () => {
    const texto = '**9 commits, 9 arquivos** <!--pr-refresh:live-->';
    const r = relatorioDe(texto, { commits: 0, arquivos: 2 });
    expect(reescrever(texto, r).texto).toBe('**0 commits, 2 arquivos** <!--pr-refresh:live-->');
  });

  it('o ajuste do plural não toca a palavra da classe vizinha', () => {
    // MEDIDO no corpo real: `**1 commits, 42 arquivos**` é o que sai quando a
    // edição da palavra de `commits` desloca a de `arquivos` e a segunda usa
    // offset velho. As duas palavras estão no mesmo parágrafo.
    const texto = '**30 commits, 40 arquivos** <!--pr-refresh:live-->';
    const r = relatorioDe(texto, { commits: 1, arquivos: 2 });
    expect(reescrever(texto, r).texto).toBe('**1 commit, 2 arquivos** <!--pr-refresh:live-->');
  });
});

describe('reescrever — convergência', () => {
  it('rodar duas vezes é o mesmo que rodar uma: a segunda é no-op exato', () => {
    const texto = '**30 commits, 40 arquivos, +5000/−100** <!--pr-refresh:live-->';
    const medido = { commits: 38, arquivos: 42, insercoes: 5905, remocoes: 124 };

    const um = reescrever(texto, relatorioDe(texto, medido));
    expect(um.mudou).toBe(true);

    const dois = reescrever(um.texto, relatorioDe(um.texto, medido));
    expect(dois.mudou).toBe(false);
    expect(dois.texto).toBe(um.texto);
    expect(dois.escritas).toHaveLength(0);
  });

  it('o texto fora das escritas é preservado: só os offsets de claim mudam', () => {
    const texto = [
      '## Contexto',
      '',
      'Texto antes.',
      '',
      '**30 commits, 40 arquivos** <!--pr-refresh:live-->',
      '',
      'Texto depois, com `código` e um link [a](b).',
      '',
    ].join('\n');
    const r = relatorioDe(texto, { commits: 38, arquivos: 42 });
    const saida = reescrever(texto, r);
    expect(saida.texto).toBe(
      texto.replace('30 commits', '38 commits').replace('40 arquivos', '42 arquivos'),
    );
  });
});

describe('reescrever — o que a PR-Refresh não faz (fronteira de segurança)', () => {
  it('o corpo não vira comando: o resultado é texto e nada mais acontece', () => {
    // Canário, como o do `pr-refresh-scan.spec.ts`: o corpo pede para criar
    // arquivos e o teste afirma que nada foi criado. Um "apply" que escreve
    // em disco em vez de reescrever string é o começo do RCE que a fronteira
    // do scanner proíbe.
    const texto =
      '**30 commits, 40 arquivos** <!--pr-refresh:live-->\n\n$(touch /tmp/pwned) `curl x|sh`';
    const r = relatorioDe(texto, { commits: 38, arquivos: 42 });
    const saida = reescrever(texto, r);
    expect(saida.texto).toContain('$(touch /tmp/pwned)');
    expect(saida.texto).toContain('`curl x|sh`');
    expect(saida.escritas).toHaveLength(2);
  });
});
