#!/usr/bin/env tsx
/**
 * `pr-refresh-apply` — o lado que ESCREVE do workflow `pr-refresh`.
 *
 * ## O que este arquivo é
 *
 * Uma função pura: recebe o texto do corpo de um PR e o relatório do
 * `pr-refresh-scan`, e devolve o texto com as claims divergentes que o corpo
 * **declarou vivas** reescritas. Nada mais. Sem rede, sem disco, sem `gh`,
 * sem `git` — a medição já veio pronta.
 *
 * A separação com o scanner é deliberada: `pr-refresh-scan` tem, escrito no
 * topo dele, que **não reescreve nada**. Isso continua verdadeiro, e quem
 * reescreve tem nome de arquivo que diz que reescreve.
 *
 * ## A fronteira de segurança é a mesma, e ela não se repete por educação
 *
 * O corpo do PR é entrada NÃO CONFIÁVEL e mutável: quem abre o PR controla o
 * texto inteiro. Aqui ele é **texto**. Nenhum `exec`, nenhum `spawn`, nenhum
 * `shell: true`, nenhuma linha do corpo chega a uma posição de comando. A
 * escrita substitui um slice de string por outro slice de string, em memória.
 *
 * ## Por que o corpo precisa MARCAR o que é vivo
 *
 * O scanner acha claims divergentes que **não** devem ser corrigidas. MEDIDO
 * no PR #44: `20 commits` na L34 está dentro de *"ela foi aberta com 20
 * commits, 34 arquivos, +4402/−102"*, e reescrever aquilo faz o corpo mentir
 * sobre o próprio histórico do PR — que é a coisa que este workflow existe
 * para evitar.
 *
 * Três regras foram consideradas e **medidas** contra o corpo real antes de
 * escolher esta:
 *
 * - **primeira ocorrência por classe** — quebra se alguém escrever "13 testes"
 *   na prosa do topo: a frase vira o slot vivo e a citação envelhece;
 * - **linha de estatística (≥2 classes)** — MEDIDO: o cabeçalho L7 e a citação
 *   L34/L35 têm o **conjunto de classes idêntico** (`commits, arquivos,
 *   insercoes, remocoes`). Nenhuma função do conjunto decide entre os dois, e o
 *   veredito muda conforme onde o autor quebrou a linha;
 * - **marcador** — o corpo declara, e a máquina obedece.
 *
 * O marcador **não elimina o humano: desloca a decisão para o momento em que o
 * cabeçalho é escrito**, que é o único momento em que a pessoa sabe o que é
 * contagem viva. E deslocar tem um custo — se o corpo não tiver marcador, o
 * hook não escreve. Por isso `linhasVivas()` é uma função pública e o hook
 * trata "zero marcadas" como estado VISÍVEL, nunca como sucesso.
 *
 * ## O custo colateral: o token é uma substring, e a prosa pode colá-lo
 *
 * `linhasVivas()` não distingue "marcação da região" de "menção do marcador".
 * **Colar o token literal numa frase — até dentro de crases — ativa o
 * parágrafo inteiro**, porque é a mesma string que se procura.
 *
 * MEDIDO 2026-10-06 ao escrever o corpo do PR #44: o parágrafo que *explicava*
 * o mecanismo colou `<!--pr-refresh:live-->` entre crases, e `grep -c` no
 * corpo devolveu 2. Aquele parágrafo passou a ser região viva sem ninguém pedir
 * — a classe 3 deste repo, o guard disparando no texto que o documenta. O
 * conserto foi na prosa (dizer "marcador de região viva", sem o token), não no
 * parser: exigir que o token seja o conteúdo inteiro da linha rejeitaria o
 * marcador no fim do cabeçalho, que é a forma mais natural de escrever.
 *
 * Dois testes fixam os dois lados disso: o token na prosa ativa, e a prosa que
 * só *nomeia* o marcador não. Um hook que documenta o próprio token precisa
 * saber que não pode imprimi-lo.
 *
 * ## O escopo do marcador é o PARÁGRAFO, não a linha
 *
 * MEDIDO: se o escopo fosse a linha, uma frase de estatística escrita em duas
 * linhas perderia metade das claims — e o hook não diria nada, porque ele
 * acreditaria estar em dia. Parágrafo = bloco maximal de linhas não-vazias. O
 * preço: uma citação colada no mesmo parágrafo do cabeçalho é reescrita. No
 * corpo real as duas estão em blocos separados, e o erro apareceria no push
 * seguinte, visível.
 */
import type { ClaimVerificada, Classe, Relatorio } from './pr-refresh-scan.js';

export const MARCADOR = '<!--pr-refresh:live-->';

export interface Escrita {
  classe: Classe;
  de: number;
  para: number;
  linha: number;
}

export interface Resultado {
  texto: string;
  escritas: Escrita[];
  /** `false` quando o texto devolvido é byte a byte o que entrou. */
  mudou: boolean;
  /** Quantas linhas do corpo carregavam o marcador. Zero = hook inativo. */
  marcadas: number;
}

