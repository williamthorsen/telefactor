/**
 * Environment-readiness checks for the cdk package.
 *
 * Unlike the template-drift kit (default.ts), this kit verifies host tooling
 * that the cdk package's local API scripts need. It persists into repos created
 * from this template and skips automatically when the cdk package has been
 * removed.
 */
import { defineRdyKit, type RdyChecklist } from 'readyup';
import { commandExists, fileExists } from 'readyup/check-utils';

const cdkTooling: RdyChecklist = {
  name: 'cdk-tooling',
  checks: [
    {
      name: 'AWS SAM CLI (sam) is installed',
      // Relevant only when the cdk package is present in this repo.
      skip: () => (fileExists('apps/cdk/package.json') ? false : 'no cdk package'),
      check: () => commandExists('sam'),
      severity: 'warn',
      fix: 'Install the AWS SAM CLI (used by the cdk package build:sam, dev, and start scripts): brew install aws-sam-cli; see apps/cdk/README.md',
    },
  ],
};

export default defineRdyKit({
  checklists: [cdkTooling],
});
