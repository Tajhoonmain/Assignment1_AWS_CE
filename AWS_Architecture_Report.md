# Deployment of a Scalable University Event Management System on AWS
## Cloud Architecture Justification Report

### 1. Architectural Overview
The UniEvent system is designed using a multi-tier cloud architecture on AWS. It prioritizes high availability, security, fault tolerance, and automated scalability. By adopting core AWS services (VPC, EC2, Application Load Balancing, Auto Scaling, and S3), the platform easily handles both steady-state traffic and sudden spikes during society recruitment and major university festivals.

The application automatically provisions and maintains the backend, which periodically consumes structured JSON data from the **Ticketmaster Open API** to list genuine events to its students.

### 2. Service-by-Service Justification

#### 2.1 Virtual Private Cloud (VPC) & Networking
The foundation of the architecture is an isolated Virtual Private Cloud (VPC) consisting of:
- **Public Subnets**: Used strictly for the Application Load Balancer and NAT Gateway. Resources here are internet-facing.
- **Private Subnets**: Hosting the EC2 Application instances. This adds a critical security layer by ensuring no EC2 instance can be reached directly from the internet.
- **NAT Gateway**: Placed in the public subnet, allowing EC2 instances in the private subnet to initiate outbound traffic securely for fetching Open API data (Ticketmaster) and downloading dependencies, without accepting inbound traffic.

#### 2.2 Elastic Compute Cloud (EC2) & Auto Scaling
- **EC2 Instances with UserData**: The application code is hosted on Amazon Linux 2 EC2 instances, bootstrapped via a Launch Template. Upon launch, a `UserData` script automatically updates packages, installs Node.js, configures parameters, and initializes the App utilizing PM2 process manager to ensure robust application operation.
- **Auto Scaling Group (ASG)**: The Auto Scaling Group dynamically handles varying network requests. Configured with a minimum of 2 instances in separate Availability Zones, it ensures high availability. It scales out (up to 6) when CPU Utilization exceeds 70% and scales in when usage drops, avoiding over-provisioning out-of-peak periods.

#### 2.3 Elastic Load Balancing (ALB)
- **Application Load Balancer**: Positioned to balance incoming HTTP/HTTPS requests evenly across instances located in the private subnets. The ALB actively conducts steady health checks (`/health` endpoint on port 3000) on attached EC2 capabilities. If an instance experiences an outage, it seamlessly halts forwarding user requests to the affected node, avoiding disruptive failures entirely.

#### 2.4 Simple Storage Service (S3)
- **Media and Document Storage**: A securely locked S3 bucket (`unievent-media-**`) handles all the event-associated imagery, posters, and uploads. Because EC2 instances must have permission to put and get objects without embedding sensitive AWS credentials into the source code, an **IAM Instance Role** handles the S3 access seamlessly.
- **S3 Security Posture**: Server-Side Encryption (SSE-S3) at rest is explicitly enforced. Direct public access to buckets is fully restricted (`BlockPublicAcls`, `BlockPublicPolicy`), meaning interactions only occur strictly through secure pathways.

#### 2.5 Identity & Access Management (IAM)
- Roles define specific bounded permissions to application resources ensuring **principle of least privilege**. The associated `EC2InstanceRole` permits purely `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, and `s3:ListBucket` limited completely to the target media bucket and no further.

### 3. API Integration: Ticketmaster Event Discovery
The Open API integration was designed choosing the **Ticketmaster Open API**. 
**Reasoning**: 
Ticketmaster grants access to high-quality metadata formatting (start times, venues, imagery via their `/discovery/v2/events` routes) perfect for University mapping without parsing complexity. The API interactions are designed asynchronously inside the Service tier (`src/services/ticketmaster.js`), utilizing caching (`node-cache`) locally to respect quota usage natively (throttling mitigation) whilst giving a near-instantaneous browsing experience to the student population natively on the UniEvent Webapp.

### 4. Resiliency & Disaster Preparedness
Should a specific Availability zone face challenges, or an explicit EC2 host fail:
1. The **ALB** registers prolonged health-check failure.
2. The ALB immediately ceases traffic shifting towards the failing unit.
3. The **Auto Scaling Group** registers an unhealthy threshold instance and instantly triggers termination and re-launches a fresh replacement to conform to the defined parameters (`MinSize: 2`). No manual developer administration is required. 

This robust combination delivers a fully managed, hands-off scaling process maintaining 100% uptime SLAs in production environments.
