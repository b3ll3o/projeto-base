// apps/api/src/modules/auth/application/auth-use-cases.ts
//
// Casos de uso do BC Auth: login, renovação e "quem sou eu".
//
// pt-BR: a aresta é `auth → users`. Este arquivo importa o
// `UserRepositoryPort` e o `PasswordHasherPort` de `users/` — nunca o
// contrário. O port de hash mora em `users/domain/ports/` por isso
// (ver o cabeçalho do próprio port): se morasse aqui, `UserUseCases`
// teria que importar `auth/` para tipar a mesma dependência, e o par
// viraria um ciclo de import ES.
//
// ── A REGRA DO LOGIN ───────────────────────────────────────────────────────
//
// Três invariantes, nesta ordem, e as três são testadas:
//
//  1. **NÃO ENUMERA CONTAS.** E-mail inexistente e senha errada levantam
//     a MESMA `InvalidCredentialsException`, com a MESMA mensagem. Um
//     `detail` diferente por caso é um oráculo de cadastro.
//
//  2. **TEMPO CONSTANTE.** `verify()` roda mesmo sem usuário
//     encontrado, contra um hash descartável gerado de verdade. Um
//     `if (user === null) throw` antes do `verify` responderia em ~1 ms
//     para e-mail inexistente e ~230 ms para e-mail existente (MEDIDO
//     2026-11-09) — a mesma informação, entregue pelo relógio. Por isso o hash
//     de isca é um argon2 real e não `''`: `argon2.verify('')` não custaria nada.
//
//  3. **O HASH NÃO SAI.** O retorno passa por `toUserOutput`, que não
//     lê `senhaHash`. Não há outro caminho de leitura aqui.

import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import { InvalidCredentialsException } from '../domain/exceptions/auth.exceptions.js';
import { InvalidTokenException } from '../domain/exceptions/token.exceptions.js';
import { TOKEN_ISSUER_PORT, type TokenIssuerPort } from '../domain/ports/token-issuer.port.js';
import {
  REFRESH_TOKEN_REPOSITORY_PORT,
  type RefreshTokenRepositoryPort,
} from '../domain/ports/refresh-token-repository.port.js';
import { Email } from '../../users/domain/value-objects/email.vo.js';
import { UserId } from '../../users/domain/value-objects/user-id.vo.js';
import {
  PASSWORD_HASHER_PORT,
  type PasswordHasherPort,
} from '../../users/domain/ports/password-hasher.port.js';
import {
  USER_REPOSITORY_PORT,
  type UserRepositoryPort,
} from '../../users/domain/ports/user-repository.port.js';
import { toUserOutput, type UserOutput } from '../../users/application/dto/user.output.js';

import type { LoginInput } from './dto/login.input.js';
import type { RefreshInput } from './dto/refresh.input.js';
import type { AuthSessionOutput, RefreshOutput } from './dto/auth-session.output.js';

export const AUTH_USE_CASES = Symbol.for('@projeto/api/auth/AuthUseCases');

/**
 * A janela de tolerância do REPLAY (#132), em milissegundos.
 *
 * ⚠️ POR QUE EXISTE: dois `POST /auth/refresh` com o MESMO token são um
 * retry de cliente, duas abas, dois workers — e NÃO um ataque. O refresh
 * token é de uso único (a rotação consome o `jti`), e a segunda chamada
 * encontraria um `jti` já revogado: sem esta janela, ela seria lida como
 * REPLAY e derrubaria a sessão de quem está usando a API de verdade.
 *
 * Passada a janela, é replay — e a resposta é derrubar a conta.
 *
 * 30 s é o suficiente para um retry de rede e curto demais para ser uma
 * janela de ataque (quem rouba um token precisa usá-lo em menos de 30 s
 * para não ser tratado como uso concorrente — e um token de 7 dias dá
 * tempo de sobra).
 */
const JANELA_DE_TOLERANCIA_DE_REPLAY_MS = 30_000;

/**
 * Hash de isca para o caminho "e-mail não existe".
 *
 * Gerado UMA vez por processo e memoizado: custa ~230 ms na primeira
 * chamada e zero nas seguintes, e o valor nunca é reutilizado para
 * verificar nada de verdade — ele existe só para que `verify()` pague o
 * mesmo preço nos dois caminhos.
 *
 * ⚠️ Não pode ser uma constante string no fonte. Um literal fixo
 * acabaria no `git log` e, pior, daria a um atacante com acesso ao
 * repositório um par (senha-hipotética, hash) para testar a
 * configuração do hasher. `randomBytes` elimina as duas saídas.
 */
let hashIsca: Promise<string> | null = null;

/**
 * pt-BR: decorado com `@Injectable()` + `@Inject(TOKEN)` explícito em
 * cada parâmetro porque os tipos são interfaces — apagadas em runtime.
 * Sem token explícito o container passa `undefined` e o defeito só
 * aparece em produção, no primeiro login (é o mesmo modo de falha que
 * o `UserUseCases` documenta no construtor).
 */
