# Security Policy — LockOn ServiceOS website

The public website contains only static presentation files. It must never contain application credentials, Google OAuth secrets, API tokens, repair records, customer data or internal service data.

## Reporting a problem

Do not publish secrets or personal data in a public issue. Send a private report to **bartekmotloch@wp.pl** with the affected page, reproduction steps and impact.

## Deployment

The production site is deployed from the `main` branch by GitHub Actions. Workflow actions are pinned to immutable commit SHAs. Application data and authenticated customer/service views must use a dedicated authenticated backend before they are enabled.
