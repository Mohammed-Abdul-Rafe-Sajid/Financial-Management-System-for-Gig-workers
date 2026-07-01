# events/

Empty by design. Per `API_CONTRACT.md` §9, the Kafka event topic table
(`session.created`, `session.enriched`, `prediction.requested`,
`iss.recompute.requested`) lists no producer or consumer role for
`user-service`. Other services fetch user data via `GET /api/v1/users/:id`
(internal) rather than by subscribing to user-service events.

If a future revision of API_CONTRACT.md adds a `user.updated` or similar
event, its producer/consumer code belongs in this folder.
