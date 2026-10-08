// apps/web/e2e/support/processos.ts
//
// Sinalização de PROCESSO, não de porta. Existe como arquivo à parte porque
// TRÊS lugares precisam do mesmo comportamento (`api.ts`, `global-setup.ts`,
// `global-teardown.ts`) e a divergência entre eles foi exatamente o defeito.
//
// ── Por que o sinal vai para o GRUPO e não para o PID ───────────────────────
//
// `tsx` são DOIS processos: `spawn` devolve o pai, e ele FORKA um filho que é
// quem executa `src/main.ts` e segura a porta. `SIGTERM` no pai NÃO leva o
// filho junto — ele fica vivo, órfão, reparentado para o systemd --user, com a
// porta em mãos.
//
// MEDIDO em 2026-10-08, fora da suíte: um pai que forca um filho com `listen` e
// leva `SIGTERM` produz `pai MORREU` / `filho SEGUE com a porta`. Na máquina,
// `pgrep -fc src/main.ts` devolvia 16, com 12 órfãos de execuções anteriores
// todos de PPID 1719, cada um segurando ~197 MB.
//
// O sintoma é a parte que enganava: a porta ficava presa, a API nova subia, e o
// `/health` respondia — do processo VELHO. A suíte ficava verde num spec e
// vermelha em todos os seguintes, com `ECONNREFUSED` aparecendo só depois,
// quando o órfão finalmente saía. Um health check que responde não prova que
// quem respondeu é o processo que acabou de subir.
//
// `process.kill(-pid, sinal)` cobre os dois: `-pid` é o process group. O sinal
// chega ao pai E ao filho.
//
// ── O `-pid` só é o grupo quando o processo é o LÍDER ───────────────────────
//
// Um PID que não é PGID não casa com grupo nenhum: `kill(-pid, …)` dá `ESRCH`
// e o sinal vai por acaso para o grupo cujo ID happen de ser esse número. Por
// isso TODO spawn deste harness usa `detached: true` — inclusive o do Next
// standalone, que não usava e era derrubado por sinal de grupo assim mesmo.
// O `derrubarGrupo` cai para o PID simples justamente para o caso em que o
// `-pid` não é o grupo (processo antigo, ou spawn sem `detached`).

import type { ChildProcess } from 'node:child_process';

/**
 * Sinaliza o grupo `-pid`; devolve `false` se o sinal não foi entregue.
 *
 * `false` cobre `ESRCH` (o grupo já morreu — o caso NORMAL quando a suíte
 * terminou com a API derrubada por um spec, o fluxo F1) e `EPERM` (o grupo
 * existe mas é de outro dono). Nos dois o chamador cai para o PID simples.
 */
export function sinalizarGrupo(pid: number, sinal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, sinal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Derruba o grupo `-pid`, com queda para o PID simples.
 *
 * Devolve `true` se o sinal foi entregue a ALGUM processo. `false` = não havia
 * ninguém, o que é o estado normal de quem já morreu.
 */
export function derrubarGrupo(pid: number | null | undefined, sinal: NodeJS.Signals): boolean {
  if (pid === null || pid === undefined) return false;
  if (sinalizarGrupo(pid, sinal)) return true;
  try {
    process.kill(pid, sinal);
    return true;
  } catch {
    return false;
  }
}

/** `true` se o PROCESSO existe (para o PID, não para o grupo). */
export function processoVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * `true` se o grupo `-pid` ainda tem ALGUM processo — pai OU filho.
 *
 * pt-BR: checar só o PID do pai dá "saiu" enquanto o filho segue segurando a
 * porta, que é o defeito inteiro que este arquivo existe para fechar.
 */
export function grupoVivo(pid: number): boolean {
  try {
    // `kill(-pid, 0)` não sinaliza nada: só pergunta se o grupo existe.
    process.kill(-pid, 0);
    return true;
  } catch {
    // `EPERM` aqui seria "existe mas é de outro dono". Declarar morto quem
    // talvez esteja vivo custa pior que a espera: o `derrubarPorPid` abaixo
    // gastaria o tempo limite à toa, que é barato e visível, contra o risco de
    // deixar um processo segurando a porta e virar flake depois.
    return false;
  }
}

/** `true` se o `ChildProcess` já terminou (por código ou por sinal). */
export function filhoMorto(filho: ChildProcess): boolean {
  return filho.exitCode !== null || filho.signalCode !== null;
}

/** Resolve `true` quando o processo sai, `false` no estouro do prazo. */
export function esperarSaida(filho: ChildProcess, ms: number): Promise<boolean> {
  if (filhoMorto(filho)) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const temporizador = setTimeout(() => resolve(false), ms);
    filho.once('exit', () => {
      clearTimeout(temporizador);
      resolve(true);
    });
  });
}

/**
 * Derruba o grupo inteiro: `SIGTERM`, espera, e `SIGKILL` se sobrou alguém.
 *
 * A escalada não é redundância — ela fecha uma janela que o `SIGTERM` sozinho
 * deixa aberta. O Nest tem `enableShutdownHooks`, e o drain do Prisma leva
 * alguns ms; subir em cima de uma porta ainda bindada dá `EADDRINUSE`, flake que
 * só aparece na SEGUNDA execução do spec. E o caso que só a escalada pega: o pai
 * morre e o filho segue — `esperarSaida` (que só observa o pai) diria "saiu" com
 * a porta ainda em mãos.
 */
export async function derrubarPorPid(
  pid: number | null | undefined,
  limiteMs = 8_000,
): Promise<void> {
  if (pid === null || pid === undefined) return;
  derrubarGrupo(pid, 'SIGTERM');

  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (!processoVivo(pid) && !grupoVivo(pid)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  if (processoVivo(pid) || grupoVivo(pid)) derrubarGrupo(pid, 'SIGKILL');
}

/** `derrubarPorPid` para quem tem o handle em vez do número. */
export async function derrubarFilho(filho: ChildProcess, limiteMs = 8_000): Promise<void> {
  if (filhoMorto(filho)) return;
  await derrubarPorPid(filho.pid, limiteMs);
}
