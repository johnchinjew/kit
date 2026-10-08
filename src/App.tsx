import { createEffect, createSignal, For, Match, onCleanup, Show, Switch, untrack } from "solid-js";
import Editor from "./Editor";
import { formatTaskDate } from "./taskDate";
import { formatDate } from "./date";
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
        <Match when={session().status === "CheckingAuth"}><p>Loading</p></Match>
        <Match when={session().status === "SigningIn"}><p>Signing in</p></Match>
        <Match when={session().status === "SignedIn" && (session() as SignedIn)}>
          {(current) => <AppSignedIn session={current()} signOut={signOut} showNotice={showNotice} />}
        </Match>
        <Match when={session().status === "SigningOut" && (session() as SigningOut)}>
          {(current) => (
            <>
              <p>Signing out</p>
              <ProfilePhoto photoUrl={current().user.photoUrl} />
            </>
          )}
        </Match>
        <Match when={session().status === "SignedOut"}>
          <button type="button" onClick={signIn}>
            Sign in with Google
          </button>
        </Match>
      </Switch>
      <Show when={notice()}>{(message) => <p>{message()}</p>}</Show>
    </>
  );
}

type ListMode = "Schedule" | "Completed";

function AppSignedIn(props: {
  session: SignedIn;
  signOut: () => void;
  showNotice: (message: string) => void;
}) {
  const [selectedTaskId, setSelectedTaskId] = createSignal<string>();
  const [listMode, setListMode] = createSignal<ListMode>("Schedule");
  const [userData, setUserData] = createSignal<UserData>(emptyUserData());

  createEffect(() => {
    setUserData(emptyUserData());
    const unsubscribe = subscribeUserData(props.session.user.id, (data) => untrack(() => {
      const taskId = selectedTaskId();
      if (taskId && userData().tasks[taskId] && !data.tasks[taskId]) setSelectedTaskId(undefined);
      setUserData(data);
    }), () => {
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
            if (mode === "Schedule" || mode === "Completed") setListMode(mode);
          }}
        >
          <option value="Schedule">Schedule</option>
          <option value="Completed">Completed</option>
        </select>
        <ul>
          <For each={Object.entries(userData().tasks).filter(([, task]) => {
            switch (listMode()) {
              case "Schedule": return task.completedAt === null;
              case "Completed": return task.completedAt !== null;
            }
          }).sort(([, left], [, right]) => {
            switch (listMode()) {
              case "Schedule": return left.date.localeCompare(right.date);
              case "Completed": {
                if (left.completedAt === null || right.completedAt === null) return 0;
                return right.completedAt.seconds - left.completedAt.seconds
                  || right.completedAt.nanoseconds - left.completedAt.nanoseconds;
              }
            }
          })}>
            {([taskId, task]) => (
              <li>
                <button type="button" onClick={() => setSelectedTaskId(taskId)}>
                  {task.title}
                </button>
                <Show when={task.completedAt} fallback={
                  <time dateTime={task.date}>{formatTaskDate(task.date)}</time>
                }>
                  {(completedAt) => (
                    <time dateTime={completedAt().toDate().toISOString()}>
                      {formatDate(completedAt().toDate())}
                    </time>
                  )}
                </Show>
              </li>
            )}
          </For>
        </ul>
        <Show when={listMode() === "Schedule"}>
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
