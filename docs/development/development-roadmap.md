# Development Roadmap

## Foundation

Completed: React/FastAPI structure, design foundation, PostgreSQL/SQLAlchemy, Alembic baseline, Docker Compose, health endpoints, logging and tests.

## AWS inventory

Completed: read-only account and region configuration, Boto3 credential-chain use, modular resource collectors, pagination, safe partial results, and JSON CLI snapshots. Inventory persistence remains out of scope.

## Security engine

Completed: typed findings and modular rules for SSH/RDP exposure, unencrypted EBS, unsafe S3 access, and missing EC2 governance tags. Rules consume normalized inventory only.

## Risk scoring

Completed: deterministic 0–100 posture score and severity counts. The score applies CRITICAL/HIGH/MEDIUM/LOW penalties of 40/25/12/5 per evaluated resource, capped at 100 penalty points per resource.

## Cost intelligence

Completed: average/maximum EC2 CPU metric collection, opt-in Cost Explorer month-to-date/prior-period spend and service breakdown, and modular cost waste rules. Dollar savings are not inferred from utilization or unattached storage.

## API integration

Replace demonstration dashboard values with typed backend data after inventory and findings exist.

## Remediation workflow

Add review, assignment, status tracking, approval, and least-privilege remediation actions. No automatic destructive actions.

## Reporting

Add report generation, exports, scan history, and comparison.

## Testing and CI/CD

Add backend integration tests, Moto AWS tests, frontend component tests, Docker smoke tests, and GitHub Actions.
