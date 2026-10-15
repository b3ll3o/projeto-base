// apps/api/src/modules/users/domain/value-objects/password-hash.vo.ts
//
// Value object do HASH argon2id — nunca da senha em claro.
//
// ┌─ POR QUE UM VO, E NÃO UM `string` ──────────────────────────────────────┐
//
// A regra que este VO impõe não é "o valor tem formato X": é "este valor
// NUNCA é impresso". Um `string` comum imprime com `${hash}`, no
// `console.log`, no `template string` de um log de erro — e o hash vaza para
// o stdout, para o agregador de logs, e para o snapshot JSONB de
// `users_history`. É a mesma estratégia do `Secret` do Go e do `Debug` do
// Rust: o tipo carrega a política.
//
// ⚠️ São DOIS mecanismos, e eles não cobrem os mesmos caminhos. Confundir
// os dois foi a origem do vazamento que existia até 2026-10-13:
//
//   a. `toString()` → `[redacted]`. Cobre só a COERÇÃO: template (`` `${vo}` ``)
//      e `String(vo)`. MEDIDO: `console.log(vo)` NÃO passa por aqui — o Node
//      usa `util.inspect`, e imprime `PasswordHash {}`. Sai seguro, mas por
//      causa de (b), não de (a).
//   b. `#value` + getter no prototype. Cobre a SERIALIZAÇÃO ESTRUTURAL:
//      `JSON.stringify`, `util.inspect`, spread, `Object.assign` — todos leem
//      as own properties enumeráveis, nunca `toString()`.
//
// Com o valor em `public readonly value`, (a) sozinha deixava (b) vazando o
// hash INTEIRO. Hoje ambos estão fechados. MEDIDO depois da correção: 0 dos 4
// caminhos de serialização carregam o segredo. Os testes que travam isso
// estão em `password-hash.vo.spec.ts`, e eles têm DENTE — ver as mutações lá.
//
// Esta é a PRIMEIRA das duas barreiras contra o vazamento. A segunda é
// `toUserOutput` não ler o campo — cobrida em `user.output.spec.ts`. São
// independentes de propósito: a segunda quebra no dia em que alguém
// acrescenta um campo ao output "só para depurar", e a primeira quebra no
// dia em que alguém loga o agregado inteiro.
//
// ── O QUE `create()` VALIDA ───────────────────────────────────────────────
//
// Que o valor PAREÇA um hash argon2id. Isto não é vaidade: `PasswordHash.
// create(senhaPlana)` passaria num VO que só checasse "não está vazio",
// e a senha em claro iria para `users.password_hash`. O defeito só
// apareceria no login, como credencial inválida para sempre.
//
// ── MIN_LENGTH/MAX_LENGTH: POLÍTICA DA SENHA, NÃO TAMANHO DO HASH ─────────
//
// ⚠️ Os números abaixo descrevem a SENHA EM CLARO, e é para isso que o
// `CreateUserSchema` os consome no boundary. Eles NÃO delimitam o
// `PasswordHash`: um argon2id real tem ~96 caracteres, ACIMA de
// `MAX_LENGTH = 72`, e aplicar estes números ao hash rejeitaria TODOS os
// hashes válidos — o cadastro inteiro passaria a responder 400.
//
// Por que 72 mesmo assim, se o argon2 não tem o teto de 72B que o bcrypt
// impõe (é o bcrypt que trunca em 72 bytes; o argon2 hasha o tamanho que
// receber)? Porque o limite aqui cumpre uma função diferente da criptográfica:
// é o teto de ENTRADA. Um POST com um megabyte de senha é CPU/memória
// gasta hashando algo que ninguém vai lembrar de digitar, e 72 é a
// convenção de facto da indústria para "senha humana" — o NIST SP 800-63B
// pede um mínimo, e a convenção de máximo curto evita o DoS de payload.
//
// Um teste do arquivo de specs afirma, com um hash real de ~96 chars, que
// `PasswordHash.create` o aceita. É ele que impede a leitura errada.

import { UserValidationException } from '../exceptions/user.exceptions.js';

/**
 * Política de senha: mínimo aceito no boundary (8) e teto de entrada (72).
 *
 * Exportados pelo mesmo motivo de `UserName.MIN_LENGTH`/`MAX_LENGTH` e
 * `Email.MAX_LENGTH`: o Zod do boundary importa daqui em vez de reescrever
 * o número. Um `.min(8)` literal no schema é uma transcrição que envelhece
 * sozinha — MEDIDO 2026-10-08, foi exatamente isso que fez um nome de 1 char
 * passar o boundary e virar 500 no VO.
 *
 * Aplicam-se à senha em claro (veja o aviso no topo do arquivo).
 */
