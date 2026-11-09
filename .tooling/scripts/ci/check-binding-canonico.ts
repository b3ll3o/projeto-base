/**
 * SEM shebang, de propósito — ver `check-harness-owner.ts`: um arquivo de
 * `.tooling/scripts/ci/` que não comece com `check-`, não termine em
 * `.spec.ts` e TENHA shebang é classificado como harness órfão.
 *
 * Mede a **fidelidade do conteúdo** da camada de binding do Claude Code
 * (`.claude/`) contra o canônico vendor-neutral (`.agents/`).
 *
 * ## A lacuna que este gate fecha (issue #149, F1)
 *
 * O `.claude/README.md` promete, em duas palavras, o contrato do wrapper:
 *
 * > "só `name`/`description` copiados literalmente do frontmatter canônico"
 * > "O `name` e a `description` são copiados como **linha inteira**, nunca
 * > re-serializados. Re-serializar YAML é a forma clássica de corromper um
 * > `description` que já vem entre aspas duplas — e um `description` corrompido
 * > produz uma skill que o Claude Code descobre com o gatilho errado, sem erro
 * > visível."
 *
 * Nenhum gate media isso. O `check-skill-coverage` (que chega com o PR #148)
 * mede a **existência** do wrapper — regra `sem-binding` — e não o **conteúdo**
 * dele. O PR #148 é honesto sobre isso no próprio cabeçalho: *"a qualidade do
 * wrapper … a verificação disso é humana por ora"*.
 *
 * ## O caso real, medido em `main` (2026-11-09)
 *
 * O PR #147 trocou `healthchecks via curl` por `healthchecks via node` no
 * frontmatter canônico da skill `docker` e **não tocou no wrapper**. O
 * `description` do wrapper passou a descrever um healthcheck que o canônico
 * não descreve — e nenhum gate acusou, porque nenhum gate comparava
 * conteúdo. É exatamente a "consequência real" que a issue #149 descreve.
 *
 * ## Por que a comparação é da LINHA INTEIRA
 *
 * Re-serializar YAML produz o **mesmo valor semântico** com bytes diferentes:
 * as aspas duplas somem, a vírgula entra, a string é truncada. Um gate que
 * parseasse o YAML e comparasse valores passaria verde sobre o defeito — e a
 * corruption que o README descreve é justamente de byte, não de semântica.
 * Por isso a comparação é `texto === texto`, sobre a linha crua.
 *
 * ## Os dois lados, e por que os campos exigidos diferem
 *
 * | Camada | Wrapper                     | Canônico                                  | Exigidos no wrapper |
 * |--------|-----------------------------|-------------------------------------------|---------------------|
 * | skill  | `.claude/skills/<n>/SKILL.md` | `.agents/skills/<n>/SKILL.md`              | `name`, `description` |
 * | agent  | `.claude/agents/<n>.md`       | `.agents/agents/<n>.md`                    | `name`, `description`, `tools` |
 *
 * `tools` é exigido no wrapper de **agent** e não no de **skill** porque o
 * `.claude/README.md` diz que os campos `type`, `tools`, `version` e `updated`
 * são **deliberadamente não copiados** nas skills — e que, nos agents, `tools`
 * **é** copiado verbatim: sem ele o subagent herda a pool inteira da conversa,
 * "mais permissivo que o canônico, e um desvio silencioso".
 *
 * ## O que este gate NÃO promete
 *
 * Ele compara **conteúdo**, e não **existência**: uma skill canônica sem
 * wrapper é medida pelo `check-skill-coverage` (regra `sem-binding`), e um
 * agent canônico sem wrapper é uma **decisão declarada** (ADR-0008). Aqui, o
 * wrapper que EXISTE tem que ser fiel.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { CheckResult } from './check-types';

/** A camada de binding do Claude Code. */
export const DIR_BINDING = join('.claude');
/** Onde vive a definição canônica, vendor-neutral. */
export const DIR_CANONICO = join('.agents');

/** Um campo do frontmatter, com a linha em que ele está. */
export interface CampoFrontmatter {
  /** A chave, sem os dois-pontos. */
  campo: string;
  /** A linha (1-based) em que o campo está. */
  linha: number;
  /** A LINHA INTEIRA, com a chave — é ela que tem que ser idêntica. */
  texto: string;
}

/** Uma divergência entre o wrapper e o canônico. */
export interface Divergencia {
  /** Path repo-relative do wrapper. */
  wrapper: string;
  /** Path repo-relative do canônico. */
  canonico: string;
  /** O campo que divergiu (ou `'(ausente)'`). */
  campo: string;
  /** A linha divergente no wrapper (`null` quando o campo não existe). */
  linhaWrapper: number | null;
  /** A linha do canônico (`null` quando o campo não existe lá). */
  linhaCanonica: number | null;
  /** A linha do canônico. */
  esperado: string;
  /** A linha do wrapper. */
  obtido: string;
}

