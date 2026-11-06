import { z } from 'zod';

import { BUILT_IN_DEFAULT_HARNESS, BUILT_IN_HARNESSES } from './built-in-harnesses.ts';

/** The timeout, in minutes, that applies when the config sets none. */
export const DEFAULT_TIMEOUT_MINUTES = 10;

/** The longest timeout, in minutes, that a config may set. */
export const MAX_TIMEOUT_MINUTES = 120;

const argvSchema = z.array(z.string()).min(1, 'Give at least one argument');

/** A harness recipe: `{prompt}` in a `command` argument expands to the prompt text, which also goes to stdin. */
export const harnessSchema = z.strictObject({
  label: z.string().optional(),
  command: argvSchema,
  /** A quick check that the harness is installed and signed in; it passes on exit code 0. */
  test: argvSchema.optional(),
});

export type Harness = z.output<typeof harnessSchema>;

/**
 * The shape of `telefactor.config.json`. Every key is optional: `harnesses` defaults to the built-in recipes and
 * replaces them when present, `timeoutMinutes` defaults to 10, and `default` may be omitted only when one harness is
 * defined or the harnesses are the built-ins.
 */
export const harnessConfigSchema = z
  .strictObject({
    default: z.string().optional(),
    timeoutMinutes: z.number().positive().max(MAX_TIMEOUT_MINUTES).default(DEFAULT_TIMEOUT_MINUTES),
    harnesses: z
      .record(z.string(), harnessSchema)
      .refine((harnesses) => Object.keys(harnesses).length > 0, 'Define at least one harness')
      .optional(),
  })
  .transform((config, context) => {
    const harnesses = config.harnesses ?? BUILT_IN_HARNESSES;
    const names = Object.keys(harnesses);
    const [onlyName] = names;
    const fallback =
      config.harnesses === undefined ? BUILT_IN_DEFAULT_HARNESS : names.length === 1 ? onlyName : undefined;
    const defaultName = config.default ?? fallback;
    if (defaultName === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['default'],
        message: `Name the default harness, one of: ${names.join(', ')}`,
      });
      return z.NEVER;
    }
    if (!Object.hasOwn(harnesses, defaultName)) {
      context.addIssue({
        code: 'custom',
        path: ['default'],
        message: `"${defaultName}" does not name a harness. Name one of: ${names.join(', ')}`,
      });
      return z.NEVER;
    }
    return { default: defaultName, timeoutMinutes: config.timeoutMinutes, harnesses };
  });

export type HarnessSettings = z.output<typeof harnessConfigSchema>;

/** The settings that apply when neither the environment variable nor the config file defines a harness. */
export const BUILT_IN_SETTINGS: HarnessSettings = {
  default: BUILT_IN_DEFAULT_HARNESS,
  timeoutMinutes: DEFAULT_TIMEOUT_MINUTES,
  harnesses: BUILT_IN_HARNESSES,
};

/** Returns the harness of that name, ignoring the properties that every object inherits. */
export function findHarness(settings: HarnessSettings, name: string): Harness | undefined {
  return Object.hasOwn(settings.harnesses, name) ? settings.harnesses[name] : undefined;
}