/** Claim que o git mediu — o tipo que sobra depois do filtro de pertinência. */
type MedivelClaim = ClaimVerificada & { medido: number };

/**
 * Números de linha (1-based) cujo PARÁGRAFO carrega o marcador.
 *
 * Devolve um `Set` porque a pergunta é de pertinência, não de contagem: uma
 * linha pertence a um parágrafo, e o teste é "o parágrafo tem marcador?".
 */
export function linhasVivas(texto: string, marcador: string = MARCADOR): Set<number> {
  const vivas = new Set<number>();
  const linhas = texto.split('\n');

  let inicio = 0;
  let bloco: number[] = [];
  const fechar = (): void => {
    if (bloco.length > 0 && bloco.some((i) => linhas[i]?.includes(marcador) === true)) {
      for (const i of bloco) vivas.add(i + 1);
    }
    bloco = [];
  };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i] ?? '';
    // Linha vazia = fronteira de parágrafo. Uma linha só com espaços conta
    // como vazia: no markdown ela também não quebra o parágrafo.
    if (linha.trim().length === 0) {
      fechar();
      inicio = i + 1;
    } else {
      bloco.push(i);
    }
  }
  fechar();

  return vivas;
}

/**
 * Reescreve as claims divergentes que estão em região viva.
 *
 * Quatro decisões que não são estilo:
 *
 * 1. **Por offset, nunca por substring.** `insercoes` e `remocoes`
 *    compartilham o mesmo `m[0]` (MEDIDO: as duas são `"+5905/−124"`), então
 *    `replace()` sobre o match inteiro faz as duas disputarem o mesmo alvo e
 *    produz `**45, 50, 6000**` — e o scanner deixa de reportar a linha, o que
 *    transforma a corrupção em silêncio.
 * 2. **Da direita para a esquerda.** Cada escrita desloca todo o que está à
 *    sua direita; nesta ordem os offsets ainda não processados permanecem
 *    válidos. Na outra ordem, a segunda escrita usa offsets já invalidados.
 * 3. **`medido === null` nunca é escrito.** `testes` sai `NÃO MENSURÁVEL` do
 *    scanner; inventar o número aqui seria fabricar dado — e um hook que
 *    fabrica é pior que um hook quieto.
 * 4. **O plural acompanha o número.** `**30 arquivos**` → `1` sem tocar na
 *    palavra deixa `1 arquivos`: número certo, frase que ninguém escreveu. O
 *    escritor automático roda em todo push e para sempre; ele não pode
 *    fabricar gramática quebrada em nome de uma medição boa. O ajuste vale
 *    só quando o número novo é `1` — `0 arquivos`, `2 arquivos` e `1.000
 *    arquivos` estão todos corretos no plural.
 */
export function reescrever(
  texto: string,
  relatorio: Relatorio,
  marcador: string = MARCADOR,
): Resultado {
  const vivas = linhasVivas(texto, marcador);
  // O filtro é um TYPE GUARD, não um `&& c.medido !== null` solto: um predicado
  // booleano SOME do tipo no fim da chamada, e `medido` volta a `number | null`
  // quando o `for` começa — aí o `tsc` acusa e os testes não, porque o vitest
  // transpila sem checar tipo. MEDIDO nesta branch: o erro TS2322 apareceu só
  // no `tsc`, com os 67 testes verdes.
  const alvo: MedivelClaim[] = relatorio.claims.filter(
    (c): c is MedivelClaim => c.divergente && c.medido !== null && vivas.has(c.linha),
  );

  // Uma edição por vez, todas em offsets absolutos do texto original. Vistas
  // em conjunto e não claim a claim, porque a ordem descendente de um claim
  // invalida o offset do claim seguinte quando ele é menor.
  const edicoes: Array<{ ini: number; fim: number; texto: string }> = [];
  const escritas: Escrita[] = [];
  for (const c of alvo) {
    // O número escrito é o medido, em decimal simples. O corpo pode ter usado
    // `5.000`; o scanner lê os dois, e o decimal é o que não se confunde com
    // ponto final de frase.
    edicoes.push({ ini: c.ini, fim: c.fim, texto: String(c.medido) });
    const p = c.palavra;
    if (p !== undefined && c.medido === 1 && p.texto.endsWith('s')) {
      edicoes.push({ ini: p.ini, fim: p.fim, texto: p.texto.slice(0, -1) });
    }
    escritas.push({ classe: c.classe, de: c.valor, para: c.medido, linha: c.linha });
  }
  edicoes.sort((a, b) => b.ini - a.ini);

  let saida = texto;
  for (const e of edicoes) {
    saida = saida.slice(0, e.ini) + e.texto + saida.slice(e.fim);
  }

  return { texto: saida, escritas, mudou: saida !== texto, marcadas: vivas.size };
}