/**
 * Lê os campos do frontmatter.
 *
 * O frontmatter é o bloco entre o primeiro `---` e o `---` seguinte. Só ele
 * conta: um `name:` no corpo do arquivo não é frontmatter, e um campo que
 * estiver no corpo não entra na comparação.
 */
export function lerCamposDoFrontmatter(texto: string): CampoFrontmatter[] {
  const linhas = texto.split('\n');
  if (linhas[0]?.trim() !== '---') return [];
  const campos: CampoFrontmatter[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i]!;
    if (linha.trim() === '---') break;
    const m = /^([A-Za-z][A-Za-z0-9_-]*):/.exec(linha);
    if (m === null) continue;
    campos.push({ campo: m[1]!, linha: i + 1, texto: linha });
  }
  return campos;
}

/**
 * Os campos que o wrapper tem que declarar, por camada.
 *
 * O `tools` é exigido no agent e não na skill — ver o cabeçalho. Mas ele só é
 * exigido **se o canônico declara**: um agent canônico sem `tools` não pode
 * ter um wrapper com `tools`, e exigir o campo lá seria uma acusação falsa.
 */
export function camposExigidos(camada: 'skill' | 'agent'): string[] {
  return camada === 'skill' ? ['name', 'description'] : ['name', 'description', 'tools'];
}

/** Os dois lados de uma camada: onde o wrapper mora e onde o canônico mora. */
interface Par {
  camada: 'skill' | 'agent';
  nome: string;
  wrapper: string;
  canonico: string;
}

/**
 * Descobre os wrappers de uma camada, com o canônico que eles declaram.
 *
 * Quando `arquivos` vem injetado, a descoberta sai DAS CHAVES do mapa — não do
 * disco. Sem isso a spec montaria uma fixture que o gate nunca enxerga, e o
 * teste passaria por um motivo errado (o gate teria medido o repo, não a
 * fixture).
 */
function paresDe(
  repoRoot: string,
  camada: 'skill' | 'agent',
  arquivos?: Map<string, string>,
): Par[] {
  const pares: Par[] = [];

  if (arquivos !== undefined) {
    for (const path of arquivos.keys()) {
      const skill = /^\.claude\/skills\/([^/]+)\/SKILL\.md$/.exec(path);
      const agent = /^\.claude\/agents\/([^/]+)\.md$/.exec(path);
      if (camada === 'skill' && skill !== null) {
        pares.push({
          camada,
          nome: skill[1]!,
          wrapper: path,
          canonico: join(DIR_CANONICO, 'skills', skill[1]!, 'SKILL.md'),
        });
      }
      if (camada === 'agent' && agent !== null) {
        pares.push({
          camada,
          nome: agent[1]!,
          wrapper: path,
          canonico: join(DIR_CANONICO, 'agents', agent[1]! + '.md'),
        });
      }
    }
    return pares;
  }

  if (camada === 'skill') {
    const dir = join(repoRoot, DIR_BINDING, 'skills');
    if (!existsSync(dir)) return pares;
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      if (!entrada.isDirectory()) continue;
      pares.push({
        camada,
        nome: entrada.name,
        wrapper: join(DIR_BINDING, 'skills', entrada.name, 'SKILL.md'),
        canonico: join(DIR_CANONICO, 'skills', entrada.name, 'SKILL.md'),
      });
    }
  } else {
    const dir = join(repoRoot, DIR_BINDING, 'agents');
    if (!existsSync(dir)) return pares;
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      if (!entrada.isFile() || !entrada.name.endsWith('.md')) continue;
      pares.push({
        camada,
        nome: entrada.name.replace(/\.md$/, ''),
        wrapper: join(DIR_BINDING, 'agents', entrada.name),
        canonico: join(DIR_CANONICO, 'agents', entrada.name),
      });
    }
  }
  return pares;
}

/**
 * Compara o wrapper com o canônico e devolve as divergências.
 *
 * `arquivos` existe para a spec montar fixtures sem tocar o disco — o mesmo
 * que `check-feature-flag-portas` faz com `contratoTexto` e `controllers`.
 */
