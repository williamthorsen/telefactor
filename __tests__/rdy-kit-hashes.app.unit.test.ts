import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DEPENDABOT_HASH, EDITORCONFIG_HASH } from '../.readyup/kits/default.ts';

/** Compute SHA-256 hex digest, matching readyup's computeHash implementation. */
function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Verify that embedded hashes in the readyup kit stay in sync with the actual
 * template files. If a hash check fails, update the constant in
 * .readyup/kits/default.ts to match the new hash shown in the error message.
 */
describe('readyup kit hashes match template files', () => {
  const cases: Array<{
    file: string;
    constantName: string;
    expectedHash: string;
  }> = [
    { file: '.editorconfig', constantName: 'EDITORCONFIG_HASH', expectedHash: EDITORCONFIG_HASH },
    { file: '.github/dependabot.yml', constantName: 'DEPENDABOT_HASH', expectedHash: DEPENDABOT_HASH },
  ];

  for (const { file, constantName, expectedHash } of cases) {
    it(`${constantName} matches ${file}`, () => {
      const content = readFileSync(file, 'utf8');
      const actualHash = sha256(content);
      expect(actualHash, `${constantName} in .readyup/kits/default.ts is stale — update it to: ${actualHash}`).toBe(
        expectedHash,
      );
    });
  }
});
