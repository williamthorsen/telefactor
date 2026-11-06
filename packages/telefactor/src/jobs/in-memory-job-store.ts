import type { JobStore } from './create-jobs.ts';
import type { Job } from './job-schemas.ts';

/** Creates a job store that holds jobs in this process for as long as it runs. */
export function createInMemoryJobStore(): JobStore {
  const jobs = new Map<string, Job>();
  return {
    get(id) {
      const job = jobs.get(id);
      return Promise.resolve(job === undefined ? undefined : { ...job });
    },
    put(job) {
      jobs.set(job.id, { ...job });
      return Promise.resolve();
    },
  };
}
