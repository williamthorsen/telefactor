import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { describeError } from '#src/portable/describe-error.ts';
import { formatIssuePath, type Problem } from '#src/schemas/problem.ts';

import {
  buildHarnessConfigSchema,
  type BuiltInHarnesses,
  type EmptyAppConfig,
  harnessConfigSchema,
  type HarnessSettings,
} from './settings-schema.ts';

/** The environment variable whose JSON argv replaces every other harness with one, when the options name none. */
export const HARNESS_COMMAND_VARIABLE = 'TELEFACTOR_HARNESS_COMMAND';

/** The name of the one harness that the environment variable defines. */
export const ENVIRONMENT_HARNESS_NAME = 'environment';

export type HarnessSource = 'built-in' | 'environment' | 'file';

/** The resolved settings and where their harnesses come from, or the problems of a config file that cannot be used. */
export type HarnessSettingsResult<A = EmptyAppConfig> =
  | { ok: true; source: HarnessSource; configPath: string; hasConfigFile: boolean; settings: HarnessSettings<A> }
  | { ok: false; source: 'file'; configPath: string; problems: Problem[] };

export interface ReadHarnessSettingsOptions {
  env: Readonly<Record<string, string | undefined>>;
  configPath: string;
  /** The harnesses that apply in place of the package's recipes when neither the variable nor the file defines any. */
  builtIn?: BuiltInHarnesses;
  /** The environment variable that defines a harness; defaults to `TELEFACTOR_HARNESS_COMMAND`. */
  commandVariable?: string;
}

type ConfigFileRead<A> =
  | { ok: true; settings: HarnessSettings<A>; hasConfigFile: boolean; definesHarnesses: boolean }
  | { ok: false; problems: Problem[] };

/** A config schema built by `buildHarnessConfigSchema`, whose output holds the app's values under `app`. */
type ConfigSchema<A> = z.ZodType<HarnessSettings<A>>;

const environmentCommandSchema = z.array(z.string()).min(1);

/**
 * Resolves the harness settings from the config file, else the built-in settings: the app's `builtIn` when given, else
 * the package's recipes. When the environment variable is set, its harness replaces the harnesses that either defines,
 * and the file's timeout still applies. With an app config schema, the file may hold the app's keys too, and their
 * values, with their defaults when the file is absent, are returned under `settings.app`. Throws on a malformed
 * variable, on an app config schema that names a package key, and on invalid built-in harnesses.
 */
export function readHarnessSettings(options: ReadHarnessSettingsOptions): Promise<HarnessSettingsResult>;
export function readHarnessSettings<S extends z.ZodObject>(
  options: ReadHarnessSettingsOptions & { config: S },
): Promise<HarnessSettingsResult<z.output<S>>>;
export function readHarnessSettings(
  options: ReadHarnessSettingsOptions & { config?: z.ZodObject },
): Promise<HarnessSettingsResult<unknown>> {
  const { builtIn, config, ...rest } = options;
  if (config === undefined && builtIn === undefined) return readSettingsWithSchema(rest, harnessConfigSchema);
  return readSettingsWithSchema(rest, buildHarnessConfigSchema(config ?? z.object({}), builtIn));
}

/** Returns the argv that the environment variable sets, if any; throws on a malformed value. */
export function readEnvironmentCommand(
  env: Readonly<Record<string, string | undefined>>,
  variable: string = HARNESS_COMMAND_VARIABLE,
): string[] | undefined {
  const raw = env[variable];
  if (raw === undefined || raw.trim() === '') return undefined;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = undefined;
  }
  const parsed = environmentCommandSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${variable} must be a JSON array of one or more strings, such as ["claude", "-p"]; it is ${raw}`);
  }
  return parsed.data;
}

// region | Helpers
/** Reads the settings with a config schema that has already been built. */
async function readSettingsWithSchema<A>(
  { env, configPath, commandVariable = HARNESS_COMMAND_VARIABLE }: ReadHarnessSettingsOptions,
  schema: ConfigSchema<A>,
): Promise<HarnessSettingsResult<A>> {
  const command = readEnvironmentCommand(env, commandVariable);
  const read = await readConfigFile(configPath, schema);
  if (!read.ok) return { ok: false, source: 'file', configPath, problems: read.problems };

  const { settings, hasConfigFile, definesHarnesses } = read;
  if (command !== undefined) {
    return {
      ok: true,
      configPath,
      hasConfigFile,
      source: 'environment',
      settings: {
        ...settings,
        default: ENVIRONMENT_HARNESS_NAME,
        harnesses: { [ENVIRONMENT_HARNESS_NAME]: { command } },
      },
    };
  }
  return { ok: true, configPath, hasConfigFile, source: definesHarnesses ? 'file' : 'built-in', settings };
}

function definesHarnesses(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'harnesses' in value;
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** Reads and validates the config file, validating an empty object when the file does not exist. */
async function readConfigFile<A>(configPath: string, schema: ConfigSchema<A>): Promise<ConfigFileRead<A>> {
  let text: string;
  try {
    text = await readFile(configPath, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return parseConfig(configPath, schema, {}, false);
    return {
      ok: false,
      problems: [{ path: '', message: `${configPath} could not be read: ${describeError(error)}.` }],
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      problems: [{ path: '', message: `${configPath} is not valid JSON: ${describeError(error)}.` }],
    };
  }
  return parseConfig(configPath, schema, value, true);
}

/** Validates a config file's value, or the empty object that stands for a missing file. */
function parseConfig<A>(
  configPath: string,
  schema: ConfigSchema<A>,
  value: unknown,
  hasConfigFile: boolean,
): ConfigFileRead<A> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const location = hasConfigFile ? configPath : `${configPath}, which does not exist`;
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({
        path: formatIssuePath(issue.path),
        message: `${issue.message} in ${location}.`,
      })),
    };
  }
  return { ok: true, settings: parsed.data, hasConfigFile, definesHarnesses: definesHarnesses(value) };
}
// endregion | Helpers
