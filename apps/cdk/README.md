<!-- readme-type: application -->

# CDK

AWS CDK infrastructure, written in TypeScript. `cdk.json` tells the CDK Toolkit how to execute the app.

To start a new app from this one, follow [Starting an app or a library from a template](../../docs/new-package.md).

<!-- section:release-notes --><!-- /section:release-notes -->

## Requirements

The `build:sam`, `dev`, and `start` scripts use the **AWS SAM CLI** (`sam`) — a separate tool from the AWS CLI (`aws`). Install it before running those scripts. The `build` script and the `nmr` quality gate do not need it.

```bash
brew install aws-sam-cli
```

It is in homebrew-core (no `aws/tap` needed) and is AWS's recommended install method on macOS. Confirm with `sam --version`.
The repo's readyup check warns about a missing install — run `rdy run cdk` from the monorepo root.

## Scripts

Workspace scripts (`build`, `check`, `lint`, `test`, `typecheck`) are run with `nmr` — see [Running scripts](../../README.md#running-scripts) in the root README. Run `nmr` from this directory to list this package's scripts.

Package-specific commands:

- `pnpm run deploy {stage} {awsProfile?}` — build the stack and deploy it (for example, `pnpm run deploy next skypilot`)
- `pnpm run synth {stage}` — synthesize the CloudFormation template
- `pnpm run destroy` — tear the deployed stack down
- `pnpm run dev` — build the stack, then run the API locally with AWS SAM
- `pnpm run start` — run the API locally with AWS SAM

The `cdk` CLI is also available via `pnpm exec cdk` — for example, `cdk diff` or `cdk synth`.
