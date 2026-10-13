#!/usr/bin/env node
// PreToolUse (Edit|Write) — nega escrita em pnpm-lock.yaml.
//
// Este é o guard que BLOQUEIA de verdade. O PostToolUse roda depois da escrita
// e não desfaz nada; aqui o deny chega antes de a tool executar.
//
// Decisão de projeto: fail-closed. Payload ilegível ou JSON inválido ABORTA com
// exit 2 em vez de sair 0 em silêncio. O custo é bloquear todo Edit/Write
// enquanto o hook estiver quebrado; o benefício é um guard que não pode falhar
// aberto em silêncio.
//
// MEDIDO 2026-10-13 no binário do CLI em execução (2.1.296): exit 2 num command
// hook é o que a CLI nomeia "hook blocking error", e é ele — não um flag — que
// produz o bloqueio. O `onFailure` NÃO é a segunda camada que se supunha: ele pertence
// a `policyHelper`/`policyHelpers` (helpers de política de OS-admin), aceita
// "continue" ou "refuse", e é ignorado fora das entradas per-OS.
//
// Consequência honesta: o fail-closed acima cobre payload ilegível, e só ele.
// O caso "o arquivo deste script não existe" ou "o comando não spawna" NÃO tem
// fallback verificado — a CLI não expõe string para essa falha, então nada aqui
// promete cobri-la. Se ela ocorrer, o guard some em silêncio: por isso o
// settings.json o registra com o caminho absoluto via $CLAUDE_PROJECT_DIR.
//
// Ver `.claude/README.md` para o contrato completo do binding.

import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';

const ALVO = 'pnpm-lock.yaml';

// MEDIDO 2026-10-13: `ln -s pnpm-lock.yaml lock-amigo.yaml` + Write em
// `lock-amigo.yaml` passava com exit 0 e o conteúdo do lockfile mudava — o
// basename literal descreve o NOME, e o que a escrita atinge é o ALVO. Por isso
// o nome precisa ser conferido nos dois: como escrito e como resolvido.
function ehAlvo(filePath) {
  if (basename(filePath) === ALVO) return true;
  try {
    return basename(realpathSync(filePath)) === ALVO;
  } catch {
    // ainda não existe no disco => não pode ser symlink para o lockfile
    return false;
  }
}

let raw = '';
try {
  raw = readFileSync(0, 'utf-8');
} catch {
  process.stderr.write(`guard ${ALVO}: stdin ilegível — abortando por segurança (fail-closed).\n`);
  process.exit(2);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.stderr.write(
    `guard ${ALVO}: payload JSON inválido — abortando por segurança (fail-closed).\n`,
  );
  process.exit(2);
}

// basename, e não comparação de path completo: cobre o lockfile da raiz e
// qualquer pnpm-lock.yaml de subpacote, sem depender do cwd.
const filePath = payload?.tool_input?.file_path ?? '';

// MEDIDO 2026-10-13: `file_path` não-string (ex.: número) fazia basename()
// lançar TypeError e o processo morrer com exit 1 — que não é nem o exit 0 do
// "não é o alvo" nem o exit 2 do bloqueio. Um guard que morre de exceção não
// decide nada. Payload que não dá para avaliar é fail-closed, como o resto.
if (typeof filePath !== 'string') {
  process.stderr.write(
    `guard ${ALVO}: tool_input.file_path não é string (${typeof filePath}) — abortando por segurança (fail-closed).\n`,
  );
  process.exit(2);
}

if (!ehAlvo(filePath)) {
  process.exit(0);
}

// Exit 0 + JSON válido no stdout = decisão de controle APLICADA (a tool roda a
// decisão, não o exit code, neste caso). NUNCA emitir texto antes do JSON: um
// perfil de shell imprimindo uma linha quebra o reconhecimento e o hook vira
// texto puro — o pior desfecho possível, um guard que parece funcionar.
process.stdout.write(
  `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `${ALVO} é gerado pelo pnpm e não deve ser editado à mão. ` +
        'Um lockfile editado à mão descreve um grafo de dependências que o CI ' +
        'pode instalar de forma diferente da máquina local — o drift só aparece ' +
        'no pipeline, nunca aqui. Rode `pnpm add <pkg>` (ou `pnpm install`) e ' +
        'versione o lockfile resultante.',
    },
  })}\n`,
);

process.exit(0);
