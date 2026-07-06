# Summary

Describe what this PR changes and why.

# Key changes

List the files or areas touched and what changed in each.

# Local gate

Every PR must pass the local gate before it opens. Paste the output below.

```bash
npm test
npm run validate:naming-policy
python3 scripts/gen-manifests.py --strict-validate --dry-run
npm run check:headers -- https://sense360store.github.io/WebFlash/
```

```text
Paste the gate output here.
```

# What stays gated

State explicitly that the blocking gates are unchanged: provenance, release channel acknowledgement, signature and checksum verification at the install gate, manifest freshness, the service worker update gate, the TRIAC block, and the REQUIRED_CONFIGS allowlist. If the PR touches provenance, the manifest, or the install gate, also fill the reviewer checklist from docs/firmware-provenance.md here.
