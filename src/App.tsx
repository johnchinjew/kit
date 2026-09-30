import { Match, Show, Switch } from "solid-js";
import { createNotice } from "./notice";
import { createSession, type SignedIn, type SigningOut } from "./session";

export default function App() {
  const { notice, showNotice } = createNotice();
  const { session, signIn, signOut } = createSession(showNotice);

  showNotice("This is a work in progress demo and may contain bugs!");

  return (
    <>
      <Switch>
        <Match when={session().status === "checking-auth"}>Loading</Match>
        <Match when={session().status === "signing-in"}>Signing in</Match>
        <Match when={session().status === "signed-in" && (session() as SignedIn)}>
          {(current) => (
            <>
              <button type="button" onClick={signOut}>
                Sign out
              </button>
              <img
                src={current().user.photoUrl ?? "/assets/profile-placeholder.svg"}
                alt="Profile photo"
              />
            </>
          )}
        </Match>
        <Match when={session().status === "signing-out" && (session() as SigningOut)}>
          {(current) => (
            <>
              Signing out
              <img
                src={current().user.photoUrl ?? "/assets/profile-placeholder.svg"}
                alt="Profile photo"
              />
            </>
          )}
        </Match>
        <Match when={session().status === "signed-out"}>
          <button type="button" onClick={signIn}>
            Sign in with Google
          </button>
        </Match>
      </Switch>
      <Show when={notice()}>{(message) => <p>{message()}</p>}</Show>
    </>
  );
}
