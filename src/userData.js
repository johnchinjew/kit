import { arrayUnion } from "firebase/firestore";

export function createTaskWrite(title, id = crypto.randomUUID()) {
  return {
    version: 1,
    tasks: arrayUnion({ id, title }),
  };
}

export function decodeUserData(snapshot) {
  if (!snapshot.exists()) {
    return { tasks: [] };
  }

  const data = snapshot.data();
  const version = decodeVersion(data);

  if (version !== 1) {
    throw new Error(`Unsupported user data version: ${version}`);
  }

  return {
    tasks: decodeTasks(data),
  };
}

function decodeVersion(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid user data document");
  }

  if (!Object.prototype.hasOwnProperty.call(data, "version")) {
    throw new Error("User data is missing version");
  }

  if (!Number.isInteger(data.version)) {
    throw new Error("User data version must be an integer");
  }

  return data.version;
}

function decodeTasks(data) {
  if (!Array.isArray(data?.tasks)) {
    throw new Error("User data tasks is not an array");
  }

  return data.tasks.map((task) => {
    if (!isTask(task)) {
      throw new Error("User data contains an invalid task");
    }

    return { id: task.id, title: task.title };
  });
}

function isTask(task) {
  return Boolean(
    task &&
    typeof task.id === "string" &&
    typeof task.title === "string",
  );
}
