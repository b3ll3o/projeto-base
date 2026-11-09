// apps/api/src/modules/auth/infrastructure/security/jwt-token.service.ts
//
// Adapter `@nestjs/jwt` do `TokenIssuerPort`.
//
// ── POR QUE O SEGREDO É PASSADO POR CHAMADA E NÃO VIA `JwtModule` ────────
//
// O segredo é lido do `ConfigService` aqui e repassado como `secret` em
// CADA `signAsync`/`verifyAsync`. A alternativa seria registrá-lo no
// `JwtModule.register({ secret })` da fase 5, mas aí a validação de
// "segredo obrigatório" viveria no módulo — que é construído DEPOIS dos
// providers, e um módulo sem segredo não falha: ele apenas registra o
// `JwtService` que só explodiria no primeiro login. Aqui a recusa acontece
// na CONSTRUÇÃO do provider, que é o ponto em que o Nest instancia os
// providers e aborta o boot.
//
// Consequência para a fase 5: `JwtModule.register({})` sem segredo basta —
// o segredo que vale é o desta classe.
//
// ── `typ`: O DISCRIMINADOR QUE SEGURA TUDO ─────────────────────────────────
//
// Access (15 min) e refresh (7 dias) saem da mesma função e são a mesma
// estrutura HMAC. Sem `typ` no payload, um refresh token — que vive 7 dias
// e costuma ficar onde o JavaScript lê fácil — passaria por
// `validarAccessToken` e daria acesso à API por uma semana. `validar*Token`
// conferem assinatura, expiração E `typ`; um token sem `typ` é rejeitado
// pelos dois.
//
// ── TTLs ──────────────────────────────────────────────────────────────────
//
// `JWT_ACCESS_TTL` (default `15m`) e `JWT_REFRESH_TTL` (default `7d`) são
// strings no formato do `ms`, que é o que o `jsonwebtoken` entende. O
// fallback é `||` e não `??` DE PROPÓSITO: `JWT_ACCESS_TTL=` numa linha de
// `.env` chega como string vazia, e `??` deixaria passar um `expiresIn: ''`
// que o jsonwebtoken rejeita com erro de timespan no primeiro login.

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { InvalidTokenException } from '../../domain/exceptions/token.exceptions.js';
import { segredoDeServico } from '../../../../shared/auth/segredo-de-servico.js';
import type {
  RefreshSubject,
  TokenIssuerPort,
  TokenPair,
  TokenSubject,
} from '../../domain/ports/token-issuer.port.js';

/** TTL padrão do access token (15 minutos). */
export const DEFAULT_ACCESS_TTL = '15m';
/** TTL padrão do refresh token (7 dias). */
export const DEFAULT_REFRESH_TTL = '7d';

/**
 * Tipo que o `expiresIn` do jsonwebtoken aceita: `number` de segundos ou
 * `StringValue` — uma união de template literals ("15m", "7d", …) que
 * representa o conjunto que o pacote `ms` entende.
 *
 * O TTL vem do AMBIENTE em runtime, então o TypeScript não tem como provar
 * que a string lida pertence a essa união — o cast é o único caminho, e
 * ele é seguro porque o jsonwebtoken valida a string no uso (`ms()` lança
 * em span desconhecido). Tipar o campo como `string` e passar direto daria
 * o mesmo erro em dois lugares; o que muda é o cast ficar nomeado e
 * documentado num lugar só.
 *
 * O `NonNullable` não é enfeite: `JwtSignOptions['expiresIn']` inclui
 * `undefined` porque a propriedade é opcional, e com
 * `exactOptionalPropertyTypes: true` (herdado da base do repo) passar
 * `{ expiresIn: … | undefined }` para `expiresIn?: …` é erro — o valor
 * precisa ser atribuído de fato, nunca "talvez".
 *
 * É `export` porque o e2e de refresh precisa assinar token **vencido** com o
 * segredo real do app, e tipar o TTL ali como `number | string` é
 * exatamente o tipo que o `ms` recusa (`StringValue` é uma união de template
 * literals, não `string`). Reexportar mantém a afirmação num lugar só, que é o
 * que o comentário acima promete.
 */
export type Ttl = NonNullable<JwtSignOptions['expiresIn']>;

@Injectable()
export class JwtTokenService implements TokenIssuerPort {
  // pt-BR: campos declarados ANTES do construtor — não por estilo, mas
  // porque o `strictPropertyInitialization` só enxerga a propriedade para
  // o corpo do construtor quando a declaração vem antes.
  private readonly chave: string;
  private readonly accessTtl: Ttl;
  private readonly refreshTtl: Ttl;

