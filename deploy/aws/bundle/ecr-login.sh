#!/usr/bin/env bash
set -euo pipefail
config=/opt/elasticbeanstalk/bin/get-config
region=$("$config" environment -k AWS_REGION)
registry=$("$config" environment -k ECR_REGISTRY)
if [[ ! "$region" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]] ||
   [[ ! "$registry" =~ ^[0-9]{12}\.dkr\.ecr\.${region}\.amazonaws\.com$ ]]; then
  echo 'Set AWS_REGION and ECR_REGISTRY as plain Beanstalk properties.' >&2
  exit 1
fi
aws ecr get-login-password --region "$region" |
  docker login --username AWS --password-stdin "$registry"
