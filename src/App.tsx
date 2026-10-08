import { createEffect, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import Editor from "./Editor";
import { occurrenceDates } from "./recurrence";
import { formatTaskDate, taskDateToday, taskDateOneYearFromToday, type TaskDate } from "./taskDate";
import { formatDate } from "./date";
import { createNotice } from "./notice";
import { createSession, type SignedIn, type SigningOut } from "./session";
import { advanceTaskSchedule, createTask, createTaskOccurrence, emptyUserData, subscribeUserData, type Task, type UserData } from "./userData";

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
    let materialized = false;
    const userId = props.session.user.id;
    const unsubscribe = subscribeUserData(userId, (data) => {
      setUserData(data);
      if (materialized) return;
      materialized = true;
      const today = taskDateToday();
      const writes: Promise<void>[] = [];
      for (const [id, task] of Object.entries(data.tasks)) {
        if (task.type !== "RepeatingTask") continue;
        for (const date of occurrenceDates(task.schedule.recurrence, task.schedule.nextDate, today)) {
          const occurrenceId = crypto.randomUUID();
          const occurrence = { ...task, schedule: { ...task.schedule, nextDate: date } };
          writes.push(createTaskOccurrence(userId, occurrenceId, occurrence));
          writes.push(advanceTaskSchedule(userId, id, occurrence, occurrenceId));
        }
      }
      void Promise.all(writes).catch(() => {
        props.showNotice("Could not update repeating tasks. Close and reopen Kit to try again later.");
      });
    }, () => {
      props.showNotice("There was a problem loading your data. The displayed tasks may be outdated.");
    });
    onCleanup(unsubscribe);
  });

  function rows() {
    return Object.entries(userData().tasks).flatMap<readonly [string, Task, TaskDate]>(([id, task]) => task.type === "RepeatingTask"
      ? occurrenceDates(task.schedule.recurrence, task.schedule.nextDate, taskDateOneYearFromToday()).map((date) => [id, task, date] as const)
      : [[id, task, task.date] as const]);
  }

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
          <For each={rows().filter(([, task]) => {
            switch (listMode()) {
              case "Schedule": return task.type === "RepeatingTask" || task.completedAt === null;
              case "Completed": return task.type === "NonRepeatingTask" && task.completedAt !== null;
            }
          }).sort(([, left, leftDate], [, right, rightDate]) => {
            switch (listMode()) {
              case "Schedule": return leftDate.localeCompare(rightDate);
              case "Completed": {
                if (left.type !== "NonRepeatingTask" || right.type !== "NonRepeatingTask"
                  || left.completedAt === null || right.completedAt === null) return 0;
                return right.completedAt.seconds - left.completedAt.seconds
                  || right.completedAt.nanoseconds - left.completedAt.nanoseconds;
              }
            }
          })}>
            {([taskId, task, date]) => (
              <li>
                <button type="button" onClick={() => setSelectedTaskId(taskId)}>
                  {task.title || "Untitled"}{task.type === "RepeatingTask" ? " ↻" : ""}
                </button>
                <Show when={task.type === "NonRepeatingTask" && task.completedAt} fallback={
                  <time dateTime={date}>{formatTaskDate(date)}</time>
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
          <Show when={userData().tasks[taskId()]} fallback={<><p>Task unavailable</p><button type="button" onClick={() => setSelectedTaskId(undefined)}>Back</button></>}>
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