  /**
   * pt-BR: `@Inject(...)` EXPLÍCITO nos dois parâmetros é obrigatório,
   * não redundância. Medido neste repo: em dev o `tsx` (esbuild) NÃO emite
   * `design:paramtypes`, e sem o token explícito o Nest injeta `undefined`
   * — o defeito só aparece quando o código toca a dependência, ou seja, em
   * produção e no primeiro login, nunca no build.
   */
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {
    this.chave = lerChaveObrigatoria(this.config);
    this.accessTtl = (this.config.get<string>('JWT_ACCESS_TTL') || DEFAULT_ACCESS_TTL) as Ttl;
    this.refreshTtl = (this.config.get<string>('JWT_REFRESH_TTL') || DEFAULT_REFRESH_TTL) as Ttl;
  }

  /**
   * Assina o par de tokens de um login (ou de um refresh).
   *
   * Os dois saem de uma chamada porque precisam ser coerentes entre si:
   * mesmo `sub`, mesmo `email`, e o refresh expira depois do access.
   *
   * ⚠️ (#132) Os DOIS ganham um `jti` — e cada um o seu. O `jti` é a
   * IDENTIDADE do token: é o que o registro de revogação indexa, e é o que
   * o logout revoga. Sem ele, o refresh era um JWT stateless sem
   * identidade — e nada no servidor podia invalidá-lo.
   *
   * O `jti` do ACCESS não é registrado (o registro é dos refresh tokens) —
   * mas ele existe, e por um motivo concreto: o access token vive 15
   * minutos e o refresh 7 dias, e um token sem `jti` é um token que pode
   * ser reproduzido byte a byte. MEDIDO: sem `jti`, o par emitted no mesmo
   * segundo era IDÊNTICO ao anterior — e a rotação (que troca o jti) é o
   * que impede a reentrada de um token já usado.
   */
  async emitir(assunto: { sub: string; email: string }): Promise<TokenPair> {
    const base = { sub: assunto.sub, email: assunto.email };
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...base, typ: 'access', jti: accessJti },
        { secret: this.chave, expiresIn: this.accessTtl },
      ),
      this.jwt.signAsync(
        { ...base, typ: 'refresh', jti: refreshJti },
        { secret: this.chave, expiresIn: this.refreshTtl },
      ),
    ]);
    return {
      accessToken,
      refreshToken,
      refreshJti,
      // O `exp` do token que acabou de ser assinado — decodificado, e não
      // calculado a partir do TTL: o TTL é uma string no formato do `ms`
      // ('7d', '24h'), e convertê-lo aqui exigiria um parser do `ms` (que
      // não é dependência direta). O token JÁ sabe quando expira.
      refreshExpiresAt: this.expiraEm(refreshToken),
    };
  }

  /**
   * O instante de expiração de um token assinado, lido do próprio token.
   *
   * `decode` NÃO valida a assinatura — e não precisa: o token acabou de ser
   * assinado por esta classe, com a chave daqui.
   */
  private expiraEm(token: string): Date {
    const payload = this.jwt.decode(token) as { exp?: number } | null;
    if (payload?.exp === undefined) {
      // Um token sem `exp` não expira — e um token que não expira é um
      // token que não pode ser revogado por prazo. O TTL é sempre passado,
      // então isto é o ramo IMPOSSÍVEL; e ele é ruidoso de propósito.
      throw new Error('token sem `exp`: o refresh token não tem prazo de expiração.');
    }
    return new Date(payload.exp * 1000);
  }

  /**
   * @throws quando o token não é um access token válido (assinatura,
   *         expiração ou `typ`). O `JwtAuthGuard` da fase 6 converte em
   *         401 — a mensagem não distingue os três casos de propósito.
   */
  validarAccessToken(token: string): Promise<TokenSubject> {
    // ⚠️ (#132) O `jti` do access token NÃO é exposto: o `TokenSubject` é o
    // que o guard consome, e ele não tem `jti` no contrato. O `jti` do
    // access existe no PAYLOAD (é o que impede dois logins na mesma segunda
    // de produzirem o mesmo token), mas ninguém o consome.
    return this.validarCom(token, 'access').then(({ sub, email }) => ({
      sub,
      email,
      typ: 'access' as const,
    }));
  }

  /** @throws idem `validarAccessToken`, para o par de tipo `refresh`. */
  validarRefreshToken(token: string): Promise<RefreshSubject> {
    return this.validarCom(token, 'refresh').then((subject) => {
      // ⚠️ (#132) Um refresh token SEM `jti` é de antes da migração (o par
      // stateless antigo) — e ele não tem como ser revogado: sem identidade
      // no registro, não há o que revogar. Ele é RECUSADO, e o efeito é
      // deslogar toda sessão que existia no momento do deploy. A alternativa
      // (aceitar) deixaria a #132 aberta justamente para os tokens que
      // sobraram. Ver o ADR.
      if (subject.jti === undefined) {
        throw new InvalidTokenException('token sem jti');
      }
      return { sub: subject.sub, email: subject.email, typ: 'refresh', jti: subject.jti };
    });
  }

  /**
   * Verifica assinatura + expiração e SÓ DEPOIS confere o `typ`.
   *
   * A ordem importa: um `typ` estranho com assinatura inválida tem de cair
   * em "token inválido" pelo mesmo caminho de um token adulterado, e não
   * num branch de erro que diga "este é um refresh token" — essa
   * informação não pode vazar para quem está com o token na mão.
   *
   * ⚠️ `verifyAsync` LANÇA a exceção da biblioteca (`JsonWebTokenError`
   * "jwt malformed", `TokenExpiredError` "jwt expired", "invalid
   * signature"). Deixá-la escapar produzia **HTTP 500** com a mensagem
   * interna no `detail` — e o 500 em vez do 401 é o defeito, porque o
   * contrato do endpoint (`auth.controller.ts`) promete 401 para refresh
   * inválido. MEDIDO: `POST /auth/refresh` com token inválido, expirado ou
   * de tipo trocado respondia 500 nos três casos.
   *
   * Por que o guard não salvava: `refresh` é `@Public()`, então
   * `JwtAuthGuard.canActivate` retorna no passo 1 sem olhar o token, e o
   * único `catch` em torno de `validar*Token` fica dentro do guard.
   *
   * O motivo interno vai em `motivo` (para o log) e NUNCA em `message`
   * (que é o que o `GlobalExceptionFilter` serializa) — ver
   * `token.exceptions.ts`.
   */
  private async validarCom(
    token: string,
    typEsperado: 'access' | 'refresh',
  ): Promise<TokenSubject & { jti?: string }> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.chave,
      });
    } catch (erro) {
      throw new InvalidTokenException(erro instanceof Error ? erro.message : 'token inválido');
    }

    // Token sem `typ` é rejeitado pelos DOIS validadores: ele não veio de
    // `emitir()`, e aceitar abriria um caminho sem classificação.
    if (payload['typ'] !== typEsperado) {
      throw new InvalidTokenException('token inválido');
    }
    const sub = payload['sub'];
    const email = payload['email'];
    if (typeof sub !== 'string' || typeof email !== 'string') {
      throw new InvalidTokenException('token inválido');
    }

    // ⚠️ (#132) O `jti` é OPCIONAL aqui — porque o `TokenSubject` é também o
    // retorno de `validarAccessToken`, e o guard não usa `jti`. Quem exige
    // o `jti` é o `validarRefreshToken` (que o tipa como `RefreshSubject`).
    const jti = payload['jti'];
    return {
      sub,
      email,
      typ: typEsperado,
      ...(typeof jti === 'string' ? { jti } : {}),
    };
  }
}

