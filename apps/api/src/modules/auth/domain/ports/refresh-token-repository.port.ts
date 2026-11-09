// apps/api/src/modules/auth/domain/ports/refresh-token-repository.port.ts
//
// Port do REGISTRO de refresh tokens (#132).
//
// ── POR QUE ESTE PORT EXISTE ───────────────────────────────────────────────
//
// Antes, o refresh token era um JWT stateless: o par access/refresh saía da
// MESMA função, com o MESMO payload (`sub`, `email`, `typ`) e SEM `jti`.
// Não havia lista de revogação, nem logout no backend, nem binding de
// sessão — um refresh token vazado valia por 7 dias e se renovava sozinho,
// sem que nenhuma ação do titular o invalidasse.
//
// A virada é dar ao token uma IDENTIDADE (`jti`) que o servidor conhece: um
// token cujo `jti` está revogado é recusado, mesmo que a assinatura HMAC
// esteja perfeita. A assinatura prova que o token é do servidor; o
// REGISTRO prova que ele ainda vale — e é o registro que sabe de QUEM é o
// token (não o token, que é o que o portador tem).
//
// Ver `docs/adr/0007-refresh-token-revogavel.md`.

/** Token de injeção de dependência para `RefreshTokenRepositoryPort`. */
export const REFRESH_TOKEN_REPOSITORY_PORT = Symbol('RefreshTokenRepositoryPort');

/**
 * O estado de um `jti` no registro.
 *
 * ⚠️ São TRÊS estados, e não dois: um booleano "revogado?" não distingue
 * "nunca existiu" de "existe e está revogado" — e a diferença muda a
 * resposta. Um `jti` que NÃO EXISTE é um token de antes da migração (ou de
 * outra origem), e é recusado; um `jti` que EXISTE e foi revogado é um token
 * que a API já rotacionou — e o re-presentar é REPLAY.
 */
export interface EstadoDeRefreshToken {
  /** A linha existe no registro? */
  registrado: boolean;
  /** QUANDO foi revogada — `null` quando está ATIVA (ou não existe). */
  revogadoEm: Date | null;
  /**
   * De QUEM é o token — e a fonte AUTORITATIVA.
   *
   * ⚠️ A detecção de replay revoga a conta inteira, e o alvo dessa revogação
   * tem de ser o DONO DO REGISTRO, e não o `sub` do token: o `sub` é o que o
   * PORTADOR tem. Hoje os dois são iguais por construção — o `jti` nasce com o
   * `sub` do usuário — mas o registro é quem sabe, e é ele que manda.
   */
  userId: string | null;
}

export interface RefreshTokenRepositoryPort {
  /**
   * Registra um `jti` emitido.
   *
   * Idempotente por `jti`: o `jti` é único por construção (`randomUUID`), e
   * um `upsert` aqui tornaria o registro seguro contra a repetição do
   * mesmo login.
   *
   * ⚠️ O `upsert` NÃO ressuscita um token revogado: o `update` só mexe no
   * prazo. Um `registrar` repetido não pode DESPREVOGAR.
   */
  registrar(jti: string, userId: string, expiresAt: Date): Promise<void>;

  /**
   * O estado do `jti` no registro.
   *
   * O `jti` de um token que a API nunca emitiu é `desconhecido` — e o token
   * é recusado. É o que fecha a porta para os refresh tokens emitidos ANTES
   * da migração (eles não têm `jti`): o serviço de token recusa um token
   * sem `jti`, e o registro recusa um `jti` que não conhece.
   */
  estadoDe(jti: string): Promise<EstadoDeRefreshToken>;

  /**
   * Revoga o `jti` (consome o token).
   *
   * Idempotente: revogar um `jti` já revogado não muda nada.
   *
   * ⚠️ O retorno diz se a revogação ACONTECEU AGORA — e ele é o que fecha a
   * corrida da rotação. Dois `POST /auth/refresh` com o MESMO token ao mesmo
   * tempo (retry de cliente, duas abas) chegam os dois ao `estadoDe` como
   * "ativo"; se o CONSUMO não for ATÔMICO, os dois emitem um par novo, e o
   * token roubado que se apresenta na MESMA janela também passaria. Com o
   * retorno, só o que realmente consumiu o token renova — o outro recebe 401.
   */
  revogar(jti: string): Promise<boolean>;

  /**
   * ROTACIONA: consome o `jti` antigo e registra o novo, NA MESMA
   * TRANSAÇÃO.
   *
   * ⚠️ POR QUE UM MÉTODO SÓ, E NÃO DOIS: consumo e registro em transações
   * separadas deixam uma janela em que o token antigo JÁ foi consumido e o
   * novo NUNCA entrou no registro — e quem pegou o intervalo é sem refresh
   * token nenhum, sem caminho de recuperação (o web não renova). Com uma
   * transação só, ou os dois acontecem, ou nenhum: nunca existe um token
   * emitido sem registro.
   *
   * O `emitir` (que assina o token novo) é CPU pura e fica ANTES — ele não
   * toca o banco.
   *
   * @returns `true` quando a rotação aconteceu; `false` quando o `jti`
   *          antigo já tinha sido consumido (uso concorrente ou replay).
   */
  rotacionar(jtiAntigo: string, jtiNovo: string, userId: string, expiresAt: Date): Promise<boolean>;

  /**
   * Revoga TODOS os tokens vivos da conta.
   *
   * ⚠️ É a resposta da DETECÇÃO DE REPLAY: um `jti` já revogado que
   * reaparece significa que alguém está usando um token que a API já
   * rotacionou — e a resposta padrão (revogar a conta inteira) derruba
   * também as sessões legítimas. Ver o ADR para o prazo de tolerância da
   * janela de concorrência.
   */
  revogarTodosDoUsuario(userId: string): Promise<void>;
}
