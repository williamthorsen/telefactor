import { z } from 'zod';

import { BUILT_IN_DEFAULT_HARNESS, BUILT_IN_HARNESSES } from './built-in-harnesses.ts';

/** The timeout, in minutes, that applies when the config sets none. */
export const DEFAULT_TIMEOUT_MINUTES = 10;

/** The longest timeout, in minutes, that a config may set. */
export const MAX_TIMEOUT_MINUTES = 120;

const argvSchema = z.array(z.string()).min(1, 'Give at least one argument');

/**
 * A harness recipe: `{prompt}` in a `command` argument expands to the prompt text, which also goes to stdin. `{mcpUrl}`
 * in an `mcpArgs` argument expands to the URL of the MCP endpoint.
 */
export const harnessSchema = z
  .strictObject({
    label: z.string().optional(),
    command: argvSchema,
    /** A quick check that the harness is installed and signed in; it passes on exit code 0. */
    test: argvSchema.optional(),
    /** The command that starts an interactive session in the embedded terminal. */
    interactive: argvSchema.optional(),
    /** Arguments appended to `interactive` when the app serves an MCP endpoint, which connect the harness to it. */
    mcpArgs: argvSchema.optional(),
  })
  .refine((harness) => harness.mcpArgs === undefined || harness.interactive !== undefined, {
    path: ['mcpArgs'],
    message: 'Define `interactive` to use `mcpArgs`',
  });

export type Harness = z.output<typeof harnessSchema>;

/** The app config schema that applies when the options name none: an app without keys of its own. */
const EMPTY_APP_CONFIG_SCHEMA = z.object({});

/** The keys that the package defines in the config file, which an app config schema may not name. */
const PACKAGE_CONFIG_SHAPE = {
  default: z.string().optional(),
  timeoutMinutes: z.number().positive().max(MAX_TIMEOUT_MINUTES).default(DEFAULT_TIMEOUT_MINUTES),
  harnesses: z
    .record(z.string(), harnessSchema)
    .refine((harnesses) => Object.keys(harnesses).length > 0, 'Define at least one harness')
    .optional(),
};

/**
 * Builds the schema of a config file that holds the package's keys and the app's. The file stays strict, so that a key
 * that neither defines is reported, and the app's values are parsed by its own schema into `app`. Throws when the app's
 * schema names a key that the package defines.
 */
export function buildHarnessConfigSchema<S extends z.ZodObject>(appConfigSchema: S) {
  const appKeys = Object.keys(appConfigSchema.shape);
  const collisions = appKeys.filter((key) => Object.hasOwn(PACKAGE_CONFIG_SHAPE, key));
  if (collisions.length > 0) {
    throw new Error(`The app config may not define ${collisions.join(', ')}, which the package's config defines.`);
  }
  // Let the app's keys through the strict object; the app's own schema parses them below.
  const appPassThrough = Object.fromEntries(appKeys.map((key) => [key, z.unknown().optional()]));

  return z.strictObject({ ...PACKAGE_CONFIG_SHAPE, ...appPassThrough }).transform((config, context) => {
    const { default: configuredDefault, timeoutMinutes, harnesses: configuredHarnesses, ...appValues } = config;
    const app = appConfigSchema.safeParse(appValues);
    if (!app.success) {
      for (const issue of app.error.issues)
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    }

    const harnesses = configuredHarnesses ?? BUILT_IN_HARNESSES;
    const names = Object.keys(harnesses);
    const [onlyName] = names;
    const fallback =
      configuredHarnesses === undefined ? BUILT_IN_DEFAULT_HARNESS : names.length === 1 ? onlyName : undefined;
    const defaultName = configuredDefault ?? fallback;
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
    if (!app.success) return z.NEVER;
    return { default: defaultName, timeoutMinutes, harnesses, app: app.data };
  });
}

/**
 * The shape of `telefactor.config.json` for an app without keys of its own. Every key is optional: `harnesses` defaults
 * to the built-in recipes and replaces them when present, `timeoutMinutes` defaults to 10, and `default` may be omitted
 * only when one harness is defined or the harnesses are the built-ins.
 */
export const harnessConfigSchema = buildHarnessConfigSchema(EMPTY_APP_CONFIG_SCHEMA);

/** The values of an app config schema's keys, empty for an app without keys of its own. */
export type EmptyAppConfig = z.output<typeof EMPTY_APP_CONFIG_SCHEMA>;

/** The resolved settings: the package's, and the app's under `app`. */
export interface HarnessSettings<A = EmptyAppConfig> {
  default: string;
  timeoutMinutes: number;
  harnesses: Readonly<Record<string, Harness>>;
  app: A;
}

/** The settings that apply when neither the environment variable nor the config file defines a harness. */
export const BUILT_IN_SETTINGS: HarnessSettings = {
  default: BUILT_IN_DEFAULT_HARNESS,
  timeoutMinutes: DEFAULT_TIMEOUT_MINUTES,
  harnesses: BUILT_IN_HARNESSES,
  app: {},
};

/** Returns the harness of that name, ignoring the properties that every object inherits. */
export function findHarness(settings: HarnessSettings<unknown>, name: string): Harness | undefined {
  return Object.hasOwn(settings.harnesses, name) ? settings.harnesses[name] : undefined;
}
