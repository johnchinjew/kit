import { createSignal, Match, Show, Switch } from "solid-js";
import { createNotice } from "./notice";
import { createSession, type SignedIn, type SigningOut } from "./session";

export default function App() {
  const { notice, showNotice } = createNotice();
  const { session, signIn, signOut } = createSession(showNotice);

  return (
    <>
      <Switch>
        <Match when={session().status === "checking-auth"}><p>Loading</p></Match>
        <Match when={session().status === "signing-in"}><p>Signing in</p></Match>
        <Match when={session().status === "signed-in" && (session() as SignedIn)}>
          {(current) => <AppSignedIn session={current()} signOut={signOut} />}
        </Match>
        <Match when={session().status === "signing-out" && (session() as SigningOut)}>
          {(current) => (
            <>
              <p>Signing out</p>
              <ProfilePhoto photoUrl={current().user.photoUrl} />
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

function AppSignedIn(props: { session: SignedIn; signOut: () => void; }) {
  const [editing, setEditing] = createSignal(false);

  return (
    <Switch>
      <Match when={!editing()}>
        <button type="button" onClick={props.signOut}>
          Sign out
        </button>
        <ProfilePhoto photoUrl={props.session.user.photoUrl} />
        <button type="button" onClick={() => setEditing(true)}>
          Add task
        </button>
      </Match>
      <Match when={editing()}>
        <Editor onBack={() => setEditing(false)} />
      </Match>
    </Switch>
  );
}

function Editor(props: { onBack: () => void; }) {
  return (
    <main>
      <button type="button" onClick={props.onBack}>
        Back
      </button>
      <input name="title" type="text" />
    </main>
  );
}

function ProfilePhoto(props: { photoUrl: string | null; }) {
  return <img src={props.photoUrl ?? "/assets/profile-placeholder.svg"} alt="Profile photo" />;
}
