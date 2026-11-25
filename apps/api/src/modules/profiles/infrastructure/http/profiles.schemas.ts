// apps/api/src/modules/profiles/infrastructure/http/profiles.schemas.ts
//
// Zod schemas dos corpos HTTP do BC de Perfis (issue #185, code-N1-003).
//
// ⚠️ O QUE ESTE ARQUIVO CONSERTA
//
// O pipe global de Zod no `main.ts` é `ZodValidationPipe(z.any())` — um NOOP
// declarado de propósito, e o comentário ao lado do registro diz a regra:
// "cada rota sobrescreve via `@Body(new ZodValidationPipe(SchemaDoDto))`".
// Três rotas de admin NÃO sobrescreviam, e o corpo CRU chegava ao agregado:
//
//   POST /admin/profiles        — `initialPermissions` fora de `string[]`
//   PUT  /admin/users/:id/profile — `profileId` fora de `string | null`
//   POST /admin/profiles/:id/authorizations — `permissionKey` fora de `string`
//
// O agregado itera `initialAuthorizations` sem checar o TIPO
// (`profile.aggregate.ts`: `for (const key of props.initialAuthorizations ?? [])`),
// e o `?? []` só protege de `null`/`undefined`: um objeto ou um número passam
// intactos e a rota responde **500** (TypeError: object is not iterable) onde o
// certo é **400 VALIDATION_ERROR**. E uma STRING passa como iterable de
// CARACTERES — cada caractere vira uma permissão candidata e a mensagem de
// erro nomeia uma permissão que o cliente nunca pediu.
//
// Os dois irmãos degradem para 400 por ACASO (a defesa do agregado e do VO
// pegam a chave inválida), não por contrato — e isso é o que a issue mediu.
//
// ⚠️ POR QUE A LISTA DE PERMISSÕES NÃO USA O CONSTRUTOR DE ARRAY DO ZOD
//
// O advisory do zod (GHSA `1243066`, `vulnerable <4.6.6`) é uma exaustão de
// memória ao validar COLEÇÕES CONSTRITAS (`z.array`, `z.tuple`). O repo está
// em zod `3.25.76` — a correção do advisory exige a major 4, fora de escopo —,
// e a exceção em `.tooling/scripts/ci/excecoes-de-dependencias.json` se
// sustenta por **ausência** do padrão `z\.(array|tuple)\(` em `apps/api/src`
// (MEDIDO: 0 ocorrências fora de spec). O construtor de array do zod aqui ABRE o caminho do
// advisory e reprova a exceção — o preflight fica vermelho.
//
// Por isso a lista é validada por `z.custom`, que NÃO é a coleção constrita do
// zod, e com um **teto de tamanho** derivado do catálogo de permissões (o
// dono do número): um perfil só pode ter permissões do catálogo, então o
// catálogo é o teto natural — e ele é a fonte única, não uma transcrição.
//
// A chave em si continua sendo validada pelo DOMÍNIO
// (`InvalidPermissionKeyException` → 400): o schema diz a FORMA, o agregado
// diz a VALIDADE.

import { z } from 'zod';
import { PERMISSIONS } from '../../../../shared/auth/permissions-catalog.js';
import { UUID_RE_QUALQUER_VERSAO } from '../../../../shared/domain/uuid.js';
import { ProfileName } from '../../domain/value-objects/profile-name.vo.js';
import { ProfileSlug } from '../../domain/value-objects/profile-slug.vo.js';

/**
 * O teto de `initialPermissions` — o **catálogo** é o dono do número.
 *
 * Um perfil concede permissões do catálogo (`PERMISSIONS`), então a lista não
 * pode ser maior que ele. O número vem do dono, não de um literal: mudar o
 * catálogo muda o teto.
 */
const LIMITE_DE_PERMISSOES = PERMISSIONS.length;

/**
 * Valida um valor pelo VO, e devolve a **mensagem do VO** como erro.
 *
 * Os VOs (`ProfileName`, `ProfileSlug`) são a fonte única das regras — o
 * mesmo motivo pelo qual `users.schemas.ts` importa os limites de lá em vez
 * de reescrevê-los.
 *
 * ⚠️ É `superRefine` (e não `refine`), e a razão é a VERSÃO do zod: no zod
 * `3.25.76` (a do repo) o `refine` reprova só quando o retorno é `false` —
 * uma string de mensagem é TRUTHY e APROVA. MEDIDO 2026-11-25: com o
 * `refine`, `{slug: 'Slug Inválido'}` passava pelo schema inteiro. O
 * `superRefine` é o que permite acrescentar o erro COM a mensagem do VO
 * (`ctx.addIssue`), e é ele que reprova de verdade.
 */
function validoPeloVo(
  criar: (valor: unknown) => unknown,
): (valor: unknown, ctx: z.RefinementCtx) => void {
  return (valor: unknown, ctx: z.RefinementCtx): void => {
    try {
      criar(valor);
    } catch (erro) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: erro instanceof Error ? erro.message : 'valor inválido',
      });
    }
  };
}

/** O nome do perfil — pelas regras do `ProfileName` (2..80, aparado). */
const NomeDePerfil = z.string().superRefine(validoPeloVo((valor) => ProfileName.create(valor)));

