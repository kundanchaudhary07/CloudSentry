# Disposable AWS Sandbox

This configuration creates one `t3.micro` EC2 instance without a public IP, a security group, one encrypted and unattached 1 GiB `gp3` volume, and one encrypted S3 bucket with all public-access blocks enabled. Every created resource is tagged:

- `Project = CloudGuard-Sandbox`
- `Environment = sandbox`
- `ManagedBy = Terraform`

The EC2 instance and EBS volume intentionally omit `Owner` and `CostCenter`, while retaining all required sandbox tags. This lets a read-only CloudSentry scan demonstrate the corresponding governance/cost-tag findings and the unattached-volume optimization finding.

## Safety constraints

- SSH ingress is disabled by default. To enable it, `ssh_allowed_cidr` accepts exactly one IPv4 `/32` address; broad ranges such as `0.0.0.0/0` are rejected.
- The instance has no public IP. The S3 bucket blocks public ACLs and policies and has default encryption enabled.
- The unattached EBS test volume is encrypted. The sandbox will therefore not produce `SG-001`, `S3-001`, or `EBS-001` findings through live collection. Those unsafe configurations should be verified with the existing isolated rule tests, not provisioned into a live account.
- The test bucket has versioning, a one-day object lifecycle, AWS-managed KMS encryption, and a restricted object-created notification to a tagged SNS topic with no subscriber. Checkov skips access logging and cross-region replication only for this empty disposable bucket; they would add resources without protecting production data or serving a test consumer.
- The empty test volume uses AWS-managed EBS encryption. Checkov skips its customer-managed-key preference because a dedicated KMS key adds a deletion delay and residual charges to an otherwise disposable volume.
- The EC2 instance has no IAM role because it does not call AWS APIs. This avoids granting an instance credential path it does not need.
- Detailed EC2 monitoring is enabled to satisfy the IaC security baseline and may add a small monitoring charge.
- The instance, volume, and bucket can incur AWS charges. Apply only in an account and region you control, and destroy the sandbox immediately after testing.
- Terraform uses the standard AWS credential chain. No credentials or secrets belong in `.tf` files or variable files committed to source control.

## Prerequisites

- Terraform 1.6 or newer
- AWS CLI credentials for an account you control, with permission to create and destroy the resources above
- A default VPC and at least one subnet in the selected region

Set credentials outside Terraform, for example by selecting a local AWS profile:

```powershell
$env:AWS_PROFILE = "your-sandbox-profile"
$env:AWS_DEFAULT_REGION = "us-east-1"
```

## Create and inspect

From the repository root:

```powershell
terraform -chdir=terraform init
terraform -chdir=terraform validate
terraform -chdir=terraform plan -out sandbox.tfplan
terraform -chdir=terraform apply sandbox.tfplan
terraform -chdir=terraform output
```

To allow SSH only from your current public IPv4 address, pass that single address with a `/32` mask. Omitting it leaves SSH closed:

```powershell
terraform -chdir=terraform plan -var="ssh_allowed_cidr=<YOUR_PUBLIC_IPV4>/32"
```

Never use a broad CIDR. The input validation rejects any SSH CIDR other than one IPv4 `/32`.

## CloudSentry scan

Configure the backend with read-only AWS credentials for the same account and region. Trigger a scan from the UI or use the API. Expected live findings include missing `Owner`/`CostCenter` tags and the unattached volume opportunity. The unsafe SSH, public-bucket, and unencrypted-volume rules are covered by isolated tests instead of live vulnerable resources.

## Cleanup

Destroy the sandbox when testing is complete:

```powershell
terraform -chdir=terraform destroy
```

Review the destroy plan and confirm it targets only the tagged CloudGuard sandbox resources. Terraform state files contain infrastructure metadata; keep them local and never commit them.

## IaC security check

```powershell
checkov -d terraform/ --framework terraform
```

No Checkov checks are suppressed for intentionally insecure infrastructure.
