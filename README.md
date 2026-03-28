# UniEvent - University Event Management System on AWS

## Overview

UniEvent is a scalable, cloud-hosted web application built on AWS that allows students to browse university events, register for activities, and upload event-related media. The system automatically fetches event data from the Ticketmaster API and displays them as official university events.

## Architecture

### AWS Services Used
- **IAM**: Identity and Access Management for secure resource access
- **VPC**: Virtual Private Cloud for network isolation
- **EC2**: Elastic Compute Cloud for application hosting
- **S3**: Simple Storage Service for media storage
- **ELB**: Elastic Load Balancing for high availability

### System Design
```
Internet
    ↓
Elastic Load Balancer
    ↓
Auto Scaling Group (EC2 Instances in Private Subnets)
    ↓
Application Server (Node.js/Express)
    ↓
├── Ticketmaster API Integration
    ├── S3 Bucket (Event Media)
    └── In-Memory Cache (Event Data)
```

## Features

1. **Event Browsing**: Students can browse events fetched from Ticketmaster API
2. **Event Registration**: Users can register for events
3. **Media Upload**: Event posters and images stored securely in S3
4. **High Availability**: System remains available during peak periods
5. **Fault Tolerance**: Continues operating even if one EC2 instance fails
6. **Security**: All resources properly secured with IAM policies

## Project Structure

```
Assignment1_AWS_CE/
├── README.md
├── src/
│   ├── app.js                 # Main application file
│   ├── routes/
│   │   ├── events.js          # Event management routes
│   │   └── uploads.js         # File upload routes
│   ├── services/
│   │   ├── ticketmaster.js    # API integration service
│   │   └── s3Service.js       # S3 storage service
│   ├── middleware/
│   │   └── auth.js            # Authentication middleware
│   └── views/
│       ├── index.ejs          # Home page
│       ├── events.ejs         # Events listing page
│       └── event-detail.ejs   # Event details page
├── public/
│   ├── css/
│   │   └── style.css          # Stylesheets
│   ├── js/
│   │   └── main.js            # Client-side JavaScript
│   └── images/                # Static images
├── aws/
│   ├── infrastructure.yaml    # CloudFormation template
│   ├── deploy.sh              # Deployment script
│   └── iam-policies.json      # IAM policies
├── package.json
├── .env.example
└── .gitignore
```

## Prerequisites

- AWS Account with appropriate permissions
- Node.js 16+ installed
- AWS CLI configured
- Ticketmaster API key (free registration required)

## Installation and Setup

### 1. Clone the Repository
```bash
git clone https://github.com/[your-username]/Assignment1_AWS_CE.git
cd Assignment1_AWS_CE
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
```bash
cp .env.example .env
```

Edit `.env` file with your configuration:
```
TICKETMASTER_API_KEY=your_ticketmaster_api_key
AWS_REGION=us-east-1
S3_BUCKET_NAME=unievent-media-bucket
PORT=3000
```

### 4. AWS Infrastructure Setup

#### 4.1 Create S3 Bucket
```bash
aws s3 mb s3://unievent-media-bucket --region us-east-1
aws s3api put-bucket-cors --bucket unievent-media-bucket --cors-configuration file://aws/s3-cors.json
```

#### 4.2 Deploy Infrastructure
```bash
chmod +x aws/deploy.sh
./aws/deploy.sh
```

### 5. Run the Application
```bash
npm start
```

The application will be available at `http://localhost:3000`

## API Integration Details

### Ticketmaster API
- **Endpoint**: `https://app.ticketmaster.com/discovery/v2/events.json`
- **Authentication**: API Key
- **Rate Limit**: 5,000 requests per day (free tier)
- **Data Retrieved**: Event name, date, venue, description, images