/** O slug do perfil — pelas regras do `ProfileSlug` (kebab-case, 3..40). */
const SlugDePerfil = z.string().superRefine(validoPeloVo((valor) => ProfileSlug.create(valor)));

/**
 * A lista de chaves de permissão.
 *
 * ⚠️ `z.custom` e NÃO `z.array` — ver o cabeçalho (o advisory do zod).
 * O predicado exige lista de textos e respeita o teto do catálogo.
 */
const ListaDeChavesDePermissao = z.custom<string[]>(
  (valor) => {
    if (!Array.isArray(valor)) return false;
    if (!valor.every((item) => typeof item === 'string')) return false;
    // ⚠️ O teto conta as chaves DISTINTAS, e não o comprimento: um perfil
    // concede permissões do CATÁLOGO, e o catálogo é quem tem o número. Com o
    // comprimento, uma lista de 9 cópias da MESMA chave caía em 400 — e o
    // domínio (que deduplica) aceitaria. E o tamanho bruto da lista não é
    // problema de memória: o limite do corpo é do Fastify (1 MB), não nosso.
    return new Set(valor).size <= LIMITE_DE_PERMISSOES;
  },
  {
    message: `initialPermissions precisa ser uma lista de chaves de permissão (no máximo ${LIMITE_DE_PERMISSOES} distintas)`,
  },
);

/**
 * O corpo de `POST /admin/profiles`.
 *
 * `description` é opcional (perfil sem descrição é um estado válido) e
 * `initialPermissions` também (perfil sem permissão inicial é um perfil sem
 * concededão — o agregado trata `[]`).
 */
export const CriarPerfilSchema = z.object({
  slug: SlugDePerfil,
  name: NomeDePerfil,
  // ⚠️ `null` é aceito, e o `PATCH` também aceita: um perfil sem descrição é
  // um estado válido, e `null` e "ausente" dizem a MESMA coisa aqui (o
  // agregado nasce com `description: null`).
  description: z.string().nullable().optional(),
  initialPermissions: ListaDeChavesDePermissao.optional(),
});

/** Tipo inferido do `CriarPerfilSchema` — consumido pelo controller. */
export type CriarPerfilDto = z.infer<typeof CriarPerfilSchema>;

/**
 * O corpo de `PATCH /admin/profiles/:id`.
 *
 * ⚠️ `description` é `null` OU AUSENTE, e são coisas diferentes: ausente = o
 * cliente não tocou no campo (o valor é PRESERVADO); `null` = o cliente pediu
 * a limpeza (o valor é apagado). O `z.string().nullable().optional()` é o que
 * dá nome a essa diferença — sem o `.nullable()`, `null` seria recusado, e
 * sem o `.optional()`, "ausente" seria recusado.
 */
export const AtualizarPerfilSchema = z.object({
  name: NomeDePerfil,
  description: z.string().nullable().optional(),
});

/** Tipo inferido do `AtualizarPerfilSchema` — consumido pelo controller. */
export type AtualizarPerfilDto = z.infer<typeof AtualizarPerfilSchema>;

/**
 * O corpo de `PUT /admin/users/:id/profile` — o perfil do usuário.
 *
 * `profileId` é `string | null`: `null` é o estado "usuário sem perfil", e é
 * um valor que o cliente manda DE PROPÓSITO.
 */
export const AtribuirPerfilSchema = z.object({
  // ⚠️ A FORMA do UUID vem do DONO (`shared/domain/uuid.ts`), e não de um
  // `.uuid()` reescrito: o repo tem um único lugar que diz o que é um id
  // aceitável, e `users.schemas.ts` já importa dele.
  //
  // E a AUSÊNCIA continua válida: `profileId` ausente é o mesmo que
  // `profileId: null` (o usuário fica sem perfil) — e é o que o `PUT` fazia
  // antes deste PR.
  profileId: z
    .string()
    .regex(UUID_RE_QUALQUER_VERSAO, 'profileId precisa ser um id (uuid)')
    .nullable()
    .optional(),
});

/** Tipo inferido do `AtribuirPerfilSchema` — consumido pelo controller. */
export type AtribuirPerfilDto = z.infer<typeof AtribuirPerfilSchema>;

/**
 * O corpo de `POST /admin/profiles/:id/authorizations` — a chave concessora.
 *
 * A VALIDADE da chave é do domínio (`isPermissionKey`): o schema diz a FORMA
 * (texto não vazio), e o agregado diz se a chave existe no catálogo.
 */
export const ConcederAutorizacaoSchema = z.object({
  // ⚠️ SEM `.trim()`: a comparação com o CATÁLOGO é EXATA (o domínio), e
  // aparar aqui transformaria `' users.read '` (que era 400
  // INVALID_PERMISSION_KEY) numa concessão de `users.read`. O schema diz a
  // FORMA (texto não vazio); quem diz se a chave EXISTE é o domínio.
  permissionKey: z.string().min(1, 'permissionKey não pode ser vazio'),
});

/** Tipo inferido do `ConcederAutorizacaoSchema` — consumido pelo controller. */
export type ConcederAutorizacaoDto = z.infer<typeof ConcederAutorizacaoSchema>;