/**
 * Lê `JWT_SECRET` e recusa o boot quando ele não serve.
 *
 * Não existe valor default — nem em produção, nem em desenvolvimento. Um
 * segredo JWT padrão é a falha mais explorada de auth em Node: ele é
 * público no repositório, e quem o conhece forja access token para qualquer
 * `sub`. O caso mais comum é `JWT_SECRET=` esquecido numa linha de `.env`,
 * que chega aqui como `''` — daí o `trim()`.
 *
 * ⚠️ A mensagem de recusa NUNCA embute o valor recebido: ela vai para o log
 * de boot, e o log de boot costuma acabar em observabilidade com retenção.
 */
function lerChaveObrigatoria(config: ConfigService): string {
  // #120: a validação era só "não está vazio" — e o valor de EXEMPLO do
  // `.env.production.example` (`CHANGE_ME_gerar_com_openssl_rand_base64_48`)
  // passava. Quem copiasse a linha do example para o `.env.production` teria
  // um segredo JWT público no repositório.
  //
  // A decisão mora em `shared/auth/segredo-de-servico.ts` (função pura, com
  // spec) — o mesmo motivo do `decisaoDoAdminLocal.ts` do PR #115: decisão
  // de segurança dentro de um construtor é decisão sem spec.
  const veredito = segredoDeServico(config.get<string>('JWT_SECRET'), 'JWT_SECRET');
  if (!veredito.ok) {
    const onde =
      config.get<string>('NODE_ENV') === 'production'
        ? 'em produção (o serviço se recusa a assinar token sem ele)'
        : 'não tem valor default por decisão de projeto';
    throw new Error(`${veredito.motivo} (${onde}).`);
  }

  return veredito.valor;
}
