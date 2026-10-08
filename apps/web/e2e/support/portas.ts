// apps/web/e2e/support/portas.ts
//
// Utilidades de porta TCP para o bootstrap da suíte e2e.
//
// pt-BR: nada aqui escolhe porta fixa (3000/3001). O `pnpm dev` do
// desenvolvedor pode estar ocupando qualquer uma delas — e o caso real que
// gerou este arquivo foi exatamente esse: subir a suíte enquanto a app local
// roda. Porta fixa não é "previsível", é "conflitante por padrão".
//
// A janela de corrida (reservar a porta pelo SO e devolvê-la, para outro
// processo bindar) existe e é pequena. Ela não é removível sem foregoar de
//YNAMIC ephemeral ports — e o custo de um falso "EADDRINUSE" é um re-run da
// suíte, muito menor que o custo de redesignar isto.

import { createServer, connect } from 'node:net';
import { setTimeout as dormir } from 'node:timers/promises';

/**
 * Reserva uma porta livre asking ao kernel por uma porta efêmera (`listen(0)`)
 * e a devolve já liberada.
 */
export function portaLivre(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const servidor = createServer();
    servidor.once('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const endereco = servidor.address();
      if (endereco === null || typeof endereco === 'string') {
        servidor.close();
        reject(new Error('portaLivre(): o kernel devolveu um endereço sem porta'));
        return;
      }
      const { port } = endereco;
      servidor.close(() => resolve(port));
    });
  });
}

/** `true` se algo estiver aceitando conexão TCP em `porta`. */
export function tcpAberta(porta: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ port: porta, host: '127.0.0.1' });
    const encerrar = (aberta: boolean): void => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(aberta);
    };
    socket.once('connect', () => encerrar(true));
    socket.once('error', () => encerrar(false));
    socket.setTimeout(1000, () => encerrar(false));
  });
}

/**
 * Espera algo bindar `porta`. Lança se o prazo estourar — sem exceção, um
 * processo que nunca subiu se manifesta como "todos os testes falham com
 * ERR_CONNECTION_REFUSED", que é indistinguível de um defeito da aplicação.
 */
export async function esperarTcpAberta(porta: number, limiteMs = 60_000): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (await tcpAberta(porta)) return;
    await dormir(150);
  }
  throw new Error(`esperarTcpAberta(${porta}): nada respondeu em ${limiteMs}ms`);
}

/**
 * Espera `porta` ficar SEM ninguém aceitando conexão, e devolve se conseguiu.
 *
 * pt-BR: usada depois de derrubar a API. Sem esta espera, o spec que volta a
 * falar com ela pode acertar o socket ainda vivo do processo anterior (o SO
 * mantém a porta em TIME_WAIT e um novo processo pode falhar no bind). A
 * espera é o que torna o re-start determinístico em vez de flake.
 *
 * Devolve `false` em vez de lançar porque o CHAMADOR precisa decidir o que
 * fazer quando a porta não fecha — normalmente escalar para `SIGKILL`. Com
 * `throw` aqui embaixo, quem chamasse não teria como escalar: a escalada ficava
 * depois de uma linha que já tinha encerrado a função. Ver `derrubarApiDoTeste`.
 */
export async function portaFechouDentroDe(porta: number, limiteMs = 20_000): Promise<boolean> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (!(await tcpAberta(porta))) return true;
    await dormir(150);
  }
  return false;
}

/**
 * Mesma espera, mas LANÇA no estouro.
 *
 * Existe para quem só quer a garantia e não tem escalada a fazer. O
 * `expect(...).rejects` de quem chama e o `catch` do teardown já tratam o caso.
 */
export async function esperarTcpFechada(porta: number, limiteMs = 20_000): Promise<void> {
  if (await portaFechouDentroDe(porta, limiteMs)) return;
  throw new Error(`esperarTcpFechada(${porta}): ainda havia alguém em ${limiteMs}ms`);
}
