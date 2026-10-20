#!/usr/bin/env tsx
/**
 * Gate de Conventional Commits — a única hook do framework husky que estava
 * vazia. `pre-commit` roda prettier e os reviewers, `pre-push` roda o preflight,
 * e a **mensagem** não era validada por nada, mesmo com o Conventional Commits
 * declarado em prosa (`idioma.md` e `git-workflow.md`).
 *
 * ## Por que não `@commitlint/cli`
 *
 * MEDIDO 2026-10-20 contra o `git log` deste repo: o `config-conventional`
 * stock reprovaria commits **daqui** — assunto de 119 caracteres (ele corta em
 * 72), 7 commits tipados sem escopo (ele exige escopo), corpos livres. Uma
 * dependência que rejeita o histórico existente é regressão, não melhoria, e é
 * o que motivou medir em vez de adotar por hábito.
 *
 * ## Por que a lista de tipos é um literal, e mesmo assim não envelhece
 *
 * Os 7 tipos vêm do `git log`, não de palpite. Um literal envelhece — e por
 * isso o spec tem um **diferencial contra o histórico real**: roda este gate
 * sobre todo `git log --format=%s` e exige zero erro. No dia em que alguém usar
 * um tipo novo, é o teste que fica vermelho e força a lista a crescer. O
 * literal envelhece sozinho; o que impede que o aging passe despercebido é o
 * teste, não a lista.
 *
 * ## As três regras deliberadamente AUSENTES
 *
 * - **Limite de tamanho.** O histórico tem assunto de 119 caracteres; um limite
 *   só produziria um `--amend` para reescrever algo que já era legível.
 * - **Escopo obrigatório.** 7 dos commits tipados não têm escopo.
 * - **Dicionário pt-BR na descrição.** Exigido por `idioma.md`, e nenhum
 *   regex distingue "descrição em português" de "descrição em francês". Um gate
 *   que fingisse medir isso seria pior que não medir: consumiria confiança.
 */

/**
 * Tipos medidos no `git log` deste repo — e só eles.
 *
 * ## São três listas, e elas divergem de propósito
 *
 * MEDIDO 2026-10-20: este gate aceita 7 tipos; `review-routing.md` mapeia 8
 * (inclui `perf`, que aqui é REJEITADO); `review-router.ts` conhece 10 (inclui
 * `perf`, `build` e `style`). As três divergem, e a divergência é deliberada:
 *
 * - esta lista responde "o que **foi usado** aqui". `perf`/`build`/`style`
 *   nunca aparecem no `git log`, porque ninguém conseguiu commitar com eles
 *   depois que o gate passou a existir — e o diferencial do spec, que é a
 *   proteção contra lista envelhecida, mede o **histórico**, então ele é
 *   cego a esse tipo de deriva por construção.
 * - `review-router.ts` responde "o que o roteador **consegue** encaminhar".
 *   Aceitar `build` aqui só adicionaria uma palavra que nenhum commit carrega.
 *
 * Se as três um dia devirem ser a mesma lista, a decisão é de semver do
 *Conventional Commits, não um efeito colateral de fundir dois arrays.
 */
export const TIPOS: readonly string[] = ['feat', 'fix', 'chore', 'docs', 'test', 'refactor', 'ci'];

/**
 * `tipo(escopo?): descrição`.
 *
 * O escopo é `[^()\s]+` — sem parênteses, sem espaço. É o que impede que a
 * descrição engula o parêntese e vire um "escopo" de 40 palavras, que é como um
 * regex permissivo deixa uma mensagem inválida parecer válida.
 */
const REGRA = /^(?<tipo>[a-z]+)(?:\((?<escopo>[^()\s]+)\))?!?: (?<descricao>\S.*)$/;

