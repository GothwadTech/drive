# Security Policy

## Supported Versions
Only the latest released major version of TG Cloud Drive is supported for security updates.

| Version | Supported |
| --- | --- |
| 1.x | Yes |
| < 1.0 | No |

## Reporting a Vulnerability
We take the security of TG Cloud Drive very seriously. Because the client is decentralized and Zero-Knowledge (storing all user session hashes and decryption keys locally within the client browser's IndexedDB and your private metadata DB), vulnerabilities are typically confined to:
1. Client-side XSS vectors.
2. In-transit leakage of metadata database credentials.

If you discover a security vulnerability, please do **not** open a public issue. Instead, report it privately to the maintainer.

Once reported, we will:
* Acknowledge the report within 48 hours.
* Provide an estimate of the time required to address the vulnerability.
* Notify you when a patch is merged and released.
