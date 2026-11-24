# CloudSentry Architecture

## Overview

CloudSentry uses a modular monolith: one deployable FastAPI application and one React application. Modules are separated for future independent extraction but no microservices are used.

## Frontend

The frontend contains routed pages, reusable UI and layout components, a typed API client, design tokens, and isolated demonstration data.

## Backend

FastAPI owns the HTTP API. Configuration is environment-based. SQLAlchemy owns database sessions. AWS access is isolated in `app/integrations/aws`; domain services should remain independent from HTTP routes and AWS SDK details.

## API

The versioned API uses the `/api/v1` prefix and exposes:

- `GET /api/v1/health`
- `GET /api/v1/health/database`
- `POST`, `GET /api/v1/scans` and `GET /api/v1/scans/{scan_id}`
- `GET`, `PATCH /api/v1/findings` and `GET /api/v1/findings/{finding_id}`
- `GET /api/v1/inventory`, `/api/v1/costs`, and `/api/v1/dashboard`

Scan creation runs inventory collection and the security and cost evaluators, then persists
the normalized resources, findings, report summaries, and collection errors. Collector and
evaluation dependencies can be injected in tests. Listing inventory and cost data without a
`scan_id` uses the latest completed scan. Health responses are actual application and database
checks; no mock AWS endpoints are exposed.

## Database

PostgreSQL is provisioned in development through Docker Compose. SQLAlchemy uses a pooled synchronous engine and Alembic manages migrations. The first migration is a baseline and intentionally creates no domain tables.

The persistence migration adds `scans`, `resources`, `findings`, and `remediation_history`.
Resource/finding records are tied to a scan; remediation records are tied to a finding.
Finding status and notes updates are database-only and create an audit row in the same
transaction. The patch body may include an `actor` value; it defaults to `unknown` and is
operator-supplied metadata, not an authenticated identity.

## Security boundary

Frontend code receives no AWS credentials. AWS credentials are resolved only by the backend through the standard Boto3 credential chain or runtime IAM role. Scanning permissions and future remediation permissions will be separated.

The API currently has no authentication. Finding updates change only PostgreSQL state and
never call AWS remediation APIs.
