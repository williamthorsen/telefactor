import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { wtConfigCopiesIgnoredFiles, wtConfigUsesPreStartHooks } from '../.readyup/kits/lib/helpers.ts';

const TEMPLATE_WT_CONFIG = readFileSync('.config/wt.toml', 'utf8');

const WT_CONFIG_WITHOUT_REQUIRE_INCLUDE = `[[pre-start]]
copy = "wt step copy-ignored"

[[pre-start]]
deps = "pnpm install"
`;

const WT_CONFIG_WITH_POST_CREATE = `[post-create]
copy = "wt step copy-ignored --require-include"
deps = "pnpm install"
`;

describe(wtConfigCopiesIgnoredFiles, () => {
  it('accepts the template config', () => {
    expect(wtConfigCopiesIgnoredFiles(TEMPLATE_WT_CONFIG)).toBe(true);
  });

  it('rejects a copy that omits --require-include', () => {
    expect(wtConfigCopiesIgnoredFiles(WT_CONFIG_WITHOUT_REQUIRE_INCLUDE)).toBe(false);
  });

  it('rejects a config with no copy step', () => {
    expect(wtConfigCopiesIgnoredFiles('[[pre-start]]\ndeps = "pnpm install"\n')).toBe(false);
  });
});

describe(wtConfigUsesPreStartHooks, () => {
  it('accepts the template config', () => {
    expect(wtConfigUsesPreStartHooks(TEMPLATE_WT_CONFIG)).toBe(true);
  });

  it('rejects a config that uses a post-create table', () => {
    expect(wtConfigUsesPreStartHooks(WT_CONFIG_WITH_POST_CREATE)).toBe(false);
  });

  it('rejects a config that mixes pre-start and post-create tables', () => {
    expect(wtConfigUsesPreStartHooks(`${WT_CONFIG_WITHOUT_REQUIRE_INCLUDE}\n[post-create]\nx = "y"\n`)).toBe(false);
  });
});
