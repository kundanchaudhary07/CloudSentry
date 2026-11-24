# CloudSentry

CloudSentry is a read-only AWS inventory, security-posture, and FinOps application. It collects AWS metadata, evaluates normalized inventory and metrics, persists scan results in PostgreSQL, and serves an operator dashboard.

## Architecture

- **Frontend:** React, TypeScript, Vite, React Router, Recharts, and Axios. The dashboard reads live data from `/api/v1`.
- **API:** FastAPI endpoints under `/api/v1` orchestrate inventory, security and cost evaluation, and PostgreSQL persistence.
- **AWS integrations:** Boto3 inventory, CloudWatch, and optional Cost Explorer collectors. The scanner does not create, modify, stop, or delete AWS resources.
- **Rules:** Security and cost rules evaluate normalized collector output and do not call AWS APIs.
- **Database:** PostgreSQL stores scans, resources, findings, and remediation history; Alembic migrations run when the backend container starts.
- **Infrastructure:** Docker Compose for local development; Terraform for the disposable, tagged sandbox in [`terraform/`](./terraform/).

The API currently has no authentication. Run it only in a trusted environment. Docker Compose binds published ports to `127.0.0.1`; do not expose the services publicly without adding appropriate access controls.

## Prerequisites

- Docker Desktop with Docker Compose
- AWS account and credentials only if running a real AWS scan
- Terraform 1.6+ only for the optional sandbox

## Start the application

From the repository root:

```powershell
docker compose up --build -d
docker compose ps
```

Services:

- Dashboard: <http://localhost:8080/dashboard>
- API docs: <http://localhost:8000/docs>
- Health: <http://localhost:8000/api/v1/health>

The backend waits for PostgreSQL, applies `alembic upgrade head`, then starts FastAPI. The frontend and backend have healthchecks; the backend and Nginx run as non-root users. The backend and frontend containers use a read-only root filesystem, dropped Linux capabilities, and `no-new-privileges`.

To stop the services:

```powershell
docker compose down
```

To remove the local database volume as well (this deletes local scan history):

```powershell
docker compose down -v
```

## AWS scan configuration

The scanner uses Boto3’s standard credential chain. No AWS credentials are included in the repository. For a containerized scan, provide temporary or least-privilege AWS credentials to the backend container through its environment, following your organization’s secret-management process. For local Python commands, configure an AWS profile or environment credentials in your shell.

The least-privilege read-only policy and environment variable reference are in [`docs/security/README.md`](./docs/security/README.md). Start with a sandbox account and use the read-only policy; Cost Explorer collection is optional.

## API endpoint summary

All endpoints are under `/api/v1`:

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/scans` | Run and persist an inventory/security/cost scan |
| `GET` | `/scans` | List scan history |
| `GET` | `/scans/{scan_id}` | Retrieve a scan and its summary |
| `GET` | `/findings` | Filter findings by scan, category, severity, status, resource type, or text |
| `GET` | `/findings/{finding_id}` | Retrieve a finding and its audit history |
| `PATCH` | `/findings/{finding_id}` | Update finding status/notes and append an audit record; does not remediate AWS |
| `GET` | `/inventory` | List normalized resources |
| `GET` | `/costs` | Retrieve cost findings and available Cost Explorer data |
| `GET` | `/dashboard` | Retrieve overview KPIs and recent scan data |
| `GET` | `/health` | Check API availability |

## Live sandbox demonstration

The optional Terraform configuration creates a small, disposable, tagged sandbox. It deliberately keeps risky controls safe: the instance has no public IP, SSH is closed unless an explicit single IPv4 `/32` is provided, the bucket blocks public access, and the unattached EBS volume is encrypted. The instance and volume omit `Owner` and `CostCenter` so the live scan can demonstrate tag findings; the unattached volume can demonstrate an optimization opportunity. Unsafe SSH/S3/unencrypted-volume rules remain covered by isolated tests, not by public live infrastructure.

1. Configure Terraform with credentials for an AWS account you control and review [`terraform/README.md`](./terraform/README.md).
2. Create and inspect the sandbox:

   ```powershell
   terraform -chdir=terraform init
   terraform -chdir=terraform plan -out sandbox.tfplan
   terraform -chdir=terraform apply sandbox.tfplan
   ```

3. Configure the backend with read-only credentials for that account and region, then open the dashboard and select **Run scan**. Only run a scan when credentials are configured; no AWS calls are needed to view the empty-state dashboard.
4. Inspect the inventory and the governance/cost-tag findings and unattached-volume opportunity. Update finding status and operator notes in the UI; this records PostgreSQL audit history and does not change AWS.
5. To resolve the tag findings, add `Owner` and `CostCenter` tags in the Terraform resource configuration, apply the reviewed change, and run another scan. Confirm the new scan reflects the updated inventory.
6. **Destroy the sandbox immediately after testing** and review the plan before confirming:

   ```powershell
   terraform -chdir=terraform destroy
   ```

Terraform resources are tagged `Project=CloudGuard-Sandbox`, `Environment=sandbox`, and `ManagedBy=Terraform`. The instance, volume, S3 bucket, and AWS data transfer may incur charges while they exist. Never run this configuration in a production account.

## Local development

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Frontend:

```powershell
cd frontend
npm ci
npm run dev
```

The frontend development server uses the configured Vite proxy to reach the API. See `.env.example` for environment variable names; keep actual credentials in a local, ignored `.env` file or an approved secret manager.

## Verification

Backend:

```powershell
cd backend
python -m pip install ruff
ruff check app tests
pytest
```

Frontend:

```powershell
cd frontend
npm ci
npm run lint
npm run build
```

Terraform and Checkov:

```powershell
terraform -chdir=terraform fmt -check -recursive
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform validate
checkov -d terraform/ --framework terraform
```

GitHub Actions runs backend lint/tests, frontend lint/build, Terraform validation/Checkov, and Docker image builds with Trivy checks that fail on `CRITICAL` findings.
