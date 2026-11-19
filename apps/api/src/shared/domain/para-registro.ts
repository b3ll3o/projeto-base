// apps/api/src/shared/domain/para-registro.ts
//
// A FORMA do valor que vai para um REGISTRO — o DONO único dessa forma.
//
// pt-BR (2026-11-17, revisão do PR #171): o `:id` que o cliente manda no
// path chegava ao `Logger` CRU — e um `\n` nele gravava uma linha de log em
// branco, ou pior, uma linha que PARECE outra. O conserto da primeira revisão
// trocou o valor cru por um "sanitizado", e a sanitização removia os
// caracteres em vez de substituí-los: um `:id` de `!!!` virava uma string
// VAZIA, e dois ids diferentes (`!!!` e `$$$`) produziam a MESMA linha de
// registro — a escalada deixava de ser atribuível.
//
// Este arquivo é o DONO da forma, ao lado do `uuid.ts` (que é o dono da
// "forma" do uuid): quem precisa registrar um valor que veio do cliente
// importa daqui, e não escreve o regex no lugar.

import { createHash } from 'node:crypto';

/**
 * O que a linha do registro aceita — e o resto vira `_`.
 *
 * ⚠️ A lista é EXPLICITA (e não "sem espaço e sem controle"): o registro é
 * lido por gente, e o que ele precisa é de não carregar o que o cliente
 * escreveu — quebra de linha, barra invertida, aspas (que abrem um campo de
 * log estruturado) e os controles.
 */
const PERMITIDO = /[^0-9a-zA-Z._:/-]/g;

/** O tanto do valor sanitizado que vai para a linha do registro. */
const LIMITE = 64;

/**
 * A IMPRESSÃO digital do valor cru — 12 hex, ou 48 bits.
 *
 * ⚠️ MEDIDO 2026-11-18 na 5ª revisão do PR #171: eram 8 hex (32 bits), e o
 * limite de COLISÃO pelo paradoxo dos aniversários sobre N valores é ~2^16
 * (≈65 mil) — e o texto afirmava, como se fosse garantido, que "dois ids
 * malformados diferentes não produzem a mesma linha". Com 48 bits o limite
 * sobe para ~2^24 (≈16 milhões).
 */
function impressao(valor: string): string {
  return createHash('sha256').update(valor).digest('hex').slice(0, 12);
}

/**
 * O valor que vai para o REGISTRO — e ele não é o valor cru do cliente.
 *
 * ⚠️ A substituição (e não a remoção) é o que mantém o ALVO: `!!!` vira
 * `___`, e a linha ainda diz que houve um alvo — mesmo que inútil. Com a
 * remoção, o alvo sumia da linha.
 *
 * ⚠️ E a IMPRESSÃO digital vai junto quando o valor foi alterado (ou
 * truncado): sem ela, `!!!` e `$$$` produziriam a mesma linha — e a escalada
 * deixaria de ser atribuível a um alvo. A impressão tem 48 bits: a colisão é
 * improvável, e NÃO é impossível (o limite de aniversários é ~2^24) — por
 * isso o texto do registro não promete unicidade. Com o valor já seguro (um
 * uuid, um path), a linha sai como é: a impressão seria ruído.
 */
export function paraRegistro(valor: string): string {
  const seguro = valor.replace(PERMITIDO, '_').slice(0, LIMITE);
  if (seguro === valor) return valor;
  return `${seguro}#${impressao(valor)}`;
}
