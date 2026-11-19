// apps/api/src/shared/domain/para-registro.spec.ts
//
// O FURO que este spec fecha: o valor que vai para o REGISTRO é ditado pelo
// cliente — e um `\n` nele grava uma linha de log em branco, ou uma linha
// que PARECE outra.
//
// ⚠️ E o alvo tem que CONTINUAR na linha: a primeira revisão removia os
// caracteres em vez de substituí-los, e um `:id` de `!!!` virava uma string
// vazia — a linha de registro saía sem alvo, e dois ids diferentes
// produziam a MESMA linha. A escalada deixou de ser atribuível.

import { describe, it, expect } from 'vitest';
import { paraRegistro } from './para-registro.js';

describe('paraRegistro — a forma do valor que vai para o registro', () => {
  it('NÃO deixa o valor cru do cliente quebrar a linha', () => {
    const registro = paraRegistro('abc\ndef\r\nghi');

    expect(registro).not.toContain('\n');
    expect(registro).not.toContain('\r');
    // E o valor continua ali — trocado, e não apagado.
    expect(registro).toContain('abc');
    expect(registro).toContain('def');
  });

  it('um valor que NÃO é seguro não some da linha', () => {
    const registro = paraRegistro('!!!');

    expect(registro).not.toBe('');
    expect(registro).toContain('___');
  });

  it('dois valores diferentes NÃO produzem a mesma linha', () => {
    expect(paraRegistro('!!!')).not.toBe(paraRegistro('$$$'));
  });

  it('um valor já seguro sai como é — sem ruído', () => {
    const uuid = '0190a8b6-1234-7abc-9def-000000000999';

    expect(paraRegistro(uuid)).toBe(uuid);
  });

  it('o valor truncado ainda carrega a impressão digital do original', () => {
    const longo = 'a'.repeat(200);
    const registro = paraRegistro(longo);

    expect(registro.length).toBeLessThan(100);
    // E o registro de um valor longo DIFERENTE não é o mesmo.
    expect(registro).not.toBe(paraRegistro('b'.repeat(200)));
  });
});
