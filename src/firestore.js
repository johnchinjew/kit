import { deleteField, setDoc as firebaseSetDoc } from "firebase/firestore";

function translate(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a Firestore value marker or nested patch");
  }
  if (Object.hasOwn(value, "$op")) {
    if (value.$op === "delete" && Object.keys(value).length === 1) {
      return deleteField();
    }
    if (
      value.$op === "value" &&
      Object.hasOwn(value, "value") &&
      Object.keys(value).length === 2
    ) {
      return value.value;
    }
    throw new Error("Invalid Firestore field operation");
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, translate(child)]),
  );
}

export function setDoc(reference, write) {
  if (
    typeof write.merge !== "boolean" ||
    write.patch === null ||
    typeof write.patch !== "object" ||
    Array.isArray(write.patch) ||
    Object.hasOwn(write.patch, "$op")
  ) {
    throw new Error("Invalid Firestore write");
  }
  return firebaseSetDoc(reference, translate(write.patch), { merge: write.merge });
}
