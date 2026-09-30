# Kit

Just a to-do list.

## Features

- Schedule view: all non-completed tasks, including projected occurrences of repeating tasks, ordered by date.
- Completed view: all completed tasks, ordered by completion date. Tasks are deleted 1 year after completion.
- Task: title, details, date. Can be completed and restored. Can be converted into a repeating task by setting a
  repetition schedule. May be a materialized occurrence of a repeating task in which case it is fully independent of the
  repeating task. Every task must have a date (up to 1 year away).
- Repeating task: title, details, repetition schedule (next date and interval up to 1 year away). Cannot be completed.
  Can be deleted. Can be converted into a task by removing the repetition schedule (what would've been the next date
  would then be used as the task's date). Open any projected occurrence of a repeating task to edit the same canonical
  repeating task. Every unmaterialized occurrence dated today or earlier becomes a separate incomplete task.
- Persistence: Changes are synced in real time across devices. Offline changes are saved and synced when online.
  Concurrent changes are merged whenever possible. Conflicting edits use chronological last-edit-wins.

## Architecture

```
Client -> Cloudflare -> Firebase Hosting
   |
   +----> Firebase Auth
   |
   +----> Firestore
```

- A single Firestore document per user to keep things economical.
- Clients stay subscribed to the document to receive updates from other devices in real time.
- Model writes as separate operations per conflict domain: create task, set task title, etc.
- Resources such as tasks have a UUID to avoid concurrent creation collisions.
- Resources such as task titles need an edit timestamp to enable chronological last-edit-wins.
- Use Firestore Security Rules to ensure edits for resources such as task titles are only accepted if the incoming
  timestamp is newer than the existing persisted timestamp for that resource. Also reject the edit if the incoming
  timestamp is too far in the future. Relying on clients to report time accurately is acceptable here.
- Use Firestore's persistent local cache to queue offline writes. When the client is online, queued edits are only
  accepted if they are the chronologically latest edit.
- Use Firestore Security Rules to ensure the resource exists on the server for edits and deletes and that the UUID is
  absent for creates. Deletes remove resources without any tombstone mechanism.
- Treat the document shape as a long-lived client/server protocol. Prefer additive schema evolution. Readers must remain
  compatible with every historic schema shape that still exists and every schema shape that clients can still write.
- If a breaking change (such as renaming a field or enforcing a new invariant) is required: release compatible clients,
  wait as long as practical, then migrate existing data and begin enforcing the new invariant. Breaking changes carry
  unavoidable risks: queued writes may be rejected, old clients may stop working correctly, old clients may reintroduce
  legacy data that conflicts with the new model, etc.
