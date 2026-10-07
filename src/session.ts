import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { createSignal, onCleanup } from "solid-js";

export type User = { id: string; photoUrl: string | null; };

export type Session =
  | CheckingAuth
  | SigningIn
  | SignedIn
  | SigningOut
  | SignedOut;

export type CheckingAuth = { status: "CheckingAuth"; };
export type SigningIn = { status: "SigningIn"; };
export type SignedIn = { status: "SignedIn"; user: User; };
export type SigningOut = { status: "SigningOut"; user: User; };
export type SignedOut = { status: "SignedOut"; };

export function createSession(showNotice: (message: string) => void) {
  const [session, setSession] = createSignal<Session>({ status: "CheckingAuth" });

  getRedirectResult(getAuth()).catch((error) => {
    showNotice(signInErrorMessage(error));
  });

  const unsubscribe = onAuthStateChanged(getAuth(), (user) => {
    setSession(
      user
        ? { status: "SignedIn", user: { id: user.uid, photoUrl: user.photoURL } }
        : { status: "SignedOut" },
    );
  });

  onCleanup(unsubscribe);

  async function signIn() {
    if (session().status !== "SignedOut") return;
    setSession({ status: "SigningIn" });
    try {
      const provider = new GoogleAuthProvider();
      // Prompt for account selection to support switching user
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithRedirect(getAuth(), provider);
    } catch (error) {
      if (session().status !== "SigningIn") return;
      setSession({ status: "SignedOut" });
      showNotice(signInErrorMessage(error));
    }
  }

  async function signOut() {
    const current = session();
    if (current.status !== "SignedIn") return;
    setSession({ status: "SigningOut", user: current.user });
    try {
      await firebaseSignOut(getAuth());
    } catch (error) {
      const pending = session();
      if (pending.status !== "SigningOut") return;
      setSession({ status: "SignedIn", user: pending.user });
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
