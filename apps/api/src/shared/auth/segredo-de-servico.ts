// apps/api/src/shared/auth/segredo-de-servico.ts
//
// pt-BR (#120): o guard que decide se um segredo de serviço serve.
//
// O `JWT_SECRET` era validado só por "não está vazio". O
// `.env.production.example` publica `JWT_SECRET=CHANGE_ME_gerar_com_openssl_rand_base64_48`
// como exemplo — e esse valor PASSAVA pela validação. Um operador que copiasse
// a linha do example para o `.env.production` teria um segredo JWT público no
// repositório: quem o conhece forja access token para qualquer `sub`.
//
// ⚠️ O motivo de esta função existir separada do `JwtTokenService` é o mesmo
// do `decisaoDoAdminLocal.ts` (PR #115): uma decisão de segurança que só
// existe dentro de um construtor é uma decisão sem spec. `apps/api/prisma/`
// não tem um único `*.spec.ts`, e o projeto `unit` do Vitest só enxerga
// `src/` — um spec ao lado do seed seria verde por nunca rodar. Aqui a
// função mora em `src/`, é pura, e a spec roda de verdade.
//
// ⚠️ A lista de placeholders é ESTREITA, e o motivo é um falso positivo.
// MEDIDO no example: o placeholder real é `CHANGE_ME_…`. Um `startsWith('secret')`
// recusaria um segredo LEGÍTIMO como `secreto-da-empresa-2026` — o `secret` de
// "segredo". Daí a lista ser por PREFIXO restrito e por VALOR EXATO, e o
// critério principal ser o TAMANHO (32 bytes), que é o que de fato separa um
// segredo de um palpite.

/** Tamanho mínimo, em bytes, de um segredo de serviço aceito. */
export const TAMANHO_MINIMO_SEGREDO = 32;

/**
 * Prefixos que denunciam um valor de exemplo.
 *
 * Comparados em minúsculas, no início do valor (`startsWith`).
 */
export const PREFIXOS_DE_PLACEHOLDER: readonly string[] = [
  'change_me',
  'changeme',
  'trocar-esta-senha',
  'your-secret-here',
];

/**
 * Valores que denunciam um exemplo — comparados INTEIROS.
 *
 * Separados dos prefixos porque um valor exato não pode ser prefixo de um
 * segredo legítimo: `changeme` como segredo inteiro é placeholder, mas
 * `changeme-2026-senha-forte` é um segredo (embora fraco — e aí o critério do
 * TAMANHO é que decide).
 */
export const VALORES_EXATOS_DE_PLACEHOLDER: readonly string[] = [
  'secret',
  'senha',
  'password',
  'trocar',
  'mudar-esta-senha',
];

/**
 * O veredito da validação.
 *
 * `ok: false` traz um `motivo` que NUNCA embute o valor recebido: a mensagem
 * vai para o log de boot, e o log de boot costuma acabar em observabilidade
 * com retenção.
 */
export type VereditoSegredo = { ok: true; valor: string } | { ok: false; motivo: string };

/**
 * Decide se um segredo de serviço serve, e devolve o valor aparado.
 *
 * @param valor o valor cru, do ambiente (`undefined` quando a chave não existe)
 * @param rotulo o nome da variável — só entra na mensagem, nunca o valor
 */
export function segredoDeServico(valor: string | undefined, rotulo: string): VereditoSegredo {
  const aparado = valor?.trim();

  if (!aparado) {
    return {
      ok: false,
      motivo: `${rotulo} é obrigatório (não existe valor default, por decisão de projeto).`,
    };
  }

  const minusculo = aparado.toLowerCase();

  const prefixo = PREFIXOS_DE_PLACEHOLDER.find((p) => minusculo.startsWith(p));
  if (prefixo !== undefined) {
    return {
      ok: false,
      motivo:
        `${rotulo} ainda está com o valor de EXEMPLO (prefixo '${prefixo}'). ` +
        `Gere um valor próprio antes de subir — o do example é público no repositório.`,
    };
  }

  if (VALORES_EXATOS_DE_PLACEHOLDER.includes(minusculo)) {
    return {
      ok: false,
      motivo: `${rotulo} está com um valor de EXEMPLO ('${minusculo}'). Gere um valor próprio.`,
    };
  }

  const bytes = Buffer.byteLength(aparado, 'utf8');
  if (bytes < TAMANHO_MINIMO_SEGREDO) {
    return {
      ok: false,
      motivo:
        `${rotulo} tem ${bytes} bytes, e o mínimo é ${TAMANHO_MINIMO_SEGREDO}. ` +
        `Use \`openssl rand -base64 48\`.`,
    };
  }

  return { ok: true, valor: aparado };
}
