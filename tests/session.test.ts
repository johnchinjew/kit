import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import type { Auth, User } from "firebase/auth";
import { createRoot } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { createSession } from "../src/session";

vi.mock("firebase/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/auth")>()),
  getAuth: vi.fn(),
  getRedirectResult: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}));

describe("Session", () => {
  const auth = {} as Auth;
  let controller: ReturnType<typeof createSession>;
  let dispose: () => void;
  let changeAuth: (user: Pick<User, "uid" | "photoURL"> | null) => void;
  let resolveRedirect: (result: null) => void;
  let rejectRedirect: (reason: unknown) => void;
  let showNotice: Mock<(message: string) => void>;
  let unsubscribe: Mock<() => void>;

  beforeEach(() => {
    vi.resetAllMocks();
    showNotice = vi.fn();
    unsubscribe = vi.fn();
    vi.mocked(getAuth).mockReturnValue(auth);
    vi.mocked(getRedirectResult).mockReturnValue(
      new Promise<null>((resolve, reject) => {
        resolveRedirect = resolve;
        rejectRedirect = reject;
      }),
    );
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, callback) => {
      if (typeof callback !== "function") {
        throw new Error("Expected an auth state callback");
      }
      changeAuth = (user) => callback(user as User | null);
      return unsubscribe;
    });
    vi.mocked(signInWithRedirect).mockImplementation(
      () => new Promise<never>(() => {}),
    );
    vi.mocked(signOut).mockResolvedValue(undefined);
    createRoot((disposeRoot) => {
      dispose = disposeRoot;
      controller = createSession(showNotice);
    });
  });

  afterEach(() => dispose());

  describe("auth state", () => {
    it("checks authentication until the first auth event", () => {
      expect(controller.session()).toEqual({ status: "checking-auth" });
      expect(onAuthStateChanged).toHaveBeenCalledExactlyOnceWith(
        auth,
        expect.any(Function),
      );

      changeAuth(null);

      expect(controller.session()).toEqual({ status: "signed-out" });
      expect(showNotice).not.toHaveBeenCalled();
    });

    it.each(["photo.png", null])(
      "reads the authenticated user's photo URL: %s",
      (photoURL) => {
        changeAuth({ uid: "alice", photoURL });

        expect(controller.session()).toEqual({
          status: "signed-in",
          user: { id: "alice", photoUrl: photoURL },
        });
        expect(showNotice).not.toHaveBeenCalled();
      },
    );

    it("follows subsequent account changes and sign-out events", () => {
      changeAuth({ uid: "alice", photoURL: "first.png" });
      changeAuth({ uid: "bob", photoURL: "second.png" });
      expect(controller.session()).toEqual({
        status: "signed-in",
        user: { id: "bob", photoUrl: "second.png" },
      });

      changeAuth(null);
      expect(controller.session()).toEqual({ status: "signed-out" });
    });

    it.each(["signIn", "signOut"] as const)(
      "ignores %s before authentication is known",
      async (operation) => {
        await controller[operation]();

        expect(controller.session()).toEqual({ status: "checking-auth" });
        expect(signInWithRedirect).not.toHaveBeenCalled();
        expect(signOut).not.toHaveBeenCalled();
        expect(showNotice).not.toHaveBeenCalled();
      },
    );

    it("unsubscribes from auth changes when the root is disposed", () => {
      expect(unsubscribe).not.toHaveBeenCalled();

      dispose();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe("redirect result", () => {
    it("waits for an auth event even after the redirect check succeeds", async () => {
      expect(getRedirectResult).toHaveBeenCalledExactlyOnceWith(auth);

      resolveRedirect(null);
      await Promise.resolve();

      expect(controller.session()).toEqual({ status: "checking-auth" });
      expect(showNotice).not.toHaveBeenCalled();

      changeAuth(null);
      expect(controller.session()).toEqual({ status: "signed-out" });
    });

    it.each([
      [
        "auth/network-request-failed",
        "Could not sign in. Check your connection and try again later.",
      ],
      ["auth/user-disabled", "Account has been disabled."],
      ["auth/unknown", "Could not sign in. Please try again later."],
    ])("reports %s and continues observing authentication", async (code, message) => {
      rejectRedirect({ code });
      await Promise.resolve();

      expect(controller.session()).toEqual({ status: "checking-auth" });
      expect(showNotice).toHaveBeenCalledExactlyOnceWith(message);

      changeAuth({ uid: "alice", photoURL: "photo.png" });
      expect(controller.session()).toEqual({
        status: "signed-in",
        user: { id: "alice", photoUrl: "photo.png" },
      });
      expect(onAuthStateChanged).toHaveBeenCalledTimes(1);
    });

    it("preserves an authenticated session when a redirect error arrives late", async () => {
      changeAuth({ uid: "alice", photoURL: "photo.png" });

      rejectRedirect({ code: "auth/user-disabled" });
      await Promise.resolve();

      expect(controller.session()).toEqual({
        status: "signed-in",
        user: { id: "alice", photoUrl: "photo.png" },
      });
      expect(showNotice).toHaveBeenCalledExactlyOnceWith(
        "Account has been disabled.",
      );
    });
  });

  describe("sign-in", () => {
    it("starts Google redirect sign-in with account selection and waits for an auth event", () => {
      changeAuth(null);

      void controller.signIn();

      expect(controller.session()).toEqual({ status: "signing-in" });
      expect(signInWithRedirect).toHaveBeenCalledExactlyOnceWith(
        auth,
        expect.any(GoogleAuthProvider),
      );
      const provider = vi.mocked(signInWithRedirect).mock.calls[0]![1];
      expect(provider).toHaveProperty("customParameters", {
        prompt: "select_account",
      });

      changeAuth({ uid: "alice", photoURL: "photo.png" });
      expect(controller.session()).toEqual({
        status: "signed-in",
        user: { id: "alice", photoUrl: "photo.png" },
      });
      expect(showNotice).not.toHaveBeenCalled();
    });

    it("ignores duplicate sign-in requests and sign-out while redirecting", async () => {
      changeAuth(null);
      void controller.signIn();

      await controller.signIn();
      await controller.signOut();

      expect(controller.session()).toEqual({ status: "signing-in" });
      expect(signInWithRedirect).toHaveBeenCalledTimes(1);
      expect(signOut).not.toHaveBeenCalled();
      expect(showNotice).not.toHaveBeenCalled();
    });

    it("ignores sign-in when already authenticated", async () => {
      changeAuth({ uid: "alice", photoURL: null });

      await controller.signIn();

      expect(controller.session()).toEqual({
        status: "signed-in",
        user: { id: "alice", photoUrl: null },
      });
      expect(signInWithRedirect).not.toHaveBeenCalled();
      expect(showNotice).not.toHaveBeenCalled();
    });

    it.each([
      [
        "network failure",
        { code: "auth/network-request-failed" },
        "Could not sign in. Check your connection and try again later.",
      ],
      [
        "disabled account",
        { code: "auth/user-disabled" },
        "Account has been disabled.",
      ],
      [
        "unknown code",
        { code: "auth/unknown" },
        "Could not sign in. Please try again later.",
      ],
      [
        "missing code",
        new Error("Unexpected"),
        "Could not sign in. Please try again later.",
      ],
      [
        "non-string code",
        { code: 123 },
        "Could not sign in. Please try again later.",
      ],
      ["null rejection", null, "Could not sign in. Please try again later."],
      ["primitive rejection", "Unexpected", "Could not sign in. Please try again later."],
    ])("reports a %s and returns to signed out", async (_name, error, message) => {
      changeAuth(null);
      vi.mocked(signInWithRedirect).mockRejectedValueOnce(error);

      await controller.signIn();

      expect(controller.session()).toEqual({ status: "signed-out" });
      expect(showNotice).toHaveBeenCalledExactlyOnceWith(message);
    });

    it("allows retrying sign-in after a failure", async () => {
      changeAuth(null);
      vi.mocked(signInWithRedirect).mockRejectedValueOnce({
        code: "auth/network-request-failed",
      });

      await controller.signIn();
      expect(controller.session()).toEqual({ status: "signed-out" });

      void controller.signIn();

      expect(controller.session()).toEqual({ status: "signing-in" });
      expect(signInWithRedirect).toHaveBeenCalledTimes(2);
      expect(showNotice).toHaveBeenCalledTimes(1);
    });

    it.each([{ uid: "alice", photoURL: null }, null])(
      "ignores a late failure after an auth event: %j",
      async (user) => {
        changeAuth(null);
        let rejectOperation!: (reason: unknown) => void;
        vi.mocked(signInWithRedirect).mockReturnValueOnce(
          new Promise<never>((_resolve, reject) => {
            rejectOperation = reject;
          }),
        );
        const pending = controller.signIn();
        expect(controller.session()).toEqual({ status: "signing-in" });

        changeAuth(user);
        rejectOperation({ code: "auth/network-request-failed" });
        await pending;

        expect(controller.session()).toEqual(
          user
            ? { status: "signed-in", user: { id: user.uid, photoUrl: user.photoURL } }
            : { status: "signed-out" },
        );
        expect(showNotice).not.toHaveBeenCalled();
      },
    );
  });

  describe("sign-out", () => {
    it("keeps the user until an auth event confirms sign-out", async () => {
      changeAuth({ uid: "alice", photoURL: "photo.png" });

      const pending = controller.signOut();

      expect(controller.session()).toEqual({
        status: "signing-out",
        user: { id: "alice", photoUrl: "photo.png" },
      });
      expect(signOut).toHaveBeenCalledExactlyOnceWith(auth);

      await pending;
      expect(controller.session()).toEqual({
        status: "signing-out",
        user: { id: "alice", photoUrl: "photo.png" },
      });

      changeAuth(null);
      expect(controller.session()).toEqual({ status: "signed-out" });
      expect(showNotice).not.toHaveBeenCalled();
    });

    it("ignores duplicate sign-out requests and sign-in while sign-out is pending", async () => {
      changeAuth({ uid: "alice", photoURL: null });
      let resolveOperation!: () => void;
      vi.mocked(signOut).mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveOperation = resolve;
        }),
      );
      const pending = controller.signOut();

      await controller.signOut();
      await controller.signIn();

      expect(controller.session()).toEqual({
        status: "signing-out",
        user: { id: "alice", photoUrl: null },
      });
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(signInWithRedirect).not.toHaveBeenCalled();
      expect(showNotice).not.toHaveBeenCalled();

      resolveOperation();
      await pending;
    });

    it("ignores sign-out when already signed out", async () => {
      changeAuth(null);

      await controller.signOut();

      expect(controller.session()).toEqual({ status: "signed-out" });
      expect(signOut).not.toHaveBeenCalled();
      expect(showNotice).not.toHaveBeenCalled();
    });

    it.each([
      [
        "auth/network-request-failed",
        "Could not sign out. Check your connection and try again.",
      ],
      ["auth/unknown", "Could not sign out. Please try again."],
    ])("reports %s and restores the user", async (code, message) => {
      const user = { id: "alice", photoUrl: "photo.png" };
      changeAuth({ uid: "alice", photoURL: user.photoUrl });
      vi.mocked(signOut).mockRejectedValueOnce({ code });

      await controller.signOut();

      expect(controller.session()).toEqual({ status: "signed-in", user });
      expect(showNotice).toHaveBeenCalledExactlyOnceWith(message);
    });

    it("allows retrying sign-out after a failure", async () => {
      const user = { id: "alice", photoUrl: "photo.png" };
      changeAuth({ uid: "alice", photoURL: user.photoUrl });
      vi.mocked(signOut).mockRejectedValueOnce({
        code: "auth/network-request-failed",
      });

      await controller.signOut();
      expect(controller.session()).toEqual({ status: "signed-in", user });

      await controller.signOut();

      expect(controller.session()).toEqual({ status: "signing-out", user });
      expect(signOut).toHaveBeenCalledTimes(2);
      expect(showNotice).toHaveBeenCalledTimes(1);
    });

    it.each([{ uid: "bob", photoURL: "other.png" }, null])(
      "ignores a late failure after an auth event: %j",
      async (user) => {
        changeAuth({ uid: "alice", photoURL: "photo.png" });
        let rejectOperation!: (reason: unknown) => void;
        vi.mocked(signOut).mockReturnValueOnce(
          new Promise<void>((_resolve, reject) => {
            rejectOperation = reject;
          }),
        );
        const pending = controller.signOut();
        expect(controller.session()).toEqual({
          status: "signing-out",
          user: { id: "alice", photoUrl: "photo.png" },
        });

        changeAuth(user);
        rejectOperation({ code: "auth/network-request-failed" });
        await pending;

        expect(controller.session()).toEqual(
          user
            ? { status: "signed-in", user: { id: user.uid, photoUrl: user.photoURL } }
            : { status: "signed-out" },
        );
        expect(showNotice).not.toHaveBeenCalled();
      },
    );
  });
});
