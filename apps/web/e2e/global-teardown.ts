// apps/web/e2e/global-teardown.ts
//
// Desliga tudo que o `global-setup.ts` subiu: servidor Next, API Nest e o
// container Postgres. Roda uma vez, depois do último spec.
//
// pt-BR: o teardown também é o caminho de recuperação quando um spec falha
// no meio. Uma suíte que deixa container e processo vivos não custa só
// memória — o próximo `test:e2e` pega portas ocupadas e um Postgres órfão que
// ninguém sabe de onde veio. Por isso ele lê os PIDs do arquivo de estado, e
// não de uma variável em memória: o arquivo sobrevive mesmo se o processo
// principal tiver sido reiniciado no meio da execução.
//
// Ordem: Next primeiro (é quem segura requisições para a API), depois a API,
// por último o Postgres. Inverter faria o Next receber ECONNREFUSED durante o
// desligamento em vez de receber a conexão que ele esperava — inofensivo aqui,
// mas é a ordem que produz uma saída limpa nos logs.
//
// pt-BR (2026-10-08): COMO derrubar está em `e2e/support/processos.ts`, não
// aqui. Esta cópia existia e só neste arquivo; a mesma escalada para `SIGKILL`
// estava duplicada em `support/api.ts`, e uma das duas só observava o PAI — que
// morre no `SIGTERM` deixando o filho vivo com a porta. Duas implementações de
// "derrubar o processo" divergindo é a forma de o teardown vazar e ninguém ver.
// A medição que justifica o sinal de grupo está no cabeçalho de lá.

import { execFileSync } from 'node:child_process';
import { lerEstado } from './support/estado';
import { derrubarPorPid } from './support/processos';
import { esperarTcpFechada } from './support/portas';

const CHAVE_GLOBAL = '__e2ePlaywrightContexto';

export default async function globalTeardown(): Promise<void> {
  const log = (mensagem: string): void => {
    process.stdout.write(`[e2e:teardown] ${mensagem}\n`);
  };

  let estado: ReturnType<typeof lerEstado> | null = null;
  try {
    estado = lerEstado();
  } catch {
    // O setup nem chegou a gravar estado — nada para derrubar.
    return;
  }

  await derrubarPorPid(estado.webPid);
  await esperarTcpFechada(estado.webPorta, 10_000).catch(() => undefined);
  await derrubarPorPid(estado.apiPid);
  await esperarTcpFechada(estado.apiPorta, 10_000).catch(() => undefined);

  // O container só é alcançável pelo handle que o setup guardou — este
  // processo é o mesmo, então o global ainda vale. Se não valer (processo
  // reiniciado), o container fica órfão e `docker ps` mostra a origem.
  const ctx = (globalThis as Record<string, unknown>)[CHAVE_GLOBAL] as
    { stop?: () => Promise<void> } | undefined;
  if (ctx?.stop) {
    // ⚠️ Este era o ÚNICO `await` do teardown sem proteção, e a assimetria com
    // `globalSetup.ts` (`item.stop().catch(() => undefined)`, dentro de
    // `encerrar`) é o defeito. Ela é a MEDIÇÃO: o mesmo método, invocado no
    // setup e no teardown, é protegido num e nu no outro.
    //
    // ⚠️ **NÃO MEDIDO** (2026-10-08, revisão da branch): não reproduzi a falha
    // no runner. O cenário é plausível e descrito aqui como hipótese, não como
    // fato — no CI o daemon do Docker reinicia, ou um `docker system prune` de
    // um job vizinho remove o container, entre o último spec e o teardown;
    // `container.stop()` do Testcontainers lança nesse estado, o
    // `globalTeardown` rejeita, e `pnpm test:e2e` sai ≠ 0 **com todos os testes
    // verdes**. O conserto não depende de a hipótese ser verdadeira: derrubar o
    // container é DIAGNÓSTICO de fim de execução, não condição para o resultado
    // da suíte, e `containersDoTeste()` (o caminho `else`, que já era
    // `try/catch` por dentro) é justamente o tratamento correto.
    try {
      await ctx.stop();
      log('Postgres efêmero parado.');
    } catch (erro) {
      const causa = erro instanceof Error ? erro.message : String(erro);
      log(`Postgres efêmero não parou (${causa}). O sufixo do relatório dirá se sobrou algo.`);
      const restantes = containersDoTeste();
      if (restantes > 0) {
        log(`ATENÇÃO: sobraram ${restantes} container(s) de teste. Remova com: docker rm -f <id>`);
      }
    }
  } else {
    const restantes = containersDoTeste();
    if (restantes > 0) {
      log(`ATENÇÃO: sobraram ${restantes} container(s) de teste. Remova com: docker rm -f <id>`);
    }
  }
}

/**
 * Containers de teste que sobraram, para o log dizer quantos são.
 *
 * pt-BR: o filtro é o rótulo padrão do Testcontainers. Contar e reportar é
 * melhor que derrubar às cegas: um `docker rm -f $(docker ps -q)` tiraria o
 * Postgres de desenvolvimento junto, que tem dados reais.
 */
function containersDoTeste(): number {
  try {
    const saida = execFileSync(
      'docker',
      ['ps', '--filter', 'label=org.testcontainers=true', '--format', '{{.ID}}'],
      { encoding: 'utf8' },
    );
    return saida.split('\n').filter((linha) => linha.trim() !== '').length;
  } catch {
    // Sem daemon (ou sem permissão): não há o que reportar, e esta função não
    // é a responsável pelo desligamento.
    return 0;
  }
}