@Injectable()
export class AuthUseCases {
  constructor(
    @Inject(USER_REPOSITORY_PORT) private readonly userRepo: UserRepositoryPort,
    @Inject(PASSWORD_HASHER_PORT) private readonly passwordHasher: PasswordHasherPort,
    @Inject(TOKEN_ISSUER_PORT) private readonly tokenIssuer: TokenIssuerPort,
    @Inject(REFRESH_TOKEN_REPOSITORY_PORT)
    private readonly refreshTokens: RefreshTokenRepositoryPort,
  ) {}

  // ─── login ───────────────────────────────────────────────────────────────

  /**
   * Autentica por e-mail + senha e emite o par de tokens.
   *
   * @throws InvalidCredentialsException — e-mail inexistente, senha
   * errada, ou usuário soft-deleted. Os três são indistinguíveis.
   */
  async login(input: LoginInput): Promise<AuthSessionOutput> {
    // A MESMA normalização do cadastro (trim + toLowerCase). Sem ela,
    // ` Joao@Example.com ` não encontraria `joao@example.com`.
    const email = Email.create(input.email);
    // `null` = bucket de SISTEMA (`escopoDoTenant(null)` → `'*'`). O login
    // acontece ANTES de existir empresa: não há header, e um usuário sem
    // membership é invisível sob qualquer outro escopo — a conta simplesmente
    // não existiria para o login.
    const user = await this.userRepo.findByEmail(email, null);

    // ── Timing: verify() roda nos DOIS caminhos ───────────────────────────
    const hashArmazenado = user === null ? await this.hashDescartavel() : user.senhaHash().value;
    const senhaConfere = await this.passwordHasher.verify(input.senha, hashArmazenado);

    if (user === null || user.isDeleted() || !senhaConfere) {
      throw new InvalidCredentialsException();
    }

    const { accessToken, refreshToken, refreshJti, refreshExpiresAt } =
      await this.tokenIssuer.emitir({
        sub: user.id().value,
        email: user.email().value,
      });

    // ⚠️ (#132) O `jti` do refresh é REGISTRADO — é o que o torna
    // revogável. Sem esta linha, o token seria stateless de novo: valeria
    // por 7 dias e não haveria o que revogar.
    await this.refreshTokens.registrar(refreshJti, user.id().value, refreshExpiresAt);

    return { accessToken, refreshToken, user: toUserOutput(user) };
  }

  // ─── renovar ─────────────────────────────────────────────────────────────

  /**
   * Troca um refresh token válido por um par novo.
   *
   * Recarrega o usuário antes de emitir, e isso não é redundância: o JWT
   * vive 7 dias, então um refresh token legitimately válido pode pertencer a
   * uma conta que foi soft-deleted no meio do caminho. Sem esta checagem,
   * "apagar a conta" não tiraria ninguém da sessão.
   *
   * ⚠️ (#132) A ROTACÃO: o `jti` apresentado é CONSUMIDO, e o par novo vem
   * com um `jti` novo. Um refresh token é de uso ÚNICO — é o que faz o
   * logout (e a detecção de replay) terem o que revogar.
   *
   * @throws InvalidCredentialsException — token recusado pelo emissor, ou
   * usuário que não existe mais.
   * @throws InvalidTokenException — o `jti` não está no registro, ou já foi
   * revogado (replay).
   */
  async renovar(input: RefreshInput): Promise<RefreshOutput> {
    // A rejeição de token vem do próprio `tokenIssuer` (InvalidTokenException);
    // ela sobe como está — quem a converte em 401 é o boundary HTTP.
    const subject = await this.tokenIssuer.validarRefreshToken(input.refreshToken);

    // Mesmo bucket do login: o refresh não sabe a empresa, e `eu()` é "quem eu
    // sou", não "o que há na minha empresa".
    const user = await this.userRepo.findById(UserId.create(subject.sub), null);
    if (user === null || user.isDeleted()) {
      throw new InvalidCredentialsException();
    }

    // ⚠️ (#132) O ESTADO do `jti` decide se este token ainda vale.
    const estado = await this.refreshTokens.estadoDe(subject.jti);
    if (!estado.registrado) {
      // O token não tem `jti` conhecido — ou o registro não o tem (token
      // emitido antes da migração), ou ele nunca foi emitido por esta API.
      // Em qualquer caso: não há como revogá-lo depois, e aceitar seria
      // deixar a #132 aberta para os tokens que sobraram.
      throw new InvalidTokenException('refresh token desconhecido');
    }
    if (estado.revogadoEm !== null) {
      // REPLAY (ou uso concorrente — ver a janela de tolerância).
      //
      // ⚠️ O alvo da revogação é o DONO DO REGISTRO (`estado.userId`), e não
      // o `sub` do token: o `sub` é o que o PORTADOR tem. O registro é quem
      // sabe de quem é o token.
      await this.tratarRevogacao(estado.userId ?? subject.sub, estado.revogadoEm);
      throw new InvalidTokenException('refresh token revogado');
    }

    // ⚠️ A ROTAÇÃO é UMA TRANSAÇÃO: consumir o `jti` antigo e registrar o
    // novo acontecem juntos (ou não acontecem). Em transações separadas, o
    // intervalo entre elas deixaria o token antigo consumido e o novo sem
    // registro — e quem pegasse o intervalo ficaria SEM refresh token nenhum,
    // sem caminho de recuperação (o web não renova).
    //
    // E o consumo é ATÔMICO: dois `POST /auth/refresh` com o MESMO token ao
    // mesmo tempo chegam os dois ao `estadoDe` como "ativo" — e só um
    // consegue consumir a linha. O outro leva 401 (que é uso concorrente, e
    // NÃO derruba a conta).
    //
    // O `emitir` (que assina o token novo) é CPU pura e fica ANTES: ele não
    // toca o banco, e o `jti` novo precisa existir para a transação.
    const { accessToken, refreshToken, refreshJti, refreshExpiresAt } =
      await this.tokenIssuer.emitir({
        sub: user.id().value,
        email: user.email().value,
      });

    const rotacionou = await this.refreshTokens.rotacionar(
      subject.jti,
      refreshJti,
      user.id().value,
      refreshExpiresAt,
    );
    if (!rotacionou) {
      // O `jti` já tinha sido consumido — por outro request (uso concorrente)
      // ou por um replay. Nos dois casos, este token não renova.
      throw new InvalidTokenException('refresh token já consumido');
    }

    return { accessToken, refreshToken };
  }

