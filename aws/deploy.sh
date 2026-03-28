#!/bin/bash

# UniEvent AWS Deployment Script
# This script deploys the complete AWS infrastructure for UniEvent

set -e

# Configuration
STACK_NAME="UniEvent-Stack"
REGION="us-east-1"
ENVIRONMENT="production"
TM_API_KEY="BhIfKFOQvkFAFIQmckEMGOAhpNOjGvpw"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if AWS CLI is installed
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    print_status "AWS CLI is installed"
}

# Check if user is logged in to AWS
check_aws_credentials() {
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Please run 'aws configure' first."
        exit 1
    fi
    print_status "AWS credentials are configured"
}

# Validate CloudFormation template
validate_template() {
    print_status "Validating CloudFormation template..."
    aws cloudformation validate-template \
        --template-body file://aws/infrastructure.yaml \
        --region $REGION
    print_status "Template validation successful"
}

# Deploy CloudFormation stack
deploy_stack() {
    print_status "Deploying CloudFormation stack: $STACK_NAME"
    
    aws cloudformation deploy \
        --template-file aws/infrastructure.yaml \
        --stack-name $STACK_NAME \
        --parameter-overrides \
            Environment=$ENVIRONMENT \
            KeyName=unievent-key \
            TicketmasterApiKey=$TM_API_KEY \
        --capabilities CAPABILITY_IAM \
        --region $REGION \
        --no-fail-on-empty-changeset
    
    print_status "Stack deployment completed"
}

# Wait for stack deployment to complete
wait_for_stack() {
    print_status "Waiting for stack deployment to complete..."
    
    aws cloudformation wait stack-create-complete \
        --stack-name $STACK_NAME \
        --region $REGION
    
    if [ $? -eq 0 ]; then
        print_status "Stack deployment completed successfully"
    else
        print_error "Stack deployment failed"
        exit 1
    fi
}

# Get stack outputs
get_stack_outputs() {
    print_status "Getting stack outputs..."
    
    LOAD_BALANCER_DNS=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
        --output text)
    
    S3_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`MediaBucketName`].OutputValue' \
        --output text)
    
    VPC_ID=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`VPCId`].OutputValue' \
        --output text)
    
    print_status "Load Balancer DNS: $LOAD_BALANCER_DNS"
    print_status "S3 Bucket: $S3_BUCKET"
    print_status "VPC ID: $VPC_ID"
}

# Configure S3 bucket CORS
configure_s3_cors() {
    print_status "Configuring S3 bucket CORS..."
    
    aws s3api put-bucket-cors \
        --bucket $S3_BUCKET \
        --cors-configuration '{
            "CORSRules": [
                {
                    "AllowedHeaders": ["*"],
                    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
                    "AllowedOrigins": ["*"],
                    "ExposeHeaders": ["ETag"],
                    "MaxAgeSeconds": 3000
                }
            ]
        }'
    
    print_status "S3 CORS configuration completed"
}

# Create deployment package
create_deployment_package() {
    print_status "Creating deployment package..."
    
    # Create a zip file of the application
    zip -r unievent-app.zip src/ public/ package.json package-lock.json .env.example
    
    print_status "Deployment package created: unievent-app.zip"
}

# Upload application to S3
upload_to_s3() {
    print_status "Uploading application to S3..."
    
    aws s3 cp unievent-app.zip s3://$S3_BUCKET/deployment/
    
    print_status "Application uploaded to S3"
}

# Update environment file
update_env_file() {
    print_status "Updating environment file..."
    
    cat > .env << EOF
TICKETMASTER_API_KEY=your_ticketmaster_api_key_here
AWS_REGION=$REGION
S3_BUCKET_NAME=$S3_BUCKET
PORT=3000
NODE_ENV=production
LOAD_BALANCER_DNS=$LOAD_BALANCER_DNS
EOF
    
    print_warning "Please update TICKETMASTER_API_KEY in .env file with your actual API key"
}

# Display deployment summary
display_summary() {
    print_status "=== DEPLOYMENT SUMMARY ==="
    echo "Stack Name: $STACK_NAME"
    echo "Region: $REGION"
    echo "Environment: $ENVIRONMENT"
    echo "Load Balancer DNS: $LOAD_BALANCER_DNS"
    echo "S3 Bucket: $S3_BUCKET"
    echo "VPC ID: $VPC_ID"
    echo ""
    echo "Application URL: http://$LOAD_BALANCER_DNS"
    echo ""
    print_warning "Next steps:"
    echo "1. Update your .env file with the Ticketmaster API key"
    echo "2. Push your code to GitHub repository"
    echo "3. Test the application at http://$LOAD_BALANCER_DNS"
    echo "4. Monitor the deployment using AWS CloudWatch"
    echo ""
    print_warning "To clean up resources when done:"
    echo "aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION"
}

# Main deployment function
main() {
    print_status "Starting UniEvent AWS deployment..."
    
    check_aws_cli
    check_aws_credentials
    validate_template
    
    # Check if stack already exists
    if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION &> /dev/null; then
        print_warning "Stack $STACK_NAME already exists. Updating..."
        deploy_stack
    else
        print_status "Creating new stack $STACK_NAME..."
        deploy_stack
        wait_for_stack
    fi
    
    get_stack_outputs
    configure_s3_cors
    create_deployment_package
    upload_to_s3
    update_env_file
    display_summary
    
    print_status "Deployment completed successfully!"
}

# Handle script interruption
trap 'print_error "Deployment interrupted"; exit 1' INT

# Run main function
main "$@"
