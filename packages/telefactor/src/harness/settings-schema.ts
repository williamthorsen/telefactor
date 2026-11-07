import { z } from 'zod';

import { formatIssuePath } from '#src/schemas/problem.ts';

import { BUILT_IN_DEFAULT_HARNESS, BUILT_IN_HARNESSES } from './built-in-harnesses.ts';

/** The timeout, in minutes, that applies when the config sets none. */
export const DEFAULT_TIMEOUT_MINUTES = 10;

/** The longest timeout, in minutes, that a config may set. */
export const MAX_TIMEOUT_MINUTES = 120;

const argvSchema = z.array(z.string()).min(1, 'Give at least one argument');

/**
 * A harness recipe: Each placeholder that the job defines expands in a `command` argument, as `{prompt}` expands to the
 * prompt text in the built-in job. `{mcpUrl}` in an `mcpArgs` argument expands to the URL of the MCP endpoint.
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

/** The harnesses that an app supplies in place of the package's recipes, shaped like the config file's keys. */
export interface BuiltInHarnesses {
  harnesses: Readonly<Record<string, Harness>>;
  /** The harness that runs a job whose request names none; may be omitted when `harnesses` defines one. */
  default?: string;
}

const builtInHarnessesSchema = z
  .strictObject({ default: z.string().optional(), harnesses: z.record(z.string(), harnessSchema) })
  .transform((builtIn, context) => {
    const names = Object.keys(builtIn.harnesses);
    if (names.length === 0) {
      context.addIssue({ code: 'custom', path: ['harnesses'], message: 'Define at least one harness' });
      return z.NEVER;
    }
    const defaultName = checkDefaultName(builtIn.harnesses, builtIn.default ?? findOnlyName(names), context);
    if (defaultName === undefined) return z.NEVER;
    return { default: defaultName, harnesses: builtIn.harnesses };
  });

/**
 * Validates the harnesses that an app supplies and returns them with their default, which is the only harness when
 * they name none. Throws on an invalid recipe, an empty `harnesses`, a `default` that names none of them, and several
 * harnesses without a `default`.
 */
export function resolveBuiltInHarnesses(builtIn: BuiltInHarnesses): Required<BuiltInHarnesses> {
  const parsed = builtInHarnessesSchema.safeParse(builtIn);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${formatIssuePath(['builtIn', ...issue.path])}: ${issue.message}`,
    );
    throw new Error(`The built-in harnesses are invalid: ${problems.join('; ')}.`);
  }
  return parsed.data;
}

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
 * that neither defines is reported, and the app's values are parsed by its own schema into `app`. A file that does not
 * define `harnesses` gets the app's built-in harnesses when given, else the package's recipes. Throws when the app's
 * schema names a key that the package defines, and on invalid built-in harnesses.
 */
export function buildHarnessConfigSchema<S extends z.ZodObject>(
  appConfigSchema: S,
  builtIn?: BuiltInHarnesses,
): z.ZodType<HarnessSettings<z.output<S>>> {
  const appKeys = Object.keys(appConfigSchema.shape);
  const collisions = appKeys.filter((key) => Object.hasOwn(PACKAGE_CONFIG_SHAPE, key));
  if (collisions.length > 0) {
    throw new Error(`The app config may not define ${collisions.join(', ')}, which the package's config defines.`);
  }
  const fallback =
    builtIn === undefined
      ? { default: BUILT_IN_DEFAULT_HARNESS, harnesses: BUILT_IN_HARNESSES }
      : resolveBuiltInHarnesses(builtIn);
  // Let the app's keys through the strict object; the app's own schema parses them below.
  const appPassThrough = Object.fromEntries(appKeys.map((key) => [key, z.unknown().optional()]));

  return z.strictObject({ ...PACKAGE_CONFIG_SHAPE, ...appPassThrough }).transform((config, context) => {
    const { default: configuredDefault, timeoutMinutes, harnesses: configuredHarnesses, ...appValues } = config;
    const app = appConfigSchema.safeParse(appValues);
    if (!app.success) {
      for (const issue of app.error.issues)
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    }

    const harnesses = configuredHarnesses ?? fallback.harnesses;
    const unnamedDefault =
      configuredHarnesses === undefined ? fallback.default : findOnlyName(Object.keys(configuredHarnesses));
    const defaultName = checkDefaultName(harnesses, configuredDefault ?? unnamedDefault, context);
    if (defaultName === undefined || !app.success) return z.NEVER;
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

// region | Helpers
/** Returns the default harness's name, or reports at `default` that it is missing or names none of the harnesses. */
function checkDefaultName(
  harnesses: Readonly<Record<string, Harness>>,
  defaultName: string | undefined,
  context: z.RefinementCtx,
): string | undefined {
  const names = Object.keys(harnesses).join(', ');
  if (defaultName === undefined) {
    context.addIssue({ code: 'custom', path: ['default'], message: `Name the default harness, one of: ${names}` });
    return undefined;
  }
  if (!Object.hasOwn(harnesses, defaultName)) {
    context.addIssue({
      code: 'custom',
      path: ['default'],
      message: `"${defaultName}" does not name a harness. Name one of: ${names}`,
    });
    return undefined;
  }
  return defaultName;
}

/** Returns the name when there is exactly one. */
function findOnlyName(names: readonly string[]): string | undefined {
  return names.length === 1 ? names[0] : undefined;
}
// endregion | Helpers
