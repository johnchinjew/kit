import { createEffect, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import Editor from "./Editor";
import { formatTaskDate } from "./taskDate";
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

type ListMode = "schedule" | "completed";

function AppSignedIn(props: {
  session: SignedIn;
  signOut: () => void;
  showNotice: (message: string) => void;
}) {
  const [selectedTaskId, setSelectedTaskId] = createSignal<string>();
  const [listMode, setListMode] = createSignal<ListMode>("schedule");
  const [userData, setUserData] = createSignal<UserData>(emptyUserData());

  createEffect(() => {
    setUserData(emptyUserData());
    const unsubscribe = subscribeUserData(props.session.user.id, setUserData, () => {
      props.showNotice("There was a problem loading your data. The displayed tasks may be outdated.");
    });
    onCleanup(unsubscribe);
  });

  function addTask() {
    const taskId = crypto.randomUUID();
    void createTask(props.session.user.id, taskId).catch(() => {
      props.showNotice("Could not create task. Try again later.");
      if (selectedTaskId() === taskId) setSelectedTaskId(undefined);
    });
    setSelectedTaskId(taskId);
  }

  return (
    <Switch>
      <Match when={!selectedTaskId()}>
        <button type="button" onClick={props.signOut}>
          Sign out
        </button>
        <ProfilePhoto photoUrl={props.session.user.photoUrl} />
        <select
          value={listMode()}
          onChange={(event) => {
            const mode = event.currentTarget.value;
            if (mode === "schedule" || mode === "completed") setListMode(mode);
          }}
        >
          <option value="schedule">Schedule</option>
          <option value="completed">Completed</option>
        </select>
        <ul>
          <For each={Object.entries(userData().tasks).filter(([, task]) => {
            switch (listMode()) {
              case "schedule": return !task.completed;
              case "completed": return task.completed;
            }
          }).sort(([, left], [, right]) => {
            switch (listMode()) {
              case "schedule": return left.date.localeCompare(right.date);
              case "completed": return 0;
            }
          })}>
            {([taskId, task]) => (
              <li>
                <button type="button" onClick={() => setSelectedTaskId(taskId)}>
                  {task.title}
                </button>
                <time dateTime={task.date}>{formatTaskDate(task.date)}</time>
              </li>
            )}
          </For>
        </ul>
        <Show when={listMode() === "schedule"}>
          <button type="button" onClick={addTask}>
            Add
          </button>
        </Show>
      </Match>
      <Match when={selectedTaskId()}>
        {(taskId) => (
          <Show when={userData().tasks[taskId()]} fallback={<p>Loading task</p>}>
            {(task) => (
              <Editor
                taskId={taskId()}
                task={task()}
                session={props.session}
                showNotice={props.showNotice}
                onBack={() => setSelectedTaskId(undefined)}
              />
            )}
          </Show>
        )}
      </Match>
    </Switch>
  );
}

function ProfilePhoto(props: { photoUrl: string | null; }) {
  return <img src={props.photoUrl ?? "/assets/profile-placeholder.svg"} alt="Profile photo" />;
}
