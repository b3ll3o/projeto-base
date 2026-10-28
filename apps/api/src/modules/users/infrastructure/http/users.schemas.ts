// apps/api/src/modules/users/infrastructure/http/users.schemas.ts
//
// Zod schemas para validação de payloads HTTP no BC Users (Task 7.4).
//
// pt-BR:
// - Defense-in-depth na borda HTTP: o use case JÁ valida (VOs `Email`/
//   `UserName` lançam em formato inválido), mas queremos rejeitar 400
//   cedo com mensagens úteis para o cliente, sem depender da ordem
//   `parse → VO.create → save` para falhar tarde.
// - Aplicados via `@Body(new ZodValidationPipe(CreateUserSchema))` em
//   cada rota do `UsersController`. O pipe global noop (`z.any()`)
//   registrado em main.ts fica como fallback; cada rota sobrescreve.
// - Limites de tamanho: IMPORTADOS do VO, não reescritos aqui.
//
//     nome:  UserName.MIN_LENGTH..UserName.MAX_LENGTH  (2..100)
//     email: Email.MAX_LENGTH                          (254)
//     senha: PasswordHash.MIN_LENGTH..MAX_LENGTH       (8..72)  ← senha EM CLARO
//
//   MEDIDO 2026-10-08: este arquivo declarava `min(1).max(120)` e
//   `.max(255)` — enquanto o VO recusava 2..100 e 254. O comentário
//   abaixo dizia "espelha `UserName` VO": espelhava em 118 e 20. A
//   consequência era um nome de 1 char (ou de 101..120) passando o
//   boundary e virando **500** no VO, com a mensagem interna do VO
//   vazada no `detail`. Rejeitar cedo no boundary é a razão de o schema
//   existir — e para isso ele precisa concordar com a regra que aplica.
//
//   RFC 5321 §4.5.3.1.3 dá 254 octetos de "addr-spec" — que é o número
//   que o `Email` VO já usava. A "margem para o @" do comentário
//   anterior somava 1 octeto que o VO não aceitava.
//
//   Os números NÃO são reescritos aqui de propósito: um `.max(120)`
//   literal é uma transcrição que envelhece sozinha. Importar do VO torna
//   a divergência um erro de compilação.
//
// - `novoNome` no PATCH é OBRIGATÓRIO: o endpoint atual é rename-only,
//   e o pipe Zod centraliza a rejeição 400. PATCH parcial (alguns campos
//   opcionais) será modelado em issue próprio, com schema dedicado e
//   `setRequiredByRoute()`.

import { z } from 'zod';
import {
  MIN_LENGTH as NOME_MIN,
  MAX_LENGTH as NOME_MAX,
} from '../../domain/value-objects/user-name.vo.js';
import { MAX_LENGTH as EMAIL_MAX } from '../../domain/value-objects/email.vo.js';
import {
  MIN_LENGTH as SENHA_MIN,
  MAX_LENGTH as SENHA_MAX,
} from '../../domain/value-objects/password-hash.vo.js';
import { UUID_RE } from '../../domain/value-objects/user-id.vo.js';
import {
  LIMITE_MINIMO,
  LIMITE_MAXIMO,
  LIMITE_PADRAO,
} from '../../domain/ports/user-repository.port.js';

/**
 * A PAGINAÇÃO — o contrato das DUAS surfaces de query da API (#124).
 *
 * ⚠️ São DUAS, e a #124 fechou UMA. `GET /users` e `GET /users/:id/history`
 * recebem `cursor` e `limit`; a primeira foi validada, a segunda continuava
 * com `Number(limit)` cru — e `limit=abc` virava `NaN`, que chegava ao
 * `take:` do Prisma: **500**, onde o certo é **400**.
 *
 * O schema da paginação é o DONO do contrato, e as duas surfaces o usam: um
 * `limit` aceito em uma rota e recusado na outra é a mesma regra escrita duas
 * vezes — e a segunda cópia é a que some.
 *
 * O `cursor` é validado com a `UUID_RE` do VO de id — a MESMA regex que o
 * `UserId` usa (e que a `UserOwnershipGuard` importa). Duas cópias do que é
 * "um id" divergem no primeiro ajuste do formato.
 */
export const PaginacaoQuerySchema = z.object({
  cursor: z.string().regex(UUID_RE, 'cursor precisa ser um id (uuid v7)').optional(),
  limit: z.coerce
    .number({ invalid_type_error: 'limit precisa ser um número' })
    .int('limit precisa ser um número inteiro')
    .min(LIMITE_MINIMO, `limit precisa ser no mínimo ${LIMITE_MINIMO}`)
    .max(LIMITE_MAXIMO, `limit precisa ser no máximo ${LIMITE_MAXIMO}`)
    .default(LIMITE_PADRAO),
});

