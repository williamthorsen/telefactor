/** @noformat -- @generated. Do not edit. Compiled by rdy. */
/* eslint-disable */
export const __readyupVersion = "0.44.0";


// .readyup/kits/cdk.ts
import { defineRdyKit } from "readyup";
import { commandExists, fileExists } from "readyup/check-utils";
var cdkTooling = {
  name: "cdk-tooling",
  checks: [
    {
      name: "AWS SAM CLI (sam) is installed",
      // Relevant only when the cdk package is present in this repo.
      skip: () => fileExists("apps/cdk/package.json") ? false : "no cdk package",
      check: () => commandExists("sam"),
      severity: "warn",
      fix: "Install the AWS SAM CLI (used by the cdk package build:sam, dev, and start scripts): brew install aws-sam-cli; see apps/cdk/README.md"
    }
  ]
};
var cdk_default = defineRdyKit({
  checklists: [cdkTooling]
});
export {
  cdk_default as default
};
