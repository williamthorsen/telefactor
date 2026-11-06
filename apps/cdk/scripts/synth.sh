#!/usr/bin/env bash

# This script generates a template for the specified branch.

BRANCH=${1:-$BRANCH}
VERSION=${2:-$npm_package_version}
ITERATION=${3:-${ITERATION:-0}}

if [ -z "${BRANCH}" ] || [ -z "${VERSION}" ] || [ -z "${ITERATION}" ]; then
  echo "BRANCH=${BRANCH}"
  echo "VERSION=${VERSION}"
  echo "ITERATION=${ITERATION}"
  echo "Usage: $0 {branchName} {version} {iteration}"
  exit 1
fi

CDK_DEFAULT_ACCOUNT=${CDK_DEFAULT_ACCOUNT:-123456789012} CDK_DEFAULT_REGION=${CDK_DEFAULT_REGION:-us-east-1} \
  BRANCH=$BRANCH VERSION=$VERSION ITERATION=$ITERATION pnpm cdk synthesize --quiet
