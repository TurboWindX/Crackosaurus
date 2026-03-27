#!/usr/bin/env bash
set -e

# Configure AWS CLI to use LocalStack environment
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=ca-central-1
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

echo "LocalStack S3 is ready. Buckets will be created by the application on startup."

# No DynamoDB tables needed - using PostgreSQL with Prisma for data storage