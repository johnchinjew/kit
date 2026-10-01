import { createEffect, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import { createNotice } from "./notice";
import { createSession, type SignedIn, type SigningOut } from "./session";
import { createTask, emptyUserData, subscribeUserData, type UserData } from "./userData";

export default function App() {
  const { notice, showNotice } = createNotice();
  const { session, signIn, signOut } = createSession(showNotice);

  showNotice("This is a work in progress demo and may contain bugs!");

  return (
    <>
      <Switch>
        <Match when={session().status === "checking-auth"}><p>Loading</p></Match>
        <Match when={session().status === "signing-in"}><p>Signing in</p></Match>
        <Match when={session().status === "signed-in" && (session() as SignedIn)}>
          {(current) => <AppSignedIn session={current()} signOut={signOut} showNotice={showNotice} />}
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

function AppSignedIn(props: {
  session: SignedIn;
  signOut: () => void;
  showNotice: (message: string) => void;
}) {
  const [editing, setEditing] = createSignal(false);
  const [userData, setUserData] = createSignal<UserData>(emptyUserData());

  createEffect(() => {
    setUserData(emptyUserData());
    const unsubscribe = subscribeUserData(props.session.user.id, setUserData, () => {
      props.showNotice("There was a problem loading your data. The displayed tasks may be outdated.");
    });
    onCleanup(unsubscribe);
  });

  return (
    <Switch>
      <Match when={!editing()}>
        <button type="button" onClick={props.signOut}>
          Sign out
        </button>
        <ProfilePhoto photoUrl={props.session.user.photoUrl} />
        <ul>
          <For each={Object.entries(userData().tasks)}>{([, task]) => <li>{task.title}</li>}</For>
        </ul>
        <button type="button" onClick={() => setEditing(true)}>
          Add task
        </button>
      </Match>
      <Match when={editing()}>
        <Editor
          session={props.session}
          showNotice={props.showNotice}
          onBack={() => setEditing(false)}
        />
      </Match>
    </Switch>
  );
}

function Editor(props: {
  session: SignedIn;
  showNotice: (message: string) => void;
  onBack: () => void;
}) {
  const [title, setTitle] = createSignal("");

  function onClick() {
    const sanitizedTitle = title().trim();
    if (sanitizedTitle) {
      void createTask(props.session.user.id, { title: sanitizedTitle }).catch(() => {
        props.showNotice("Could not create task. Try again later.");
      });
    }
    props.onBack();
  }

  return (
    <main>
      <button type="button" onClick={onClick}>
        Back
      </button>
      <input
        name="title"
        type="text"
        value={title()}
        onInput={(event) => setTitle(event.currentTarget.value)}
      />
    </main>
  );
}

function ProfilePhoto(props: { photoUrl: string | null; }) {
  return <img src={props.photoUrl ?? "/assets/profile-placeholder.svg"} alt="Profile photo" />;
}