  // ─── sair (logout) ───────────────────────────────────────────────────────

  /**
   * Revoga o refresh token apresentado (#132).
   *
   * ⚠️ Sem isto, o "sair" do web era só apagar o cookie: o token continuava
   * válido no servidor por 7 dias, e qualquer cópia dele (log, backup,
   * dispositivo compartilhado) continuava valendo.
   *
   * ⚠️ O `refreshToken` é a CREDENCIAL do logout — e é por isso que a rota
   * é `@Public()`: quem apresenta o token é quem manda revogá-lo. Exigir o
   * access token seria pedir a credencial de quem já tem o equivalente do
   * token que se quer matar — e o access token vive 15 minutos, o refresh 7
   * dias: quem ficou logado mais de 15 min sem usar a API levaria 401 no
   * logout, e o token continuaria válido.
   *
   * @throws InvalidTokenException — o token não é um refresh válido.
   */
  async sair(input: { refreshToken: string }): Promise<boolean> {
    const subject = await this.tokenIssuer.validarRefreshToken(input.refreshToken);
    // ⚠️ O retorno é VERDADEIRO: um `jti` que nunca entrou no registro (ou que
    // já estava revogado) devolve `false` — e a resposta diz isso, em vez de
    // afirmar uma revogação que não aconteceu.
    return this.refreshTokens.revogar(subject.jti);
  }

  /**
   * A resposta à apresentação de um `jti` JÁ REVOGADO (#132).
   *
   * ⚠️ A JANELA DE TOLERÂNCIA: dois `POST /auth/refresh` com o MESMO token
   * são um retry de cliente, duas abas, dois workers — e não um ataque. Sem
   * a janela, a segunda chamada seria lida como REPLAY e derrubaria a
   * sessão de quem está usando a API de verdade.
   *
   * Passada a janela, é replay — e a resposta é derrubar a conta inteira:
   * o `jti` reapareceu depois de ter sido rotacionado, e quem o apresentou
   * não é mais a pessoa que o recebeu.
   *
   * ⚠️ A revogação é AWAITED antes do 401: se ela corresse em segundo plano,
   * um retry do cliente encontraria a sessão ainda viva.
   */
  private async tratarRevogacao(userId: string, revogadoEm: Date): Promise<void> {
    const idade = Date.now() - revogadoEm.getTime();
    if (idade < JANELA_DE_TOLERANCIA_DE_REPLAY_MS) return;
    await this.refreshTokens.revogarTodosDoUsuario(userId);
  }

  // ─── eu ──────────────────────────────────────────────────────────────────

  /**
   * Devolve o perfil do usuário do token (`GET /auth/me`).
   *
   * ⚠️ `@CurrentUser()` entrega `TokenSubject | undefined`, e o guard é
   * da Fase 6. O `undefined` é tratado pelo controller, não aqui.
   *
   * @throws InvalidCredentialsException — usuário não existe mais.
   * 401 e não 404 de propósito: um token cuja assinatura passou mas cujo
   * usuário sumiu é um token AUTÊNTICO, e um 404 confirmaria isso a quem
   * o apresenta.
   */
  async eu(userId: string): Promise<UserOutput> {
    const user = await this.userRepo.findById(UserId.create(userId), null);
    if (user === null) {
      throw new InvalidCredentialsException();
    }
    return toUserOutput(user);
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  /**
   * Hash descartável para o caminho "e-mail não existe".
   *
   * Memoizado por processo: o primeiro login de um e-mail inexistente
   * paga os ~230 ms do argon2 e os seguintes não pagam — o que é
   * exatamente o que o atacante mede, então o valor é o MESMO dos dois
   * lados, e o que importa (igualdade) se mantém.
   */
  private async hashDescartavel(): Promise<string> {
    hashIsca ??= this.passwordHasher.hash(randomBytes(32).toString('hex'));
    return hashIsca;
  }
}
