import { promptJob } from '#src/contract/define-job.ts';

import { implementJob } from './implement-job.ts';

/**
 * The built-in job's server side: `{prompt}` in the command expands to the prompt text, which also goes to stdin, and
 * the result is the command's stdout.
 */
export const promptJobImplementation = implementJob(promptJob, {
  prepare: ({ prompt }) =>
    Promise.resolve({
      placeholders: { prompt },
      stdin: prompt,
      read: ({ stdout }) => Promise.resolve({ output: stdout }),
    }),
});
