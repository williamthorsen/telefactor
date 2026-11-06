import { describe, expect, it } from 'vitest';

import { runHarnessTest } from '../run-harness-test.ts';

const NODE = process.execPath;
const BASE = { workingDirectory: process.cwd(), signal: new AbortController().signal };

describe(runHarnessTest, () => {
  it('passes on exit code 0 and reports the output', async () => {
    const result = await runHarnessTest({ ...BASE, argv: [NODE, '--eval', "console.log('OK')"] });

    expect(result).toMatchObject({ ok: true, exit: 'exit code 0', output: 'OK' });
  });

  it('fails on a non-zero exit with stdout and stderr', async () => {
    const source = "console.log('out'); console.error('not signed in'); process.exitCode = 1";

    const result = await runHarnessTest({ ...BASE, argv: [NODE, '--eval', source] });

    expect(result).toMatchObject({ ok: false, exit: 'exit code 1', output: 'out\nnot signed in' });
  });

  it('reports a binary that cannot start', async () => {
    const result = await runHarnessTest({ ...BASE, argv: ['telefactor-missing-binary'] });

    expect(result).toMatchObject({ ok: false, exit: 'not started' });
  });

  it('reports a timeout', async () => {
    const result = await runHarnessTest({
      ...BASE,
      argv: [NODE, '--eval', 'setInterval(() => {}, 1000)'],
      timeoutMs: 200,
    });

    expect(result).toMatchObject({ ok: false, exit: 'timed out after 200 ms' });
  });
});
