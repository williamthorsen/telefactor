import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.join(import.meta.dirname, '..');
const BROWSER_ONLY = ['react', 'react-dom', '@williamthorsen/terminal-react'];

describe('the ./client entry', () => {
  it('reaches neither React nor the terminal component through its imports', async () => {
    const external = await collectExternalImports(path.join(SOURCE_ROOT, 'client.ts'));

    // The client validates every response with zod, so the walk reached the modules behind the entry.
    expect(external).toContain('zod');
    expect(external.filter((specifier) => BROWSER_ONLY.some((name) => isPackage(specifier, name)))).toStrictEqual([]);
  });
});

// region | Helpers
/** Follows the static imports of a module through the package's source and returns every package that they name. */
async function collectExternalImports(entry: string): Promise<string[]> {
  const visited = new Set<string>();
  const external = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (visited.has(file)) continue;
    visited.add(file);
    const text = await readFile(file, 'utf8');
    for (const [, specifier = ''] of text.matchAll(/^(?:import|export)\s[^;]*?from\s+'([^']+)'/gms)) {
      if (specifier.startsWith('#src/')) pending.push(path.join(SOURCE_ROOT, specifier.slice('#src/'.length)));
      else if (specifier.startsWith('.')) pending.push(path.resolve(path.dirname(file), specifier));
      else external.add(specifier);
    }
  }
  return [...external];
}

function isPackage(specifier: string, name: string): boolean {
  return specifier === name || specifier.startsWith(`${name}/`);
}
// endregion | Helpers
