# Security policy

## Supported versions

The current `0.1.x` line receives security fixes. Pre-release prototypes and untagged historical revisions are not supported.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through the repository's [GitHub Security advisory form](https://github.com/unique01082/svg-motion/security/advisories/new).

Do not open a public issue, discussion, or pull request for an undisclosed vulnerability. Include:

- affected package version and browser;
- a minimal SVG or reproduction that demonstrates the issue;
- whether the input used `trust: "sanitize"` or `trust: "trusted"`;
- observed network, DOM, style, animation, or information-disclosure impact;
- any proposed mitigation or relevant CSP configuration.

You can expect an acknowledgement within seven days. We will coordinate validation, remediation, release timing, and public disclosure through the private advisory.

## Security boundary

Sanitized mode is intended for untrusted SVG and removes active content, external resources, unsafe CSS, and external URL references. Trusted mode intentionally skips filtering and must only receive content controlled by the application. See the [README security section](./README.md#security-cors-and-csp) for the complete runtime boundary.
