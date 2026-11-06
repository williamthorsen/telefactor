// Pure helpers describing the branch-protection we want and how to apply it without clobbering.
// The GitHub API shapes are encoded here so they can be asserted in tests; `gh.ts` sends them.

import { z } from 'zod';

export interface CurrentProtection {
  exists: boolean;
  requiredChecks: string[];
  strict: boolean;
  enforceAdmins: boolean;
}

export type ApplyStrategy = 'bootstrap' | 'surgical';

interface StatusCheck {
  context: string;
}

interface RequiredStatusChecks {
  strict: boolean;
  checks: StatusCheck[];
}

/** Full payload for `PUT …/branches/{branch}/protection`; all four top-level keys are required (`null` = none). */
export interface BootstrapPayload {
  required_status_checks: RequiredStatusChecks;
  enforce_admins: boolean;
  required_pull_request_reviews: null;
  restrictions: null;
}

// Every field defaults on its own, so a response missing one slice still yields the others. Check
// entries stay `unknown` so a malformed entry is skipped and its siblings survive.
const existingProtectionSchema = z.object({
  required_status_checks: z
    .object({
      strict: z.boolean().catch(false),
      checks: z.array(z.unknown()).catch([]),
    })
    .catch({ strict: false, checks: [] }),
  enforce_admins: z.object({ enabled: z.boolean().catch(false) }).catch({ enabled: false }),
});
const statusCheckSchema = z.object({ context: z.string() });

/** Builds the full protection object for a branch that has no protection yet. */
export function buildBootstrapPayload(checks: string[]): BootstrapPayload {
  return {
    required_status_checks: buildRequiredChecksPatch(checks),
    enforce_admins: true,
    required_pull_request_reviews: null,
    restrictions: null,
  };
}

/** Builds the body for `PATCH …/protection/required_status_checks` — touches only checks + the up-to-date policy. */
export function buildRequiredChecksPatch(checks: string[]): RequiredStatusChecks {
  return {
    strict: true,
    checks: checks.map((context) => ({ context })),
  };
}

/**
 * Chooses how to apply protection: Bootstrap the whole object when none exists (nothing to clobber),
 * otherwise patch only the slices we own so unrelated settings (reviews, restrictions) survive.
 */
export function decideApply(current: CurrentProtection): ApplyStrategy {
  return current.exists ? 'surgical' : 'bootstrap';
}

/** Extracts the protection fields we manage from a `…/protection` response, defaulting malformed input. */
export function parseExistingProtection(payload: unknown): CurrentProtection {
  const protection = existingProtectionSchema.safeParse(payload);
  if (!protection.success) {
    return { exists: true, requiredChecks: [], strict: false, enforceAdmins: false };
  }
  const { required_status_checks: requiredStatusChecks, enforce_admins: enforceAdmins } = protection.data;
  const requiredChecks = requiredStatusChecks.checks.flatMap((check) => {
    const statusCheck = statusCheckSchema.safeParse(check);
    return statusCheck.success ? statusCheck.data.context : [];
  });
  return { exists: true, requiredChecks, strict: requiredStatusChecks.strict, enforceAdmins: enforceAdmins.enabled };
}