### API Response Structure
```json
{
  "_embedded": {
    "events": [
      {
        "name": "Event Name",
        "dates": {
          "start": {
            "localDate": "2024-03-15",
            "localTime": "19:00:00"
          }
        },
        "_embedded": {
          "venues": [
            {
              "name": "Venue Name",
              "city": {
                "name": "City"
              },
              "address": {
                "line1": "Address"
              }
            }
          ]
        },
        "images": [
          {
            "url": "https://example.com/image.jpg",
            "ratio": "16_9",
            "width": 1024,
            "height": 576
          }
        ],
        "description": "Event description",
        "url": "https://ticketmaster.com/event/123"
      }
    ]
  }
}
```

## AWS Architecture Details

### VPC Configuration
- **CIDR Block**: 10.0.0.0/16
- **Public Subnets**: 2 (for load balancer)
- **Private Subnets**: 2 (for EC2 instances)
- **Availability Zones**: 2 (for high availability)

### EC2 Configuration
- **Instance Type**: t3.micro (for cost efficiency)
- **AMI**: Amazon Linux 2
- **Auto Scaling**: Min 2, Max 6 instances
- **Security Group**: HTTP (80), HTTPS (443), Custom (3000)

### S3 Configuration
- **Bucket Policy**: Restricted access
- **CORS**: Enabled for web application
- **Versioning**: Enabled
- **Encryption**: SSE-S3

### IAM Roles and Policies
- **EC2 Instance Role**: S3 access, CloudWatch logs
- **Lambda Role** (if applicable): API execution permissions

## Security Considerations

1. **Network Security**: Private subnets for application servers
2. **Access Control**: IAM least privilege principle
3. **Data Encryption**: S3 encryption in transit and at rest
4. **API Security**: Environment variables for API keys
5. **Input Validation**: Sanitize all user inputs

## Monitoring and Logging

- **CloudWatch**: Application logs and metrics
- **Health Checks**: ELB health monitoring
- **Auto Scaling**: Automatic instance replacement
- **S3 Access Logs**: File access tracking

## Cost Optimization

- **EC2**: Spot instances for non-critical workloads
- **S3**: Standard storage class with lifecycle policies
- **Data Transfer**: Minimize cross-AZ traffic
- **API Calls**: Implement caching to reduce API requests

## Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Load Testing
```bash
npm run test:load
```

## Deployment Process

1. **Code Commit**: Push to GitHub repository
2. **Build**: Application builds and tests
3. **Deploy**: Infrastructure updates and application deployment
4. **Verify**: Health checks and smoke tests

## Troubleshooting

### Common Issues

1. **API Rate Limit**: Implement caching and request throttling
2. **S3 Access**: Check IAM permissions and bucket policies
3. **Load Balancer Health**: Verify security group rules
4. **Database Connection**: Check network connectivity

### Monitoring Commands
```bash
# Check EC2 instance status
aws ec2 describe-instances --filters Name=tag:Name,Values=UniEvent-Instance

# Check S3 bucket contents
aws s3 ls s3://unievent-media-bucket

# Check load balancer health
aws elb describe-instance-health --load-balancer-name unievent-elb
```

## Future Enhancements

1. **Database Integration**: PostgreSQL for persistent storage
2. **User Authentication**: Cognito integration
3. **CDN**: CloudFront for static content delivery
4. **Caching**: Redis for improved performance
5. **Microservices**: Break down into smaller services

## Viva Preparation

### Key Points to Demonstrate

1. **Architecture Design**: Explain AWS service choices and their roles
2. **Scalability**: Show auto-scaling configuration and load testing
3. **Security**: Demonstrate IAM policies and security groups
4. **API Integration**: Show Ticketmaster API integration
5. **Fault Tolerance**: Explain high availability design
6. **Cost Management**: Discuss cost optimization strategies

### Demo Commands
```bash
# Show infrastructure
aws cloudformation describe-stacks --stack-name UniEvent-Stack

# Show running instances
aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,State.Name,PublicIpAddress]'

# Show application logs
aws logs tail /aws/ec2/UniEvent-App --follow
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

For any questions or issues, please contact [your-email@example.com]

---

**Note**: This project was created as part of the Cloud Computing course assignment. All AWS resources should be properly cleaned up after use to avoid unnecessary charges.
