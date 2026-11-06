import { describe, expect, it } from 'vitest';

import {
  buildBootstrapPayload,
  buildRequiredChecksPatch,
  decideApply,
  parseExistingProtection,
} from '../protection.ts';

describe(buildBootstrapPayload, () => {
  it('produces a full protection object with strict, enforce_admins, and the given checks', () => {
    expect(buildBootstrapPayload(['code-quality / Code quality', 'e2e'])).toEqual({
      required_status_checks: {
        strict: true,
        checks: [{ context: 'code-quality / Code quality' }, { context: 'e2e' }],
      },
      enforce_admins: true,
      required_pull_request_reviews: null,
      restrictions: null,
    });
  });
});

describe(buildRequiredChecksPatch, () => {
  it('maps checks to context objects with strict enabled and no other fields', () => {
    expect(buildRequiredChecksPatch(['e2e'])).toEqual({
      strict: true,
      checks: [{ context: 'e2e' }],
    });
  });
});

describe(decideApply, () => {
  it('returns "bootstrap" when no protection exists', () => {
    expect(decideApply({ exists: false, requiredChecks: [], strict: false, enforceAdmins: false })).toBe('bootstrap');
  });

  it('returns "surgical" when protection already exists', () => {
    expect(
      decideApply({ exists: true, requiredChecks: ['code-quality / Code quality'], strict: true, enforceAdmins: true }),
    ).toBe('surgical');
  });
});

describe(parseExistingProtection, () => {
  it('extracts required checks, strict, and enforce_admins from a protection response', () => {
    const payload = {
      required_status_checks: {
        strict: true,
        checks: [{ context: 'code-quality / Code quality' }, { context: 'e2e' }],
      },
      enforce_admins: { enabled: true },
    };

    expect(parseExistingProtection(payload)).toEqual({
      exists: true,
      requiredChecks: ['code-quality / Code quality', 'e2e'],
      strict: true,
      enforceAdmins: true,
    });
  });

  it('defaults missing or malformed fields to empty checks and false flags', () => {
    expect(parseExistingProtection({})).toEqual({
      exists: true,
      requiredChecks: [],
      strict: false,
      enforceAdmins: false,
    });
  });

  it('skips check entries without a string context, keeping the rest', () => {
    const payload = {
      required_status_checks: {
        strict: true,
        checks: [{ context: 'code-quality / Code quality' }, {}, { context: 5 }],
      },
    };

    expect(parseExistingProtection(payload)).toEqual({
      exists: true,
      requiredChecks: ['code-quality / Code quality'],
      strict: true,
      enforceAdmins: false,
    });
  });
});
