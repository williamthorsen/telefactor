import assert from 'node:assert';
import process from 'node:process';

import { App } from 'aws-cdk-lib';

import { AppStack } from '#src/stack/AppStack.ts';

// region Environment-variable validation
const account = process.env['CDK_DEFAULT_ACCOUNT'];
const region = process.env['CDK_DEFAULT_REGION'];
assert.ok(account, 'Expected CDK_DEFAULT_ACCOUNT environment variable to be set');
assert.ok(region, 'Expected CDK_DEFAULT_REGION environment variable to be set');
// endregion

const app = new App();
const appName: unknown = app.node.tryGetContext('appName');
assert.ok(typeof appName === 'string', 'Expected context.appName to be set in cdk.json');
const stackName = composeStackName(appName);

new AppStack(app, stackName, {
  // see `<tools-repo>/aws/cdk/environments.md` for info on environment-agnostic and environment-specific stacks
  env: { account, region },
});

function composeStackName(appName: string): string {
  assert.ok(appName, 'Expected context.appName to be set in cdk.json');
  return `${appName}Stack`;
}
