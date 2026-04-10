#!/bin/bash
# One-time AWS setup for SplitXpense
# Prerequisites: AWS CLI configured with admin credentials
# Note: On Windows, run `chmod +x deploy/*.sh` in WSL/Git Bash before deploying.
set -e

REGION="ap-south-1"
APP="splitxpense"

echo "=== Creating ECR Repository ==="
aws ecr create-repository --repository-name $APP --region $REGION 2>/dev/null || echo "ECR repo exists"

echo "=== Creating ECS Cluster ==="
aws ecs create-cluster --cluster-name $APP --region $REGION 2>/dev/null || echo "ECS cluster exists"

echo "=== Creating CloudWatch Log Group ==="
aws logs create-log-group --log-group-name /ecs/$APP --region $REGION 2>/dev/null || echo "Log group exists"

echo "=== Creating SSM Parameters (fill in values) ==="
aws ssm put-parameter --name "/$APP/setu-client-id" --type SecureString --value "CHANGE_ME" --region $REGION 2>/dev/null || true
aws ssm put-parameter --name "/$APP/setu-client-secret" --type SecureString --value "CHANGE_ME" --region $REGION 2>/dev/null || true
aws ssm put-parameter --name "/$APP/jwt-secret" --type SecureString --value "$(openssl rand -hex 32)" --region $REGION 2>/dev/null || true
aws ssm put-parameter --name "/$APP/database-url" --type SecureString --value "CHANGE_ME" --region $REGION 2>/dev/null || true
aws ssm put-parameter --name "/$APP/redis-url" --type SecureString --value "CHANGE_ME" --region $REGION 2>/dev/null || true

echo ""
echo "=== Done ==="
echo "Next: Update SSM parameter values, then deploy with deploy-ecr.sh"
