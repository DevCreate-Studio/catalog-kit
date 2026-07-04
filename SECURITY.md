# Security Policy

## Supported Versions

Only the latest minor release of `catalog-kit` is supported with security
fixes. Please upgrade to the latest version before reporting an issue.

| Version         | Supported          |
| --------------- | ------------------ |
| Latest minor    | :white_check_mark: |
| Older releases  | :x:                |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately by emailing **alex@spicydesign.ca** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce (a minimal repro is ideal)
- Any relevant logs, payloads, or `node scripts/probe.mjs --json` output

### What to expect

- **Acknowledgement within 72 hours** of your report.
- We will work with you to understand and validate the issue, and to agree on
  a fix timeline.
- We follow **90-day coordinated disclosure**: we ask that details stay
  private until a fix is released, or for 90 days from the initial report,
  whichever comes first. We'll credit you in the release notes unless you
  prefer to stay anonymous.

### Scope

This policy covers the `catalog-kit` npm package (`packages/catalog-client`)
and the `apps/web` reference application in this repository. It does not
cover the Shopify Global Catalog / UCP API itself — report issues with that
API directly to Shopify.