/**
 * Schema da QUERY de `GET /users` (#124).
 *
 * ⚠️ A query era passada CRUA: `limit=abc` virava `Number('abc')` = `NaN`, e
 * o `NaN` chegava ao `take:` do Prisma — **500**, onde o certo era **400**.
 * E `limit=0`/`limit=-5` davam 200 com lista vazia: uma falha silenciosa.
 *
 * ⚠️ `includeDeleted` NÃO é validado estritamente: a normalização
 * ('true'/'1', case-insensitive) é tolerante por contrato, e o que não bate
 * com ela é simply `false`. Validá-lo aqui quebraria clientes que mandam
 * lixo, sem fechar nada.
 */
export const ListUsersQuerySchema = PaginacaoQuerySchema.extend({
  includeDeleted: z.string().optional(),
});

/** O tipo da query já validada. */
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

/**
 * Schema do body de `POST /users`. Valida `nome`, `email` e `senha` no
 * boundary HTTP antes do `UserUseCases.criarUser` (que repete a validação via
 * `UserName.create` / `Email.create`).
 *
 * Os limites vêm do VO. Mudar o VO muda o boundary — que é o ponto: os
 * dois não podem discordar sem que o compilador reclame.
 *
 * ── `senha`: o único campo que NÃO é reprodutível a olho ───────────────────
 *
 * O campo se chama `senha` e a senha vai para o VO do HASH. Parece que os
 * limites do `PasswordHash` (8..72) deviam ser aplicados ao `senha` — e são,
 * mas porque esses números descrevem a SENHA EM CLARO, não o hash. Um
 * argon2id real tem ~96 caracteres, ACIMA de `MAX_LENGTH`; aplicar estes
 * números ao hash rejeitaria TODOS os hashes válidos e o cadastro inteiro
 * passaria a responder 400. Ver o aviso "MIN_LENGTH/MAX_LENGTH: POLÍTICA DA
 * SENHA, NÃO TAMANHO DO HASH" no topo de `password-hash.vo.ts`.
 *
 * `senha` é OBRIGATÓRIA e não tem `.optional()`: um cadastro sem senha cria
 * um User que nunca autentica, e o defeito só apareceria no login (Fase 4)
 * como "credencial inválida para sempre".
 */
/**
 * Para ONDE a conta entra (Fase 5, D5). Ausente = a conta solta de hoje.
 *
 * ⚠️ `discriminatedUnion` e não `z.union` de dois objetos: com `z.union` o Zod
 * tenta os dois e o erro de um payload inválido sai como "chaves desconhecidas"
 * das DUAS metades — a mensagem não diz qual campo falhou. E `destino` só é
 * aceito porque está aqui: MEDIDO 2026-10-17, sem esta chave o boundary fazia
 * strip silencioso e `POST /users { destino: … }` devolvia 201 criando a conta
 * SEM empresa nenhuma, com o cliente acreditando que a empresa tinha sido criada.
 *
 * `slug`: minúsculo, dígitos e hífen, sem hífen nas pontas. É o que vai para a
 * URL da empresa e a chave UNIQUE que o banco usa para recusar a segunda.
 */
const DestinoSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('empresa'),
    // pt-BR: o `.trim()` ANTES do `min` — sem ele, `"   "` (três espaços) passa
    // o `min(2)` e a empresa nasce com o nome em branco. Este ramo e o
    // `CriarEmpresaSchema` de `tenancy-empresas.controller.ts` são a MESMA
    // regra: duas regras para o mesmo dado divergem sozinhas.
    nome: z.string().trim().min(NOME_MIN).max(NOME_MAX),
    // ⚠️ O `.trim()` do `slug` é a MESMA regra do `CriarEmpresaSchema` de
    // `tenancy-empresas.controller.ts` — e as DUAS cópias divergiam: o
    // formulário aparava e a API não. Sem ele, `" acme "` era recusado com a
    // mensagem de FORMATO, que é a mensagem errada para o problema real
    // (espaço em volta).
    slug: z
      .string()
      .trim()
      .min(3)
      .max(50)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug em minúsculo, com dígitos e hífens internos'),
  }),
  z.object({
    tipo: z.literal('convite'),
    // 32 bytes em hex — o comprimento que `randomBytes(32)` produz. Recusar
    // fora dele aqui é o que impede que um segredo curto e chutável chegue ao
    // `emitirConvite`.
    token: z
      .string()
      .length(64)
      .regex(/^[0-9a-f]{64}$/),
  }),
]);

export const CreateUserSchema = z.object({
  nome: z.string().min(NOME_MIN).max(NOME_MAX),
  email: z.string().email().max(EMAIL_MAX),
  senha: z.string().min(SENHA_MIN).max(SENHA_MAX),
  destino: DestinoSchema.optional(),
});

/** Tipo inferido do `CreateUserSchema` — consumido pelo controller. */
export type CreateUserDto = z.infer<typeof CreateUserSchema>;

/**
 * Schema do body de `PATCH /users/:id`. Endpoint rename-only:
 * `novoNome` é obrigatório (2..100 chars, os limites do `UserName`).
 * PATCH parcial será modelado em issue próprio com schema dedicado.
 */
export const UpdateUserSchema = z.object({
  novoNome: z.string().min(NOME_MIN).max(NOME_MAX),
});

/** Tipo inferido do `UpdateUserSchema` — consumido pelo controller. */
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
