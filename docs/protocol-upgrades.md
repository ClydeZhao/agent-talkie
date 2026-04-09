# Protocol upgrades

The wire envelope uses integer **schema_version**. For v1, only **schema_version 1** is defined and supported; senders and receivers must agree on this version until a newer schema is published and adapters are upgraded.

Unsupported versions must be rejected with a structured error (`SCHEMA_VERSION_UNSUPPORTED`) that includes supported version bounds and a stable **upgrade_doc_url** pointing at this document (`docs/protocol-upgrades.md`).

## Payload size

To mitigate denial-of-service from oversized JSON, implementations should enforce a default maximum inline envelope size of **256 KiB** per message at ingress unless a deployment-specific limit is documented and applied consistently.
