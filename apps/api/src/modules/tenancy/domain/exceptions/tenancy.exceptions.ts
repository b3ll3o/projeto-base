// apps/api/src/modules/tenancy/domain/exceptions/tenancy.exceptions.ts
//
// pt-BR (Fase 5 — tenancy, 2026-10-16): violações do fluxo de entrada na
// empresa (D5).
//
// Uma exceção para o convite, com o MOTIVO em vez de quatro classes: o que o
// cliente precisa saber é "por que este convite não serve", e o status HTTP
// muda com o motivo (404 não encontrado, 410 vencido, 409 já usado, 403 de
// outra pessoa). O mapeamento fica em
// `shared/infrastructure/http/domain-exception-to-http.ts`.

export type MotivoConviteInvalido =
  | 'nao-encontrado'
  | 'expirado'
  | 'ja-aceito'
  | 'outro-email'
  /**
   * A conta JÁ é membro da empresa que convidou.
   *
   * MEDIDO 2026-10-21: o dono pode se convidar, e o `INSERT` da membership
   * bate no `@@unique([userId, tenantId])`. Sem tradução, o erro cru sobe
   * como **500** — indistinguível de banco fora do ar, para um pedido que
   * era um conflito (409).
   */
  | 'ja-membro';

export class ConviteInvalidoException extends Error {
  constructor(public readonly motivo: MotivoConviteInvalido) {
    // A mensagem NÃO carrega o motivo, e é por isso.
    //
    // `GlobalExceptionFilter:122` monta `detail: exception.message` — é por
    // esse campo, e não pelo `code`, que o motivo vazaria. Um 403 com
    // `detail: "...(outro-email)"` confirma a quem só tem o token que o
    // token existe e foi emitido para outra pessoa; o status sozinho já
    // entregava a mesma informação, e o `detail` fechava o quadro.
    //
    // MEDIDO: o comentário anterior desta classe prometia "o motivo acima não
    // diz se o segredo existe" **interpolando o motivo na mesma string**.
    // Mesma classe de vazamento já paga em `ProfilePrivilegeEscalationException`
    // (#97, B5), cujo precedente é `super(nomeDaClasse)` com o motivo num
    // campo. A spec que fecha esta está em `domain-exception-to-http.spec.ts`.
    super('ConviteInvalidoException');
    this.name = 'ConviteInvalidoException';
    Object.setPrototypeOf(this, ConviteInvalidoException.prototype);
  }
}

/**
 * A empresa com este `slug` já existe.
 *
 * O `slug` é escolhido pela pessoa que está criando a empresa, então a
 * colisão é **previsível** (duas pessoas digitando "acme"), não um evento
 * raro. Sem tradução, o `P2002` cru do `tx.tenant.create` chega como **500**,
 * indistinguível de banco fora do ar — e o cliente não tem como saber que
 * precisa inventar outro `slug`.
 *
 * 409 e não 400: o pedido era bem formado e o recurso existe. O mesmo
 * tratamento de `ProfileSlugAlreadyInUseException`, que mora no BC de
 * profiles e **não** é reusado aqui — `tenancy` importando `profiles` seria um
 * acoplamento entre BCs.
 */
export class EmpresaJaExisteException extends Error {
  constructor(public readonly slug: string) {
    super('EmpresaJaExisteException');
    this.name = 'EmpresaJaExisteException';
    Object.setPrototypeOf(this, EmpresaJaExisteException.prototype);
  }
}

/**
 * Já existe convite para este e-mail nesta empresa (`@@unique([tenantId, email])`).
 *
 * Difere de `ConviteInvalidoException('ja-aceito')`: aqui o convite **ainda
 * não** foi aceito — é um segundo convite pendente para a mesma pessoa, o que
 * aconteceria quando o dono convida duas vezes sem perceber.
 */
export class ConviteJaEmitidoException extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly email: string,
  ) {
    super('ConviteJaEmitidoException');
    this.name = 'ConviteJaEmitidoException';
    Object.setPrototypeOf(this, ConviteJaEmitidoException.prototype);
  }
}

/**
 * Quem tentou administrar a empresa sem ser `gerente` dela.
 *
 * Separate de `ConviteInvalidoException` de propósito: aqui o token era
 * VÁLIDO e quem o tem é legítimo — o que falhou foi a autorização de quem
 * pediu. Colar os dois num só esconderia essa diferença no log e na
 * resposta, que é onde ela é útil.
 */
export class NaoAdministraEmpresaException extends Error {
  constructor(public readonly tenantId: string) {
    // ⚠️ O `title` do 403 (`domain-exception-to-http.ts`) diz "gerente", e esta
    // mensagem vai para o `detail` do MESMO corpo RFC 7807 — os dois viajam
    // juntos na resposta. Um nome velho num e o nome novo no outro produz um
    // corpo que se contradiz: "Só o gerente…" no título e "Só o owner…" no
    // detalhe. O rename de 2026-10-22 trocou o título e esqueceu esta linha.
    super(`Só o gerente da empresa pode convidar alguém: ${tenantId}`);
    this.name = 'NaoAdministraEmpresaException';
    Object.setPrototypeOf(this, NaoAdministraEmpresaException.prototype);
  }
}
