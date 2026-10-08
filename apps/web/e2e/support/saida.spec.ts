// apps/web/e2e/support/saida.spec.ts
//
// A regra que este arquivo vigia: `stdout` de processo auxiliar é ARQUIVO.
//
// A falha que ela caça é silenciosa. Quando `vincular` não consegue ligar o
// parcial ao nome definitivo, `subirApi` continua funcionando — a suíte passa,
// o flake some, e o DIAGNÓSTICO morre junto: `api-<pid>.log` fica com a linha
// `[saida]` e nada mais, enquanto a saída real joga fora num `.parcial`. Foi
// exatamente assim que a primeira versão deste conserto passou 3/3 em
// `--repeat-each 2` com o log quebrado (medido 2026-10-08).
//
// Por isso os testes aqui não afirmam "não lançou": afirmam **o nome do
// arquivo e o conteúdo dentro dele**.

import { describe, expect, it } from 'vitest';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirSaidaEmArquivo } from './saida';

function diretorio(): string {
  return mkdtempSync(join(tmpdir(), 'saida-spec-'));
}

describe('abrirSaidaEmArquivo', () => {
  it('deixa a saída no arquivo nomeado pelo PID, e não num arquivo parcial', () => {
    const dir = diretorio();
    const saida = abrirSaidaEmArquivo(dir, 'api');
    writeSync(saida.descritor, '[stdout] Starting Nest\n');

    saida.vincular(4242);

    const alvo = join(dir, 'api-4242.log');
    expect(existsSync(alvo)).toBe(true);
    expect(readFileSync(alvo, 'utf8')).toContain('Starting Nest');
  });

  it('não deixa o parcial para trás depois de vincular', () => {
    const dir = diretorio();
    const saida = abrirSaidaEmArquivo(dir, 'api');
    saida.vincular(4242);

    expect(readdirSync(dir)).toEqual(['api-4242.log']);
  });

  it('escreve no arquivo nomeado também DEPOIS de vincular', () => {
    // pt-BR: esta é a propriedade que faz `link` valer a pena — quem já tinha o
    // arquivo aberto continua no MESMO inode, que agora tem outro nome. É o que
    // acontece na suíte: o FILHO fica com o dup do descritor e escreve a vida
    // inteira enquanto o nome muda. Se alguém trocar `link` por `rename` + reabrir
    // (ou por copiar), a escrita seguinte vai para um arquivo que ninguém lê e o
    // log para no momento errado.
    //
    // Por isso o teste abre o PRÓPRIO fd em `caminhoParcial`, como o filho faz —
    // escrever por `saida.descritor` depois de `vincular` usaria um fd já
    // fechado e mediria outra coisa.
    const dir = diretorio();
    const saida = abrirSaidaEmArquivo(dir, 'api');
    const fdDoFilho = openSync(saida.caminhoParcial, 'a');
    writeSync(fdDoFilho, '[stdout] Starting Nest\n');

    saida.vincular(4242);
    writeSync(fdDoFilho, '[stdout] request completed\n');
    closeSync(fdDoFilho);

    expect(readFileSync(join(dir, 'api-4242.log'), 'utf8')).toContain('request completed');
  });

  it('substitui o log anterior quando o PID se repete, em vez de fundir os dois', () => {
    // pt-BR: PID se repete entre execuções. Fundir as duas instâncias produziria
    // um log que responde "o que aconteceu" misturando duas APIs que nunca
    // coexistiram — pior do que não ter log.
    const dir = diretorio();
    const primeira = abrirSaidaEmArquivo(dir, 'api');
    writeSync(primeira.descritor, 'instância antiga\n');
    primeira.vincular(4242);

    const segunda = abrirSaidaEmArquivo(dir, 'api');
    writeSync(segunda.descritor, 'instância nova\n');
    segunda.vincular(4242);

    const conteudo = readFileSync(join(dir, 'api-4242.log'), 'utf8');
    expect(conteudo).toContain('instância nova');
    expect(conteudo).not.toContain('instância antiga');
  });

  it('cauda devolve o fim do log, do tamanho pedido', () => {
    const dir = diretorio();
    const saida = abrirSaidaEmArquivo(dir, 'api');
    writeSync(saida.descritor, 'a'.repeat(100) + 'FIM');
    saida.vincular(4242);

    const cauda = saida.cauda(4242, 10);
    expect(cauda).toHaveLength(10);
    expect(cauda.endsWith('FIM')).toBe(true);
  });

  it('cauda ainda devolve a saída quando só o parcial existe', () => {
    // pt-BR: perder o NOME é aceitável; perder a SAÍDA não é. `vincular` cai no
    // parcial quando o `link` falha, e é de lá que `cauda` tem de ler — senão a
    // mensagem de erro do bootstrap sai com "(log indisponível)" no lugar da
    // exceção que o Next imprimiu.
    const dir = diretorio();
    const saida = abrirSaidaEmArquivo(dir, 'api');
    writeSync(saida.descritor, 'saída precious\n');

    expect(saida.cauda(4242)).toContain('saída precious');
  });

  it('devolve string vazia quando não há nada de log para ler', () => {
    const saida = abrirSaidaEmArquivo(diretorio(), 'api');

    expect(saida.cauda(4242)).toBe('');
  });

  it('quando o link falha, devolve o parcial e a saída continua legível', () => {
    // ⚠️ Este é o `catch` de `vincular`, e até 2026-10-08 (revisão da branch) ele
    // não tinha NENHUMA spec — sendo o ramo em que a suíte continua verde e o
    // diagnóstico morre, que é a falha silenciosa que este arquivo inteiro
    // existe para caçar. Verde por ausência de teste é verde por ausência de
    // medida.
    //
    // A falha é produzida pelo sistema de arquivos, não por mock: uma
    // DIRETÓRIO no lugar de `api-4242.log` faz o `unlinkSync` interno lançar
    // `EISDIR` (absorvido — é o mesmo `catch` do "ainda não existe") e o
    // `linkSync` seguinte falhar com `EEXIST`. É uma das formas reais do
    // `link` não acontecer, ao lado de disco cheio e de `node_modules/.cache`
    // num mount sem hardlink, e não exige instrumentar `node:fs`.
    const dir = diretorio();
    mkdirSync(join(dir, 'api-4242.log'));
    const saida = abrirSaidaEmArquivo(dir, 'api');
    writeSync(saida.descritor, 'saída precious\n');

    const caminho = saida.vincular(4242);

    // Perder o NOME é aceitável; perder a SAÍDA não é. Por isso `vincular`
    // devolve o parcial, e `cauda` — que já o tenta por último — lê dele.
    //
    // MEDIDO 2026-10-08, `pnpm --filter @projeto/web exec vitest run
    // e2e/support/saida.spec.ts`: trocando o `return parcial` do `catch` por
    // `return ''` (o modo como se perde a saída inteira), o resultado foi
    // **`1 failed | 7 passed (8)`** — e o único vermelho é este teste. Os 7
    // anteriores seguem verdes com o conserto neutralizado, o que confirma que
    // o `catch` só era exercitado por este.
    expect(caminho).toBe(saida.caminhoParcial);
    expect(saida.cauda(4242)).toContain('saída precious');
    // E o parcial não pode ter sido removido: o `unlinkSync(parcial)` está
    // DEPOIS do `linkSync`, então o `catch` o pula — e é por isso que a saída
    // ainda está lá.
    expect(existsSync(saida.caminhoParcial)).toBe(true);
  });
});
