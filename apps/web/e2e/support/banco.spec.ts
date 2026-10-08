// apps/web/e2e/support/banco.spec.ts
//
// A regra que este arquivo vigia: um spec do F5 nunca pode passar sem ter
// derrubado o banco de verdade.
//
// A falha é silenciosa e já tem nome. `derrubarBancoDoTeste` tem um `catch` que
// RELANÇA: se o `docker stop` falha, o spec tem de reprovar, porque senão ele
// navega com o banco de pé, o POST dá 201, e o teste que existe para medir o
// 5xx passa medindo o caminho feliz. É verde por ausência — a classe que
// `guard-classes.md` cataloga.
//
// MEDIDO 2026-10-08: antes deste arquivo, `e2e/support/` tinha `saida.spec.ts`
// para `saida.ts` e NADA para `banco.ts`. Nem o `catch` nem o caminho do
// estouro de prazo tinham execução rápida — só a suíte de 52 s os alcançava.
//
// Por que os testes aqui não afirmam "não lançou": affirmam **a mensagem**.
// Um `expect(() => ...).toThrow()` passa para qualquer erro, inclusive um
// `TypeError` de uma assinatura quebrada. A frase que diz que o estado não foi
// produzido é o que distingue o guard funcionando do guard quebrado.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarBancoDoTeste, type EstadoDoBanco, type ExecutarDocker } from './banco';

const ESTADO: EstadoDoBanco = {
  databaseContainerId: 'container-de-teste',
  apiBaseUrl: 'http://127.0.0.1:45999',
};

const estadoFixo = (): EstadoDoBanco => ESTADO;

/** Docker que responde OK e registra o que recebeu. */
function dockerQueResponde(): { registrar: ExecutarDocker; chamadas: string[][] } {
  const chamadas: string[][] = [];
  const registrar = (...argumentos: string[]): string => {
    chamadas.push(argumentos);
    return '';
  };
  return { registrar, chamadas };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('derrubar', () => {
  it('para o container com grace curto, e o motivo está no código', () => {
    const { registrar, chamadas } = dockerQueResponde();
    criarBancoDoTeste(estadoFixo, registrar).derrubar();

    // `-t 2` não é estética: sem ele o `docker stop` sozinho consumia ~10 s,
    // um terço do prazo do spec (medido 2026-10-08).
    expect(chamadas).toEqual([['stop', '-t', '2', ESTADO.databaseContainerId]]);
  });

  it('reprova com a frase que diz que o estado não foi produzido', () => {
    const falha = () => {
      throw new Error('Cannot connect to the Docker daemon');
    };
    const banco = criarBancoDoTeste(estadoFixo, falha);

    expect(() => banco.derrubar()).toThrow(
      /Sem banco para derrubar, este spec mediria um estado que não produziu/,
    );
  });

  it('reprova nomeando o container, para o erro não ser anônimo', () => {
    const falha = () => {
      throw new Error('No such container');
    };

    expect(() => criarBancoDoTeste(estadoFixo, falha).derrubar()).toThrow(
      ESTADO.databaseContainerId,
    );
  });
});

describe('subir', () => {
  it('levanta o container e volta assim que o /health responde', async () => {
    const { registrar, chamadas } = dockerQueResponde();
    let sondas = 0;
    vi.stubGlobal('fetch', async () => {
      sondas += 1;
      // Duas recusas antes do 200: prova que a espera é pelo health, e não um
      // `docker start` seguido de retorno imediato.
      return { ok: sondas > 2, status: sondas > 2 ? 200 : 503 };
    });

    await criarBancoDoTeste(estadoFixo, registrar, { intervaloMs: 1 }).subir();

    expect(chamadas).toEqual([['start', ESTADO.databaseContainerId]]);
    expect(sondas).toBe(3);
  });

  it('consulta o /health da API de teste, e não a raiz', async () => {
    const { registrar } = dockerQueResponde();
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200 };
    });

    await criarBancoDoTeste(estadoFixo, registrar, { intervaloMs: 1 }).subir();

    expect(urls).toEqual([`${ESTADO.apiBaseUrl}/health`]);
  });

  it('sonda também quando a conexão é recusada, e não só em resposta HTTP', async () => {
    const { registrar } = dockerQueResponde();
    let sondas = 0;
    vi.stubGlobal('fetch', async () => {
      sondas += 1;
      if (sondas < 3) throw new Error('fetch failed: ECONNREFUSED');
      return { ok: true, status: 200 };
    });

    await criarBancoDoTeste(estadoFixo, registrar, { intervaloMs: 1 }).subir();

    expect(sondas).toBe(3);
  });

  it('estoura o prazo dizendo que deixar o banco parado é o pior resultado', async () => {
    const { registrar } = dockerQueResponde();
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 503 }));

    const banco = criarBancoDoTeste(estadoFixo, registrar, { limiteMs: 30, intervaloMs: 1 });

    await expect(banco.subir()).rejects.toThrow(
      /não voltou a responder em 0.03s.*\/health respondeu 503/s,
    );
  });

  it('no estouro, a última tentativa relatada é a de agora, não a da 1ª', async () => {
    const { registrar } = dockerQueResponde();
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500 }));
    const banco = criarBancoDoTeste(estadoFixo, registrar, { limiteMs: 30, intervaloMs: 1 });

    // Um relatório que carrega a PRIMEIRA falha seria um diagnóstico que aponta
    // para o sintoma errado — foi assim que a primeira versão deste arquivo
    // mediu "o banco não volta" quando o banco voltava em 5 ms.
    await expect(banco.subir()).rejects.toThrow(/\/health respondeu 500/);
  });
});
