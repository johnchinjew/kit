# Kit

Just a to-do list.

## Development

```
npm install
npm run dev
```

Reminders

- Always run `npm run check` to verify changes.
- Schema and security rule changes must remain compatible with older clients and queued offline writes.
- When changing domain, logo, privacy policy URL, or other branding details, remember to update
  [Google OAuth branding](https://console.cloud.google.com/auth/branding?project=kit-tasks) accordingly.

## Architecture

```
Client -> Cloudflare -> Firebase Hosting
   |
   +----> Firebase Auth
   |
   +----> Firestore
```

Supported feature set:

- Schedule list: all incomplete tasks and 1 year of occurrences for all repeating tasks, ordered by date.
- Open list: all incomplete tasks, ordered by date. Each repeating task appears only once on its next occurrence date.
- Completed list: all completed tasks, ordered by completion date. Tasks are deleted 400 days after completion.
- Task: title, details, date. Can be completed, reopened, and deleted. A task created from a repeating task is fully
  independent of that repeating task. Every task must have a date (up to 1 year away).
- Repeating task: title, details, next occurrence date, and repetition interval (up to 1 year away). Cannot be
  completed. Can be deleted. Open any occurrence to edit the same repeating task. Every occurrence dated today or
  earlier becomes a separate incomplete task.
- Persistence: Changes are synced in real time across devices. Offline changes are saved and synced when online.
  Non-conflicting mutations are combined whenever possible. Conflicting mutations use chronological last-edit-wins.

Key decisions:

- A single Firestore document per user to keep things economical.
- Clients stay subscribed to the document to receive updates from other devices in real time.
- Writes are modeled as separate operations per conflict domain: create task, set task title, etc.
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
