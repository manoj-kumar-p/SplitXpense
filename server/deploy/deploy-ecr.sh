#!/bin/bash
# Deploy to AWS ECR
# Note: On Windows, run `chmod +x deploy/*.sh` in WSL/Git Bash before deploying.
set -e

REGION="ap-south-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPO="splitxpense"
TAG="${1:-latest}"
ECR_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO"

echo "=== Logging into ECR ==="
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_URI

echo "=== Creating repo (if needed) ==="
aws ecr describe-repositories --repository-names $REPO --region $REGION 2>/dev/null || \
  aws ecr create-repository --repository-name $REPO --region $REGION

echo "=== Building Docker image ==="
docker build -t $REPO:$TAG .

echo "=== Tagging and pushing ==="
docker tag $REPO:$TAG $ECR_URI:$TAG
docker push $ECR_URI:$TAG

echo ""
echo "=== Pushed: $ECR_URI:$TAG ==="
echo "Update ECS service: aws ecs update-service --cluster splitxpense --service splitxpense-server --force-new-deployment --region $REGION"