export const MIN_LENGTH = 8;
export const MAX_LENGTH = 72;

/**
 * Envelope do formato PHC do argon2id:
 *
 *   $argon2id$v=<versão>$<parâmetros>$<salt>$<digest>
 *
 * O bloco de parâmetros e o digest são capturados, não casados: ver
 * `temFormatoArgon2id()` abaixo. Os três blocos não podem conter `$`
 * (é o separador do PHC) e todos precisam ser não-vazios — daí os
 * quantificadores `+`, que é o que faz um hash SEM digest final
 * (`...$salt$`) ser recusado.
 */
const ARGON2ID_ENVELOPE_RE = /^\$argon2id\$v=\d+\$([^$]+)\$([^$]+)\$([^$]+)$/;

/** Um par `nome=número` dentro do bloco de parâmetros. */
const PARAMETRO_RE = /^([a-z]+)=(\d+)$/;

/**
 * Os três parâmetros que definem custo/segurança do argon2id.
 *
 * ⚠️ A ORDEM deles NÃO é fixada, e essa é a correção de 2026-10-13. O regex
 * antigo era `/^\$argon2id\$v=\d+\$m=\d+,p=\d+,t=\d+\$…/`, que amarrava a
 * ordem `m=,p=,t=` — a ordem que a node-argon2 0.45.1 emite. MEDIDO: um
 * hash argon2id VÁLIDO na ordem canônica do PHC (`m=,t=,p=`) era RECUSADO
 * com "formato inválido", e no login isso aparece como senha inválida. A
 * ordem canônica do PHC é `m=,t=,p=`; a node-argon2 escreve `m=,p=,t=`.
 * Um regex que escolhe uma das duas recusa a outra — e a segunda é
 * justamente o que aparece num hash migrado de outro sistema ou produzido
 * pela implementação C de referência.
 *
 * Isto NÃO amarra os VALORES (nem `m=65536`, nem `p=4`, nem `t=3`): quem
 * decide os parâmetros é o hasher, não o VO. Um hash gerado com memória
 * maior no futuro tem de continuar passando.
 *
 * Parâmetros ADICIONAIS são aceitos desde que também sejam `nome=número`
 * — o PHC é extensível (as variantes com `keyid`/`data` do draft usam
 * `keyid=<hex>`, que este VO rejeita; ver `o_que_eu_nao_verifiquei` no
 * relatório da tarefa). Exigir só a presença dos três, em vez de exigir
 * exatamente três, é o que mantém a porta aberta sem afrouxar a garantia
 * que importa: um bloco de parâmetros todo numérico e bem formado.
 */
const PARAMETROS_OBRIGATORIOS = ['m', 't', 'p'];

/**
 * Teto de tamanho do hash aceito, em caracteres.
 *
 * MEDIDO 2026-10-13: `[^$]+` não tinha teto e
 * `'$argon2id$v=19$m=65536,p=4,t=3$c2FsdA$' + 'A'.repeat(5 * 1024 * 1024)`
 * passava no regex — um digest de 5 MiB ia para `users.password_hash`
 * (coluna TEXT sem limite) e era reparseado pelo `argon2.verify` a cada
 * tentativa de login.
 *
 * 512 é folgado para qualquer argon2id legítimo: o pior caso razoável
 * (`m=4294967295,t=4294967295,p=4294967295` + salt de 64 bytes + digest de
 * 64 bytes) dá ~230 caracteres. Não rejeita hash válido nenhum.
 *
 * Isto NÃO é política de senha: é teto de ENTRADA, a mesma função de
 * `MAX_LENGTH` para o outro lado da fronteira. Tamanho não é parâmetro de
 * política, e o teste do spec fixa o número no literal de propósito — se
 * este `const` subir sem revisão, o teste fica vermelho.
 */
const TAMANHO_MAXIMO = 512;

/**
 * `true` se `raw` tem o envelope PHC do argon2id e um bloco de parâmetros
 * que contém `m`, `t` e `p` como números, em QUALQUER ordem.
 */
function temFormatoArgon2id(raw: string): boolean {
  const envelope = ARGON2ID_ENVELOPE_RE.exec(raw);
  if (envelope === null) {
    return false;
  }
  // `noUncheckedIndexedAccess` tipa grupo de captura como `string | undefined`
  // mesmo depois de um `exec` bem-sucedido. Os guards abaixo são inalcançáveis
  // — o regex casa 4 grupos — mas é o que o typechecker exige, e a alternativa
  // seria `!`, que aqui só desliga a checagem.
  const blocoParametros = envelope[1];
  if (blocoParametros === undefined) {
    return false;
  }
  const vistos = new Set<string>();
  for (const parte of blocoParametros.split(',')) {
    const parametro = PARAMETRO_RE.exec(parte);
    if (parametro === null) {
      return false;
    }
    const nome = parametro[1];
    if (nome === undefined) {
      return false;
    }
    if (vistos.has(nome)) {
      // Parâmetro repetido (`m=1,m=2`) é malformado, não "mais flexível".
      return false;
    }
    vistos.add(nome);
  }
  return PARAMETROS_OBRIGATORIOS.every((nome) => vistos.has(nome));
}

