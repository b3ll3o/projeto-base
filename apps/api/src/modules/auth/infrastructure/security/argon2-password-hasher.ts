// apps/api/src/modules/auth/infrastructure/security/argon2-password-hasher.ts
//
// Adapter argon2 do `PasswordHasherPort` (que mora em `users/domain/ports/`).
//
// ── POR QUE ARGON2 E NÃO BCRYPT ───────────────────────────────────────────
//
// Argon2id é o vencedor da Password Hashing Competition (2015) e hoje é a
// recomendação do OWASP. Duas vantagem concretas sobre o bcrypt neste
// projeto: (a) o bcrypt TRUNCA a senha em 72 bytes, o argon2 hasha o
// tamanho que receber; (b) o bcrypt usa memória de 4 KiB por hash, o que
// torna um ataque de GPU barato — o argon2id custa 64 MiB por hash por
// default, o que torna o MESMO ataque caro.
//
// ── POR QUE OS PARÂMETROS NÃO VIRAM CONSTANTE AQUI ─────────────────────────
//
// `hash()` usa os defaults da lib (argon2id, m=65536 = 64 MiB, t=3, p=4).
// Medidos em 48 ms/hash neste ambiente. Eles NÃO são reescritos numa
// constante deste arquivo por dois motivos:
//
//  1. O VO `PasswordHash` valida o formato do hash com um regex que aceita
//     QUALQUER `m`/`p`/`t`. Fixar os parâmetros aqui e no VO criaria duas
//     fontes de verdade para o mesmo número — e mudá-los depois exigiria
//     reescrever os dois ou rejeitar hashes válidos já gravados.
//  2. `argon2.needsRehash()` existe para o caso de a política mudar no
//     futuro: o hash antigo continua verificável, e só o `hash()` do
//     cadastro passa a emitir o novo formato.
//
// ── O PONTO DE SEGURANÇA DESTE ARQUIVO ────────────────────────────────────
//
// `verify()` NÃO LANÇA. O `argon2.verify` da lib lança `TypeError` quando
// o digest não é um hash válido (e um `hash === null` vindo de coluna NULL
// no banco também). Se essa exceção escapasse, o fluxo de login responderia
// 500 nesse caso — e o chamador conseguiria distinguir "e-mail não existe",
// "senha errada" (401) e "registro corrompido" (500). Esse último é o
// vetor de enumeração de contas que o `InvalidCredentialsException`
// genérico existe para fechar.
//
// Um hash corrompido é um dado ruim; a resposta certa para dado ruim no
// login é a MESMA resposta do login normal.

import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { PasswordHasherPort } from '../../../users/domain/ports/password-hasher.port.js';

@Injectable()
export class Argon2PasswordHasher implements PasswordHasherPort {
  /**
   * Transforma a senha em claro no hash argon2id que vai para
   * `users.password_hash`.
   *
   * Sem opções explícitas: os defaults da lib já são argon2id/m=65536/
   * t=3/p=4, e o VO `PasswordHash` aceita o formato que sai daqui (couberto
   * por `argon2-password-hasher.spec.ts`).
   *
   * ⚠️ NUNCA logar o retorno nem o argumento.
   */
  async hash(senhaPlana: string): Promise<string> {
    return argon2.hash(senhaPlana);
  }

  /**
   * Confere a senha em claro contra o hash armazenado.
   *
   * Devolve `false` — nunca lança — para hash malformado. Ver a nota sobre
   * enumeração de contas no topo do arquivo.
   */
  async verify(senhaPlana: string, hashArmazenado: string): Promise<boolean> {
    try {
      return await argon2.verify(hashArmazenado, senhaPlana);
    } catch {
      // `argon2.verify` lança TypeError para digest que não é argon2, e o
      // driver pode devolver `null`/`undefined` para coluna NULL — os dois
      // são "não confere", não "erro do sistema". O retorno de `false`
      // mantém o caminho do chamador igual ao da senha errada.
      return false;
    }
  }
}
