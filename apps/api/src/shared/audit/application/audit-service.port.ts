/**
 * AuditServicePort — interface do port (DDD).
 *
 * Define o contrato que o domínio consome para registrar e consultar
 * auditoria. A implementação concreta (InMemory no teste, Prisma em prod)
 * é resolvida por DI via token AUDIT_SERVICE_PORT.
 *
 * pt-BR: domain não conhece a infraestrutura; este port é o limite.
 */

import type { AuditContext } from '../domain/audit-context.vo.js';

export type AuditOperation = 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE';

export interface AuditRecordInput {
  /**
   * O NOME da entidade auditada — e ele é um RÓTULO, e não um filtro.
   *
   * ⚠️ MEDIDO 2026-11-17 (revisão do PR #171): `users_history` e
   * `users_archive` NÃO têm coluna de entidade (`entity_name` não é
   * coluna), e o filtro da leitura é só o `entity_id`. A consequence é
   * medida: uma segunda entidade auditada na MESMA tabela com o MESMO id
   * leria a trilha da outra.
   *
   * ⚠️ A MITIGAÇÃO está na FRONTEIRA de leitura: o `snapshot` é PROJETADO
   * (`toUserHistoryEntryDto`), e o que não é campo de `UserOutputDto` não
   * vai para o wire. Uma segunda entidade com um id diferente não é
   * alcançável pelo filtro; uma com o MESMO id é, e a trilha dela sai com
   * os campos vazios — em vez de sair rotulada como a de uma pessoa.
   *
   * Separar as entidades de verdade é uma COLUNA (`entity_name`) e uma
   * migration — e o filtro da leitura passaria a ser `entity_name` + `entity_id`.
   */
  entityName: string;
  entityId: string;
  operation: AuditOperation;
  previousVersion: number | null;
  newVersion: number;
  snapshot: Record<string, unknown>;
  reason?: string | null;
}

export interface HistoryEntry {
  /**
   * O id da LINHA na tabela de auditoria — e o **cursor** que a leitura
   * devolve.
   *
   * ⚠️ Ele não é o id da entidade: `users_history` tem a PK própria
   * (`gen_random_uuid()`), e o `entityId` é o id do agregado auditado. São
   * dois ids diferentes, e o cursor é o da LINHA.
   *
   * pt-BR (2026-11-17): o campo não existia, e a consequência foi o cursor
   * **não ter dono**: a produção devolvia `last.id` (o id que só o
   * repositório Prisma enxergava), e o duplo em memória — que não tinha
   * de onde tirar um id de linha — inventava um **offset numérico** (`"20"`),
   * que a API recusa com 400 na página seguinte. Um contrato que só a
   * implementação de produção consegue cumprir é um contrato que o teste
   * não mede.
   */
  id: string;
  entityId: string;
  version: number;
  previousVersion: number | null;
  operation: AuditOperation;
  /**
   * O snapshot — e ele pode ser NULO.
   *
   * ⚠️ MEDIDO 2026-11-17 (revisão do PR #171): a coluna é `Json` NOT NULL, e
   * o Postgres aceita `jsonb 'null'` — que é NOT NULL e é nulo. O cast
   * `as Record<string, unknown>` mentia, e a leitura quebrava na projeção
   * (um `TypeError` que derrubava a rota com 500).
   */
  snapshot: Record<string, unknown> | null;
  changedAt: Date;
  changedBy: string | null;
  reason: string | null;
}

export interface ArchiveEntry {
  /**
   * O id da LINHA no archive — e o **cursor** que a leitura devolve.
   *
   * ⚠️ pt-BR (2026-11-17): o campo não existia, e a consequência foi o
   * cursor do archive não ter dono — o duplo em memória devolvia um **offset
   * numérico** (`"20"`), e a produção devolvia o id da linha. O mesmo
   * formato, o mesmo contrato: um cursor que só a produção cumpre é um
   * contrato que o teste não mede.
   */
  id: string;
  entityId: string;
  version: number;
  /** O snapshot — e ele pode ser NULO (o mesmo `jsonb 'null'` da trilha). */
  snapshot: Record<string, unknown> | null;
  deletedAt: Date;
  deletedBy: string | null;
  reason: string | null;
}

