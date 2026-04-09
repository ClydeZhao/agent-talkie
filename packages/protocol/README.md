# @agent-talkie/protocol

Shared message envelope validation and protocol helpers.

## Relay routing

Relay route keys use the prefix `talkie:v1` with colon-separated segments. Control traffic uses keys shaped like `talkie:v1:control:` followed by `space_id`. Conversation traffic uses `talkie:v1:conversation:` followed by `space_id` and `thread_id`.

Control vs conversation is determined by envelope.type (D-06-transport).
