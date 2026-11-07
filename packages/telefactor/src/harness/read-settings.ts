import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { describeError } from '#src/portable/describe-error.ts';
import { formatIssuePath, type Problem } from '#src/schemas/problem.ts';

import { BUILT_IN_SETTINGS, harnessConfigSchema, type HarnessSettings } from './settings-schema.ts';

/** The environment variable whose JSON argv replaces every other harness with one, when the options name none. */
export const HARNESS_COMMAND_VARIABLE = 'TELEFACTOR_HARNESS_COMMAND';

/** The name of the one harness that the environment variable defines. */
export const ENVIRONMENT_HARNESS_NAME = 'environment';

export type HarnessSource = 'built-in' | 'environment' | 'file';

/** The resolved settings and where their harnesses come from, or the problems of a config file that cannot be used. */
export type HarnessSettingsResult =
  | { ok: true; source: HarnessSource; configPath: string; hasConfigFile: boolean; settings: HarnessSettings }
  | { ok: false; source: 'file'; configPath: string; problems: Problem[] };

type ConfigFileRead =
  | { ok: true; file: { settings: HarnessSettings; definesHarnesses: boolean } | undefined }
  | { ok: false; problems: Problem[] };

const environmentCommandSchema = z.array(z.string()).min(1);

/**
 * Resolves the harness settings from the config file, else the built-in settings. When the environment variable is
 * set, its harness replaces the harnesses that either defines, and the file's timeout still applies. Throws on a
 * malformed variable.
 */
export async function readHarnessSettings({
  env,
  configPath,
  commandVariable = HARNESS_COMMAND_VARIABLE,
}: {
  env: Readonly<Record<string, string | undefined>>;
  configPath: string;
  /** The environment variable that defines a harness; defaults to `TELEFACTOR_HARNESS_COMMAND`. */
  commandVariable?: string;
}): Promise<HarnessSettingsResult> {
  const command = readEnvironmentCommand(env, commandVariable);
  const read = await readConfigFile(configPath);
  if (!read.ok) return { ok: false, source: 'file', configPath, problems: read.problems };

  const settings = read.file?.settings ?? BUILT_IN_SETTINGS;
  const common = { configPath, hasConfigFile: read.file !== undefined };
  if (command !== undefined) {
    return {
      ok: true,
      ...common,
      source: 'environment',
      settings: {
        ...settings,
        default: ENVIRONMENT_HARNESS_NAME,
        harnesses: { [ENVIRONMENT_HARNESS_NAME]: { command } },
      },
    };
  }
  return { ok: true, ...common, source: read.file?.definesHarnesses === true ? 'file' : 'built-in', settings };
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
function definesHarnesses(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'harnesses' in value;
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** Reads and validates the config file; `file` is absent when the file does not exist. */
async function readConfigFile(configPath: string): Promise<ConfigFileRead> {
  let text: string;
  try {
    text = await readFile(configPath, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return { ok: true, file: undefined };
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
  const parsed = harnessConfigSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({
        path: formatIssuePath(issue.path),
        message: `${issue.message} in ${configPath}.`,
      })),
    };
  }
  return { ok: true, file: { settings: parsed.data, definesHarnesses: definesHarnesses(value) } };
}
// endregion | Helpers
