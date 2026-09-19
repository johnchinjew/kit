# Kit

Just a to-do list.

## Architecture

The persistence architecture supports offline writes, intuitive conflict resolution, and real-time sync across devices.

- Use a single per-user Firestore document to keep things economical.
- Clients stay subscribed to the document to receive updates from other devices in real time.
- Keep a schema version on the document in case we need to make breaking changes one day.
- Model writes as separate operations per conflict domain: create task, set task title, etc.
- Resources such as tasks need a UUID to avoid concurrent creation collisions.
- Resources such as task titles need an edit timestamp to enable chronological last-edit-wins.
- Use Firestore Security Rules to ensure edits for resources such as task titles are only accepted if the incoming
  timestamp is newer than the existing persisted timestamp for that resource. Also reject the edit if the incoming
  timestamp is too far in the future. Relying on clients to report time accurately is acceptable here.
- Use Firestore's persistent local cache to queue offline writes. When the client is online, queued edits are only
  accepted if they are the chronologically latest edit.
- Use Firestore Security Rules to ensure the resource exists on the server for edits and deletes, and, the UUID is
  absent for creates. Deletes remove resources without any tombstone mechanism.
