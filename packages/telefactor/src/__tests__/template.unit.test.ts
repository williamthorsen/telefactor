import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import packageJson from '../../package.json' with { type: 'json' };

const TEMPLATE_DIRECTORY = '_workspace';
const TEMPLATE_PACKAGE_NAME = 'telefactor-workspace-template';
const TEMPLATE_README_TITLE = '# Workspace template';

const thisFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(thisFilePath);
const [workspaceName] = currentDirectory.split('/').slice(-3, -2);

if (workspaceName === TEMPLATE_DIRECTORY) {
  describe('workspace is template', () => {
    it.todo('remove after renamed workspace passes test');
  });
} else {
  describe('workspace is clone', () => {
    it('package name has been changed from the template', () => {
      expect(packageJson.name).not.toBe(TEMPLATE_PACKAGE_NAME);
    });

    it('README title has been changed from the template', () => {
      const readmePath = path.resolve(currentDirectory, '../../README.md');
      const readmeLines = readFileSync(readmePath, { encoding: 'utf8' }).split('\n');

      expect(readmeLines).not.toContain(TEMPLATE_README_TITLE);
    });
  });
}
