# Security Model

## Credentials

Use AWS environment credentials, shared credentials, SSO, or runtime IAM roles through the standard Boto3 credential chain. Root credentials are prohibited. The frontend never receives credentials.

## Permissions

Initial AWS access must be read-only. IAM actions should be audited and scoped to required inventory APIs. Future remediation requires separate elevated permissions and explicit approval.

## Secrets

Real secrets belong only in environment-specific secret stores or local ignored `.env` files. `.env.example` contains placeholders only.

## Logging

Logs must not include credentials, secret values, authorization headers, or raw connection strings. AWS account identifiers may be logged only when required and protected as operational metadata.

## Boundaries

The HTTP layer validates input and maps expected errors. AWS SDK access is isolated from domain logic. Database credentials are server-side. Automatic destructive AWS operations are outside Phase 0 scope.

## Security rule evaluation

The Phase 2 rules evaluate only normalized inventory resources and make no Boto3/AWS calls. Findings describe rule matches; they do not remediate resources. The current score subtracts severity penalties (CRITICAL 40, HIGH 25, MEDIUM 12, LOW 5) averaged over evaluated EC2, SecurityGroup, EBS, and S3 resources, with a 0–100 bound. This is a deterministic posture indicator, not an AWS service guarantee.

## FinOps telemetry

The Phase 3 collector reads CloudWatch `CPUUtilization` metrics and calls Cost Explorer only when explicitly enabled. Low CPU is an investigation signal, not proof of idle capacity; missing metric data is not treated as zero. Cost rules consume normalized inventory and metric models and do not call AWS. They report optimization opportunities without dollar savings estimates; Cost Explorer amounts are reported only as observed billing data.
