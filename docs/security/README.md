# AWS inventory credentials and permissions

## Read-only IAM policy

Attach [iam-readonly-policy.json](./iam-readonly-policy.json) to a dedicated inventory identity or role. In addition to resource inspection, the read-only policy allows S3 bucket and RDS instance tag reads required to evaluate cost allocation tags. CloudWatch and Cost Explorer permissions allow the Phase 3 read-only metric and spend collectors.

The policy uses `"Resource": "*"` because the listed `Describe`, `List`, and bucket-inspection actions do not support useful resource-level scoping consistently. Apply account and organizational boundaries through the AWS role trust relationship, permission boundaries, and deployment controls where available.

## Credential configuration

The backend uses Boto3's standard credential chain. Supported environment variables include:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_DEFAULT_REGION`
- `AWS_PROFILE`
- `AWS_REGIONS` (CloudSentry setting: comma-separated regions to inventory)

Do not set both long-lived credentials and a profile unless the precedence is intentional. Prefer AWS IAM roles, IAM Identity Center/SSO, or another short-lived credential provider in deployed environments. Never use AWS root credentials, put credentials in the frontend, or commit a real `.env` file. `.env.example` contains blank credential placeholders only.

The inventory runner does not create, modify, stop, or delete AWS resources. It uses `Describe`, `List`, `Get` and read-only Cost/CloudWatch APIs only. Per-service permission errors are included in the output snapshot while other collectors continue.

## Security evaluation

Run `python -m app.integrations.aws.cli --scan-report --output report.json` to evaluate the normalized snapshot. EC2 governance tags default to `Environment` and `Owner`; override them with `--required-tags Environment,Owner`. Rules do not make AWS API calls. When S3 metadata access is denied, the affected fields are marked unavailable rather than treated as absent configuration.