export class PasswordHash {
  /**
   * ⚠️ Privado, e NÃO `public readonly`, por motivo de segurança — MEDIDO
   * 2026-10-13. Um campo público é uma own property ENUMERÁVEL
   * (`Object.freeze` não mexe na enumerabilidade), e por isso aparecia em
   * `JSON.stringify(h)`, `JSON.stringify({senhaHash: h})`, `util.inspect(h)`
   * e `{...h}` — NENHUM dos quatro passa por `toString()`. Um `#private`
   * não é property: não é enumerável, não é copiado por spread e não é
   * serializado. A API pública é preservada pelo getter `value` abaixo, que
   * mora no PROTOTYPE — e property de prototype não aparece em instância.
   */
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  /**
   * Leitura do hash. É o único caminho de volta ao segredo, e é
   * intencional: o mapper (`user.prisma-mapper.ts`) e o login
   * (`auth-use-cases.ts`) precisam do valor para gravar e para o
   * `argon2.verify`. Quem tem o VO tem o hash — o que este tipo impede é
   * o vazamento ACIDENTAL, não o acesso autorizado.
   */
  get value(): string {
    return this.#value;
  }

  static create(raw: string): PasswordHash {
    if (typeof raw !== 'string') {
      throw new UserValidationException('senhaHash', 'o valor deve ser um texto.');
    }
    // Sem `trim()` de propósito, e sem normalização: um hash é opaco. Se
    // alguém mandar `' <hash> '`, o melhor conserto é recusar — aceitar o
    // trimmed faria o VO devolver um valor diferente do que foi gravado, e
    // o `verify` passaria a falhar contra o banco.
    if (raw.length === 0) {
      throw new UserValidationException('senhaHash', 'o hash da senha não pode ficar em branco.');
    }
    // ANTES do regex, de propósito: casar um regex contra 5 MiB é o
    // DoS que este teto existe para impedir. Medir o comprimento é O(1).
    if (raw.length > TAMANHO_MAXIMO) {
      // A mensagem diz o que fazer sem repetir o valor recebido.
      throw new UserValidationException(
        'senhaHash',
        `o hash excede o tamanho máximo de ${TAMANHO_MAXIMO} caracteres.`,
      );
    }
    if (!temFormatoArgon2id(raw)) {
      // A mensagem diz o que FAZER sem repetir o valor recebido — um
      // `throw` que embute o input põe a senha em claro no log de erro.
      throw new UserValidationException(
        'senhaHash',
        'o formato esperado é um hash argon2id ($argon2id$v=…$m=…,p=…,t=…$salt$digest).',
      );
    }
    return new PasswordHash(raw);
  }

  equals(other: PasswordHash | null | undefined): boolean {
    // `instanceof` antes do acesso a `#value`: ler `#value` de um objeto que
    // não é `PasswordHash` lança TypeError, e um `equals` que lança é pior
    // que um que devolve `false`. Cobre `null`/`undefined` de passagem
    // (`null instanceof X` é `false`).
    return other instanceof PasswordHash && other.#value === this.#value;
  }

  /**
   * ⚠️ Redige. NÃO devolva o hash daqui.
   *
   * Cobre as coerções que passam por este método, e só elas: concatenação
   * em template (`` `${senhaHash}` ``) e `String(vo)`.
   *
   * NÃO cobre `console.log(vo)` — MEDIDO 2026-10-13: o Node usa
   * `util.inspect` num objeto, não `toString()`, e imprime `PasswordHash {}`.
   * Sai seguro, mas por causa de (b) lá no topo, não por causa deste método.
   *
   * NÃO cobre a serialização estrutural — `JSON.stringify`, `util.inspect`,
   * spread e `Object.assign` leem as own properties, não `toString()`. Quem
   * fecha esses caminhos é o `#value` + getter (veja o campo acima e o
   * bloco MEDIDO 2026-10-13 no topo do arquivo). As duas barreiras são
   * diferentes e ambas são necessárias: `toString()` sozinha deixava
   * `JSON.stringify` vazar o hash inteiro.
   */
  toString(): string {
    return '[redacted]';
  }
}
