#!/usr/bin/env bash
set -e

# Configure AWS CLI to use LocalStack environment
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_DEFAULT_OUTPUT=json
export ENDPOINT_URL=http://localhost:4566

# Wait for LocalStack to be ready
echo "Waiting for LocalStack to be ready..."
for i in {1..30}; do
    if aws --endpoint-url=http://localstack:4566 s3 ls > /dev/null 2>&1; then
        echo "LocalStack is ready!"
        break
    fi
    echo "Waiting... attempt $i"
    sleep 1
done

# Create S3 buckets
echo "Creating S3 buckets..."
aws --endpoint-url=http://localstack:4566 s3 mb s3://crackosaurus-wordlists || true
aws --endpoint-url=http://localstack:4566 s3 mb s3://crackosaurus-instances || true

# No DynamoDB tables needed - using PostgreSQL with Prisma for data storage