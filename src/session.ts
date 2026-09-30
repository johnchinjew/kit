import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { createSignal, onCleanup } from "solid-js";

export type User = { photoUrl: string | null; };

export type Session =
  | CheckingAuth
  | SigningIn
  | SignedIn
  | SigningOut
  | SignedOut;

export type CheckingAuth = { status: "checking-auth"; };
export type SigningIn = { status: "signing-in"; };
export type SignedIn = { status: "signed-in"; user: User; };
export type SigningOut = { status: "signing-out"; user: User; };
export type SignedOut = { status: "signed-out"; };

export function createSession(showNotice: (message: string) => void) {
  const [session, setSession] = createSignal<Session>({ status: "checking-auth" });

  getRedirectResult(getAuth()).catch((error) => {
    showNotice(signInErrorMessage(error));
  });

  const unsubscribe = onAuthStateChanged(getAuth(), (user) => {
    setSession(
      user
        ? { status: "signed-in", user: { photoUrl: user.photoURL } }
        : { status: "signed-out" },
    );
  });

  onCleanup(unsubscribe);

  async function signIn() {
    if (session().status !== "signed-out") return;
    setSession({ status: "signing-in" });
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithRedirect(getAuth(), provider);
    } catch (error) {
      if (session().status !== "signing-in") return;
      setSession({ status: "signed-out" });
      showNotice(signInErrorMessage(error));
    }
  }

  async function signOut() {
    const current = session();
    if (current.status !== "signed-in") return;
    setSession({ status: "signing-out", user: current.user });
    try {
      await firebaseSignOut(getAuth());
    } catch (error) {
      const pending = session();
      if (pending.status !== "signing-out") return;
      setSession({ status: "signed-in", user: pending.user });
      showNotice(signOutErrorMessage(error));
    }
  }

  return { session, signIn, signOut };
}

function signInErrorMessage(error: unknown): string {
  switch (authErrorCode(error)) {
    case "auth/network-request-failed":
      return "Could not sign in. Check your connection and try again later.";
    case "auth/user-disabled":
      return "Account has been disabled.";
    default:
      return "Could not sign in. Please try again later.";
  }
}

function signOutErrorMessage(error: unknown): string {
  switch (authErrorCode(error)) {
    case "auth/network-request-failed":
      return "Could not sign out. Check your connection and try again.";
    default:
      return "Could not sign out. Please try again.";
  }
}

function authErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "auth/unknown";
}
