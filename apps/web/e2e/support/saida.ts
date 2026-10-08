// apps/web/e2e/support/saida.ts
//
// `stdout` de um processo filho é um ARQUIVO, nunca um pipe do processo que o
// spawnou.
//
// ── A medida que fixa a regra (2026-10-08) ──────────────────────────────────
//
// Fora da suíte, isolando UMA variável — mesmo `spawn`, mesmo `detached: true`,
// mesmos pipes, mesmo pai que sai —:
//
//   filho que NÃO escreve em stdout  → PPID 1719, vivo 6 s+, porta aberta
//   filho que ESCREVE em stdout       → MORTO em ~2 s
//
// A diferença é `EPIPE`. Quando o pai morre, a ponta leitora do pipe fecha; a
// próxima escrita é `EPIPE`, o Node derruba o processo. Arquivo não tem ponta
// leitora viva, logo não tem `EPIPE` — e ainda guarda o log depois da morte de
// quem o leu, que é justamente quando ele serve.
//
// Na suíte isso era o flake do `--repeat-each 2`: o worker do Playwright
// recicla no meio da execução (PPID da API passa a 1719 = systemd --user), a
// API — que logava em `info` — recebia `EPIPE` e morria, e o repeat seguinte
// inteiro levava `ECONNREFUSED` a partir do `baseLimpa`.
//
// Regra: todo spawn de processo auxiliar nesta suíte passa por aqui.

import { closeSync, linkSync, mkdirSync, openSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export interface SaidaEmArquivo {
  /** Descritor para o `stdio` do `spawn`. Fechado por `vincular`. */
  readonly descritor: number;
  /**
   * Nomeia o log pelo PID — que só existe DEPOIS do `spawn`.
   *
   * O arquivo nasce com um nome parcial e é ligado ao definitivo por `link`,
   * que mantém o descritor (e a escrita) apontando para o mesmo inode.
   */
  vincular(pid: number): string;
  /**
   * Caminho do arquivo enquanto ele ainda não tem nome de PID.
   *
   * pt-BR: existe para tornar a propriedade do `link` VERIFICÁVEL — quem
   * escreve nele depois do `link` precisa continuar caindo no arquivo nomeado.
   * Na suíte quem escreve é o FILHO, com o próprio dup do descritor; um teste
   * que escrevesse por `descritor` depois de `vincular` estaria escrevendo por
   * um fd já fechado, e medindo outra coisa.
   */
  readonly caminhoParcial: string;
  /** Cauda do log, para embutir numa mensagem de erro. `''` se não houver log. */
  cauda(pid: number, tamanho?: number): string;
}

export function abrirSaidaEmArquivo(diretorio: string, prefixo: string): SaidaEmArquivo {
  mkdirSync(diretorio, { recursive: true });
  const parcial = join(diretorio, `.${prefixo}-${process.pid}-${Date.now()}.parcial`);
  const alvoDe = (pid: number): string => join(diretorio, `${prefixo}-${pid}.log`);
  const descritor = openSync(parcial, 'a');

  return {
    descritor,
    caminhoParcial: parcial,
    vincular(pid: number): string {
      closeSync(descritor);
      const alvo = alvoDe(pid);
      try {
        // pt-BR: reuso de PID não pode fundir o log de duas instâncias — o
        // arquivo é POR INSTÂNCIA, e mesclar duas tornaria o diagnóstico
        // pior do que não ter log.
        //
        // ⚠️ `unlinkSync` LANÇA `ENOENT` quando o alvo não existe, que é o caso
        // comum (primeira vez que este PID aparece). Medido em 2026-10-08: com o
        // `unlink` dentro do `try`, o `ENOENT` caía no `catch`, o `linkSync` era
        // NUNCA executado, e os 3 `--repeat-each 2` passavam com `api-<pid>.log`
        // contendo SÓ a linha `[saida]` — a saída da API ficava em
        // `.api-<pid>-<ts>.parcial`. Verde por cima de um diagnóstico que não
        // funcionava: o conserto do flake estava valendo, o conserto do log
        // estava silenciosamente Inerte.
        try {
          unlinkSync(alvo);
        } catch {
          // ainda não existe — é o caminho normal, não um erro
        }
        linkSync(parcial, alvo);
        unlinkSync(parcial);
        return alvo;
      } catch {
        // Sem `link`, a saída segue no parcial — legível por `cauda`, que cai
        // nele. Perder o NOME é aceitável; perder a SAÍDA não é.
        return parcial;
      }
    },
    cauda(pid: number, tamanho = 2000): string {
      // pt-BR: sem sentinela. `abrirSaidaEmArquivo` SEMPRE cria o parcial, então
      // um "log indisponível" como texto seria um ramo que nunca dispara — a
      // classe "guard que nunca pode disparar". O que o leitor precisa é da
      // última saída conhecida, e quando ela não existe isso é `''`, que é a
      // verdade sobre o arquivo.
      for (const caminho of [alvoDe(pid), parcial]) {
        try {
          return readFileSync(caminho, 'utf8').slice(-tamanho);
        } catch {
          // tenta o próximo
        }
      }
      return '';
    },
  };
}