export function compararBinding(
  repoRoot: string,
  arquivos?: Map<string, string>,
): { divergencias: Divergencia[]; comparados: number } {
  const ler = (path: string): string | null => {
    if (arquivos !== undefined) return arquivos.get(path) ?? null;
    const absoluto = join(repoRoot, path);
    return existsSync(absoluto) ? readFileSync(absoluto, 'utf-8') : null;
  };

  const divergencias: Divergencia[] = [];
  let comparados = 0;

  for (const camada of ['skill', 'agent'] as const) {
    for (const par of paresDe(repoRoot, camada, arquivos)) {
      const textoWrapper = ler(par.wrapper);
      if (textoWrapper === null) continue; // o diretório existe, o arquivo não
      comparados++;

      const textoCanonico = ler(par.canonico);
      if (textoCanonico === null) {
        divergencias.push({
          wrapper: par.wrapper,
          canonico: par.canonico,
          campo: '(canônico)',
          linhaWrapper: null,
          linhaCanonica: null,
          esperado: '(o arquivo existe)',
          obtido: '(o arquivo não existe)',
        });
        continue;
      }

      const camposWrapper = lerCamposDoFrontmatter(textoWrapper);
      const camposCanonico = lerCamposDoFrontmatter(textoCanonico);

      for (const exigido of camposExigidos(camada)) {
        // O `tools` só é exigido quando o CANÔNICO declara — um agent
        // canônico sem `tools` não pode ter wrapper com `tools`, e exigir o
        // campo lá seria uma acusação falsa (a classe 2: acusar o que não
        // é defeito).
        if (exigido === 'tools' && !camposCanonico.some((c) => c.campo === 'tools')) {
          continue;
        }
        if (camposWrapper.some((c) => c.campo === exigido)) continue;
        divergencias.push({
          wrapper: par.wrapper,
          canonico: par.canonico,
          campo: exigido,
          linhaWrapper: null,
          linhaCanonica: null,
          esperado: `${exigido}: ...`,
          obtido: '(o wrapper não declara)',
        });
      }

      for (const campo of camposWrapper) {
        const noCanonico = camposCanonico.find((c) => c.campo === campo.campo);
        if (noCanonico === undefined) {
          divergencias.push({
            wrapper: par.wrapper,
            canonico: par.canonico,
            campo: campo.campo,
            linhaWrapper: campo.linha,
            linhaCanonica: null,
            esperado: '(o canônico não declara este campo)',
            obtido: campo.texto,
          });
          continue;
        }
        if (noCanonico.texto === campo.texto) continue;
        divergencias.push({
          wrapper: par.wrapper,
          canonico: par.canonico,
          campo: campo.campo,
          linhaWrapper: campo.linha,
          linhaCanonica: noCanonico.linha,
          esperado: noCanonico.texto,
          obtido: campo.texto,
        });
      }
    }
  }

  return { divergencias, comparados };
}

/**
 * O gate.
 *
 * Mede a **fidelidade** do binding: todo wrapper que existe tem que bater,
 * campo a campo e byte a byte, com o canônico que ele diz carregar.
 */
export function checkBindingCanonico(opts: {
  repoRoot: string;
  /** Conteúdo injetado — só a spec usa. Sem ele, o gate lê do disco. */
  arquivos?: Map<string, string>;
}): CheckResult {
  const repoRoot = resolve(opts.repoRoot);
  const { divergencias, comparados } = compararBinding(repoRoot, opts.arquivos);

  const errors = divergencias.map((d) => {
    const onde = d.linhaWrapper === null ? d.wrapper : `${d.wrapper}:${d.linhaWrapper}`;
    const referencia = d.linhaCanonica === null ? d.canonico : `${d.canonico}:${d.linhaCanonica}`;
    if (d.campo === '(canônico)') {
      return (
        `${d.wrapper} é um wrapper sem canônico: ${d.canonico} não existe. ` +
        `O binding aponta para uma definição que não está no repo.`
      );
    }
    return (
      `${onde}: o campo \`${d.campo}\` diverge do canônico ${referencia} — ` +
      `as linhas têm que ser IDÊNTICAS, byte a byte (o frontmatter é copiado ` +
      `como linha inteira, nunca re-serializado).\n` +
      `      wrapper:  ${d.obtido}\n` +
      `      canônico: ${d.esperado}`
    );
  });

  const advisories: string[] = [];
  if (comparados > 0) {
    advisories.push(
      `medido: ${comparados} wrapper(s) comparado(s) contra o canônico, ` +
        `${divergencias.length} divergência(s).`,
    );
  }
  advisories.push(
    'escopo: este gate confere o CONTEÚDO dos wrappers que existem. A EXISTÊNCIA ' +
      'do wrapper de skill é do `check-skill-coverage`; a de agent é uma decisão ' +
      'declarada no ADR-0008.',
  );

  return { ok: errors.length === 0, errors, advisories };
}

if (process.argv[1]?.endsWith('check-binding-canonico.ts')) {
  const r = checkBindingCanonico({ repoRoot: '.' });
  for (const line of r.errors) console.log(line);
  for (const line of r.advisories ?? []) console.log(line);
  if (r.skipped) console.log(`(skipped: ${r.reason ?? 'sem motivo declarado'})`);
  process.exit(r.ok ? 0 : 1);
}
