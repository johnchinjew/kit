import { onSnapshot, type DocumentData, type DocumentReference, type DocumentSnapshot } from "firebase/firestore";

/**
 * Holds the first delivery for up to 1.5 seconds while waiting for a snapshot from the server.
 * If no snapshot arrives from the server after 1.5 seconds, delivers the lastest snapshot received from the cache instead.
 * After the first delivery, all snapshots are delivered immediately.
 * Server snapshots are always delivered immediately.
 */
export function onSnapshotAfterWaitingForServer<AppModel = DocumentData, DbModel extends DocumentData = DocumentData>(
  docRef: DocumentReference<AppModel, DbModel>,
  onData: (snapshot: DocumentSnapshot<AppModel, DbModel>) => void,
  onError: (error: Error) => void,
): () => void {
  let waitingForServer = true;
  let snapshotFromCache: DocumentSnapshot<AppModel, DbModel> | undefined;

  const timeout = setTimeout(() => {
    waitingForServer = false;
    if (snapshotFromCache) {
      onData(snapshotFromCache);
    }
  }, 1500);

  const unsubscribe = onSnapshot(docRef, { includeMetadataChanges: true }, (snapshot) => {
    if (waitingForServer && snapshot.metadata.fromCache) {
      snapshotFromCache = snapshot;
      return;
    }
    waitingForServer = false;
    clearTimeout(timeout);
    onData(snapshot);
  }, (error) => {
    clearTimeout(timeout);
    onError(error);
  });

  return () => {
    clearTimeout(timeout);
    unsubscribe();
  };
}