export interface ListHistoryInput {
  /**
   * O NOME da entidade — um RÓTULO, e não um filtro (veja
   * `AuditRecordInput.entityName`): a tabela não tem coluna de entidade, e o
   * filtro da leitura é o `entity_id`.
   */
  entityName: string;
  entityId: string;
  cursor?: string | null;
  limit: number;
  /**
   * A ordem da leitura — e o cursor anda **na direção dela**.
   *
   * ⚠️ `'asc'` (padrão) é a ordem CRONOLÓGICA: da versão mais antiga para a
   * mais recente. `'desc'` é a ordem da trilha de auditoria de quem lê:
   * **a mais recente primeiro**.
   *
   * pt-BR (2026-11-17): o campo não existia, e a consequência foi que a
   * ordem era imposta ao **leitor** — a tela do administrador do sistema
   * mostrava as 100 versões mais ANTIGAS, e as mais recentes (as que dizem
   * quando a pessoa mudou pela última vez) eram as que o teto de páginas
   * cortava. Inverter a exibição **sem** isto não resolveria: o cursor anda
   * junto com a ordem, e o cursor da API andava para o mais antigo.
   */
  ordem?: 'asc' | 'desc';
}

export interface GetHistoryEntryInput {
  entityName: string;
  entityId: string;
  version: number;
}

export interface ArchiveInput {
  entityName: string;
  entityId: string;
  version: number;
  snapshot: Record<string, unknown>;
  reason?: string | null;
  ctx: AuditContext;
}

export interface ListArchiveInput {
  entityName: string;
  cursor?: string | null;
  limit: number;
}

export interface GetArchiveEntryInput {
  entityName: string;
  entityId: string;
}

/**
 * Contrato que o domínio consome.
 * Implementações: InMemoryAuditService (Fase 2), PrismaAuditService (Fase 6).
 *
 * pt-BR (Fase 10+, 2026-10-17) — o escopo de tenant das LEITURAS:
 * `tenantId` é o segundo argumento das três leituras, e é `string | null`
 * porque `null` é o bucket de SISTEMA, não "sem escopo". As DUAS escritas não
 * o recebem: elas já carregam `AuditContext`, que passou a ter `tenantId`
 * (ver `AuditContextProps`) — e é justamente por isso que o escopo é o mesmo
 * dado do ator, e não um argumento que pode divergir dele.
 *
 * Por que as leituras precisaram e antes não: `users_history.entity_id` é o
 * uuid do usuário, então ler histórico cross-tenant é o que entregava o
 * material da escalada descrita na §3 da migration `20261020000001`.
 *
 * ⚠️ O PORT NÃO EXPÕE O ESCOPO NAS ENTRADAS, e isso é uma decisão, não uma
 * lacuna esquecida: `users_history` e `users_archive` não têm coluna de
 * empresa — a trilha é escopada pela POLICY (RLS), e a policy decide pelo
 * `entity_id` e pelo bucket. O `PrismaAuditService` abre o bucket
 * correspondente (`comEscopoDeEmpresa`) e é ele que executa o filtro.
 *
 * A consequência é medida: o duplo em memória é CEGO ao escopo — e por isso
 * NENHUMA spec pode afirmar sobre o CONTEÚDO de uma leitura sem afirmar
 * antes o ARGUMENTO de escopo (o `tenantId` com que a leitura foi chamada).
 * Sem o argumento, a asserção mede o duplo, e o duplo não filtra.
 */
export interface AuditServicePort {
  record(input: AuditRecordInput, ctx: AuditContext): Promise<void>;

  listHistory(
    input: ListHistoryInput,
    tenantId: string | null,
  ): Promise<{ entries: HistoryEntry[]; nextCursor: string | null }>;

  getHistoryEntry(
    input: GetHistoryEntryInput,
    tenantId: string | null,
  ): Promise<HistoryEntry | null>;

  archive(input: ArchiveInput): Promise<void>;

  listArchive(
    input: ListArchiveInput,
    tenantId: string | null,
  ): Promise<{ entries: ArchiveEntry[]; nextCursor: string | null }>;

  getArchiveEntry(
    input: GetArchiveEntryInput,
    tenantId: string | null,
  ): Promise<ArchiveEntry | null>;
}
