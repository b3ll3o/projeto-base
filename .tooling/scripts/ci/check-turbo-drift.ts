import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

interface TurboTask {
  dependsOn?: string[];
  cache?: boolean;
  persistent?: boolean;
  outputs?: string[];
  // campos extras permitidos pela schema do turbo.build
  [key: string]: unknown;
}

interface TurboShape {
  $schema?: string;
  globalDependencies?: string[];
  tasks?: Record<string, TurboTask>;
}

/**
 * Detecta drift no `turbo.json` canônico do monorepo.
 *
 * Drifts capturados:
 * 1. Arquivo inexistente
 * 2. JSON inválido (parser)
 * 3. Ausência de `$schema` (sinaliza turbo.json órfão / copiado sem fixup)
 * 4. Task com nome fora do padrão `^[a-z][a-z0-9:_-]*$` (typo, mixed-case)
 * 5. Task com `cache: false` E `outputs` declarado (contradição
 *    semântica — cache desligado não pode serializar outputs;
 *    code review pega isso eventualmente, mas o CI pega mais cedo)
 *
 * Limitações:
 * - Não detecta tasks "órfãs" sem `dependsOn` e não consumidas por ninguém
 *   (precisaria de análise de grafo; fora de escopo deste check estrutural).
 * - Não valida nomes dos scripts nos pacotes contra as tasks do turbo
 *   (esse é o trabalho de `check-package-json-drift` no outro extremo
 *   do pipeline).
 */
export async function checkTurboDrift(opts: { turboPath: string }): Promise<CheckResult> {
  const errors: string[] = [];
  const fullPath = path.resolve(opts.turboPath);

  let raw: string;
  try {
    raw = await fs.readFile(fullPath, 'utf-8');
  } catch (err) {
    return {
      ok: false,
      errors: [`turbo.json não encontrado em '${fullPath}': ${err}`],
    };
  }

  let parsed: TurboShape;
  try {
    parsed = JSON.parse(raw) as TurboShape;
  } catch (err) {
    return {
      ok: false,
      errors: [`turbo.json não é JSON válido (linha/coluna reportado pelo parser): ${err}`],
    };
  }

  if (!parsed.$schema || typeof parsed.$schema !== 'string') {
    errors.push(
      "drift detectado: turbo.json sem chave '$schema' (sem vinculação à schema oficial do turbo.build)",
    );
  } else if (!parsed.$schema.startsWith('https://turbo.build/schema.json')) {
    errors.push(
      `drift detectado: turbo.json.\$schema esperado 'https://turbo.build/schema.json' mas encontrado '${parsed.$schema}'`,
    );
  }

  if (!parsed.tasks || typeof parsed.tasks !== 'object') {
    errors.push("drift detectado: turbo.json sem bloco 'tasks' (pipeline vazio/inválido)");
  } else {
    const TASK_NAME_RE = /^[a-z][a-z0-9:_-]*$/;

    for (const [taskName, task] of Object.entries(parsed.tasks)) {
      if (!TASK_NAME_RE.test(taskName)) {
        errors.push(
          `drift detectado: nome de task '${taskName}' viola convenção (esperado lowercase + ':' para escopo: ${TASK_NAME_RE})`,
        );
      }

      if (task?.cache === false && Array.isArray(task.outputs) && task.outputs.length > 0) {
        errors.push(
          `drift detectado: task '${taskName}' declara cache:false MAS tem 'outputs' não-vazio (${JSON.stringify(task.outputs)}); semanticamente contraditório`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
