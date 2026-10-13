// apps/api/src/modules/users/infrastructure/persistence/user-persistence.exceptions.ts
//
// ── O QUE É ISTO ────────────────────────────────────────────────────────────
//
// Falha de INTEGRIDADE DE DADOS persistidos — não erro de requisição.
//
// O caso que o motiva: `PasswordHash.create()` recusa um valor que não tem o
// formato argon2id, e ele lança `UserValidationException`. Essa exceção é
//mapped por `domain-exception-to-http.ts` para **400 VALIDATION_ERROR**. Mas
// uma coluna `password_hash` corrompida (migration mal aplicada, restore de
// backup, escrita manual) NÃO é uma requisição inválida: é o servidor com um
// registro que ele mesmo gravou em algum momento e não deveria ter gravado.
//
// Sem a tradução, `findByEmail()` — chamado no login — estourava o VO e o
// cliente recebia 400. Três consequências ruins, todas do mesmo `instanceof`:
//
//   1. 400 manda o cliente corrigir e reenviar. Ele reenvia, recebe 400 de
//      novo, e a linha corrompida continua lá. O defeito não é do cliente e
//      nenhuma quantidade de retry o conserta.
//   2. Um 400 é uma resposta de NEGAÇÃO ("seus dados estão errados"); a falha
//      é de AFIRMAÇÃO sobre o estado do servidor. O status mente sobre onde
//      está o problema, e é por isso que o alerta não sai.
//   3. A mensagem do VO viaja no `detail` da resposta — o `GlobalExceptionFilter`
//      faz `detail = exception.message` para tudo que não é `HttpException` — e
//      a serialização estrutural (`JSON.stringify`) da `UserValidationException`
//      carrega `campo` e `motivo` como own properties enumeráveis, sem passar
//      por `toString()`. Qualquer valor bruto numa mensagem chega ao cliente
//      por dois caminhos, e o chamador do login não é autenticado.
//
// ── POR QUE NÃO HÁ CLASSE DE INFRAESTRUTURA NESTE REPO ───────────────────────
//
// Esta é a PRIMEIRA. Não existe `*InfrastructureException` nem
// `*PersistenceException` em lugar nenhum até agora — verificado por
// `grep -rn "class .*Exception" apps/api/src | grep -v spec` (13 classes, todas
// de domínio/aplicação). O que o repositório JÁ tem, e que este arquivo reusa
// em vez de inventar um terceiro jeito:
//
//   a) O 500 já existe: `domain-exception-to-http.ts:190` — qualquer exceção que
//      não seja de domínio/aplicação cai no fall-through
//      `{ status: 500, code: 'INTERNAL', title: 'Erro interno' }`. Portanto esta
//      classe NÃO precisa (e não deve) ser conhecida pelo mapper de HTTP: ela
//      estende `Error` e é por isso que pega 500. O fall-through já é testado
//      em `domain-exception-to-http.spec.ts` ("Error genérico → 500 INTERNAL").
//
//   b) O identificador de correlação já existe, e é a MESMA expressão em dois
//      outros lugares do repo:
//        - `shared/infrastructure/http/global-exception.filter.ts:42-44`
//        - `modules/users/infrastructure/http/users.controller.ts:329-338`
//      `trace.getSpan(context.active())?.spanContext().traceId ?? randomUUID()`.
//      O traceId W3C primeiro (32 hex) porque correlaciona a falha com o trace
//      no backend OTel; `randomUUID()` como último recurso porque
//      `AuditContext` RECUSA `correlationId` vazio e este pode ser chamado
//      fora de uma request.
//
// ── POR QUE A MENSAGEM NÃO TEM NENHUM IDENTIFICADOR DA LINHA ────────────────
//
// id e email foram deixados de fora de propósito, e o motivo é o mesmo que
// faz o `InvalidCredentialsException` ter detalhe fixo (`auth.exceptions.ts`):
// o `detail` de uma resposta de login é lido por quem NÃO está autenticado.
// Um `id` na mensagem do 500 confirma a quem chamou o login que aquele e-mail
// existe — e um 500 neste fluxo já é, sozinho, um oráculo de existência. A
// investigação aponta pelo `correlationId`, que o operador casa com o log
// (`GlobalExceptionFilter` loga `[${traceId}] … -> INTERNAL: ${detail}`) e com
// o trace no OTel. O custo assumido: o log não diz QUAL linha está corrompida.
//
// ⚠️ TRADE-OFF CONHECIDO, MEDIDO por quem escreve isto: a exceção original é
// DESCARTADA, e com ela o motivo (`UserValidationException` dizia qual das
// três regras do VO falhou). Guardá-la como `cause` seria o conserto óbvio e
// seria um erro: `cause` é mais um caminho pelo qual a mensagem original — que
// pode carregar `row.passwordHash` — escaparia, e o ponto do `catch` é ser a
// ÚLTIMA linha antes do cliente. O diagnóstico fino fica no VO, que já emite
// mensagens sem o valor.

import { context, trace } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';

/**
 * Identificador de correlação da requisição/trace corrente.
 *
 * pt-BR: exportado daqui para que a resolução do id tenha UM lugar só nesta
 * camada. A expressão é deliberadamente idêntica à do `GlobalExceptionFilter`
 * e à do `buildContext` do controller — divergir dela criaria um correlationId
 * que o operador não consegue casar com o `traceId` da resposta.
 *
 * Fora de qualquer span ativo (spec unitária, job, boot) devolve um
 * `randomUUID()`: um id vazio faria o construtor abaixo falhar, e o
 * `AuditContext` recusa `correlationId` vazio pelo mesmo motivo.
 */
export function correlationIdAtual(): string {
  const span = trace.getSpan(context.active());
  return span?.spanContext().traceId ?? randomUUID();
}

/**
 * Falha de infraestrutura ao converter dado persistido em agregado.
 *
 * Mapeia para **500 INTERNAL** pelo fall-through de `mapExceptionToHttp` — esta
 * classe é deliberadamente desconhecida daquele mapper. Registrá-la lá com um
 * ramo próprio seria um segundo lugar com o mesmo comportamento, e a
 * verificação "esta exceção não é de validação" passaria a depender de uma
 * entrada que alguém pode remover sem ver o `catch` que depende dela.
 *
 * A mensagem é FIXA. Não recebe o valor recebido, nem o id, nem o email, nem o
 * motivo do VO — ver o bloco de trade-offs no topo do arquivo.
 *
 * @throws {TypeError} se `correlationId` vier vazio ou só com espaços. Falha
 * cedo: uma exceção de infraestrutura sem id de correlação é exatamente a
 * falha que o id existe para evitar, e ela não pode ser logada nem casada.
 */
export class UserPersistenceException extends Error {
  /** `traceId` W3C do span ativo, ou `randomUUID()` fora de span. */
  readonly correlationId: string;

  constructor(correlationId: string) {
    const id = correlationId?.trim() ?? '';
    if (id === '') {
      throw new TypeError('UserPersistenceException: correlationId não pode ser vazio');
    }
    super(
      'Falha de infraestrutura ao converter a linha de `users` em agregado: ' +
        'o valor persistido em `password_hash` viola a invariante do value object ' +
        `PasswordHash. Investigue pelo correlationId ${id}.`,
    );
    this.name = 'UserPersistenceException';
    this.correlationId = id;
    // Mesmo defensivo das demais classes do repo (`user.exceptions.ts:63`,
    // `audit.exceptions.ts:57`): sobrevive a um `instanceof` vindo de um
    // arquivo já transpilado para CommonJS.
    Object.setPrototypeOf(this, UserPersistenceException.prototype);
  }
}