/**
 * Commits que o git escreve sozinho.
 *
 * Um gate que exige Conventional Commit de um merge do GitHub está errado
 * sobre o que é Conventional Commit. Eles saem por `skipped` **com motivo
 * declarado** — nunca em silêncio, que é a diferença entre "não havia o que
 * verificar" e "verifiquei e passei" (regra dos 3 estados em
 * `docs/fluxo-desenvolvimento.md`).
 *
 * MEDIDO 2026-10-20: o padrão NÃO distingue autor. `Merge meu trabalho`
 * escrito por uma pessoa casa e sai liberado com o motivo impresso. O que
 * segura o bypass é o motivo à vista, não o autor — ninguém passa por um
 * merge perdido entre `git commit` e `git log` sem deixar o registro.
 */
const ISCAO = /^(?:Merge |Revert "|fixup! |squash! |amend! )/;

export interface ResultadoGate {
  ok: boolean;
  errors: string[];
  skipped?: boolean;
  reason?: string;
}

/**
 * Verifica uma mensagem de commit. Função pura: recebe a string e devolve o
 * veredito. Nada de disco, nada de git — é o que a torna testável contra o
 * histórico inteiro sem spawn.
 */
export function verificarMensagemCommit(mensagem: string): ResultadoGate {
  // CRLF normalizado ANTES do split. MEDIDO 2026-10-20: sem isto, o mesmo
  // byte `\r` dava dois vereditos — `feat: x\r\n` passava (o `trim()` final
  // come o `\r`) e `feat(gates): x\r\ncorpo\r\n` reprovava, porque o `.` do
  // regex não casa `\r`. A reprovação é fail-closed, ou seja segura, mas a
  // mensagem de erro imprimia o `\r` cru e o terminal comia a linha seguinte.
  const texto = mensagem.replace(/\r\n?/g, '\n').trim();

  if (texto.length === 0) {
    return { ok: false, errors: ['mensagem de commit vazia'] };
  }

  // Conventional Commits restringem o ASSUNTO; o corpo é prosa livre. A primeira
  // versão ancorava o regex na string toda (`$` sem flag `m`), e por isso
  // rejeitava qualquer commit com corpo — que é a maioria.
  const [assunto = ''] = texto.split('\n');

  if (ISCAO.test(assunto)) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `commit gerado pelo git ("${assunto}") — Conventional Commits não se aplica`,
    };
  }

  const match = REGRA.exec(assunto);
  if (match?.groups === undefined) {
    return {
      ok: false,
      errors: [
        `mensagem fora do formato Conventional Commits: "${trunca(assunto)}" — ` +
          'esperado `tipo(escopo?): descrição`, ex.: "feat(gates): o que muda e por quê"',
      ],
    };
  }

  const errors: string[] = [];
  const tipo = match.groups['tipo'] ?? '';
  if (!TIPOS.includes(tipo)) {
    errors.push(
      `tipo "${tipo}" fora da lista — use um de: ${TIPOS.join(', ')} ` +
        '(medido em git log; se o novo tipo é legítimo, acrescente aqui e o teste diferencial cobra)',
    );
  }

  return { ok: errors.length === 0, errors };
}

/** Trunca o assunto no relato — o erro não precisa devolver a mensagem inteira. */
function trunca(assunto: string): string {
  return assunto.length > 72 ? `${assunto.slice(0, 72)}...` : assunto;
}

// ── CLI: o que a `.husky/commit-msg` chama ────────────────────────────────

const invocadoDireto = process.argv[1]?.includes('commit-msg-gate') === true;
if (invocadoDireto) {
  const arquivo = process.argv[2];
  if (arquivo === undefined) {
    process.stderr.write('uso: commit-msg-gate.ts <caminho-do-arquivo-de-mensagem>\n');
    process.exit(2);
  }

  const { readFileSync } = await import('node:fs');
  const r = verificarMensagemCommit(readFileSync(arquivo, 'utf8'));

  if (r.skipped === true) {
    process.stdout.write(
      `ℹ️  commit-msg: ${r.reason ?? 'sem motivo declarado'}. Commit liberado.\n`,
    );
    process.exit(0);
  }
  if (!r.ok) {
    process.stderr.write(`❌ commit-msg: ${r.errors.join('\n   ')}\n`);
    process.exit(1);
  }
  process.exit(0);
}
