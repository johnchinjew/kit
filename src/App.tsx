import { createEffect, createSignal, For, Match, onCleanup, Show, Switch, untrack } from "solid-js";
import TaskCreator from "./TaskCreator";
import TaskEditor from "./TaskEditor";
import RepeatingTaskEditor from "./RepeatingTaskEditor";
import Button from "./components/Button";
import Notice from "./components/Notice";
import type { Timestamp } from "firebase/firestore";
import { occurrenceDates } from "./repeatingTask";
import { formatTaskDate, taskDateFromDate, taskDateOneYearFromToday, taskDateToday, type TaskDate } from "./taskDate";
import { createNotice } from "./notice";
import { createSession, type SignedIn } from "./session";
import {
  createTasksFromRepeatingTasks,
  emptyUserData,
  subscribeUserData,
  type UserData,
} from "./userData";

export default function App() {
  const { notice, showNotice } = createNotice();
  const { session, signIn, signOut } = createSession(showNotice);

  return (
    <>
      <Switch>
        <Match when={session().status === "CheckingAuth"}><AppLoading /></Match>
        <Match when={session().status === "SigningIn"}><AppLoading /></Match>
        <Match when={session().status === "SigningOut"}><AppLoading /></Match>
        {/* Use keyed so AppSignedIn gets remounted whenever the session changes.
            This ensures the previous user's draft is not accessible by the newly signed in user. */}
        <Match when={session().status === "SignedIn" && (session() as SignedIn)} keyed>
          {(current) => <AppSignedIn session={current} signOut={signOut} showNotice={showNotice} />}
        </Match>
        <Match when={session().status === "SignedOut"}>
          <AppSignedOut signIn={signIn} />
        </Match>
      </Switch>
      <Show when={notice()}>{(message) => <Notice message={message()} />}</Show>
    </>
  );
}

// LOADING

function AppLoading() {
  return (
    <main class="p-4 mx-auto w-full max-w-lg">
      <p class="px-4 py-2.5 text-center">Loading...</p>
    </main>
  );
}

// SIGNED IN

type ListMode = "Schedule" | "Open" | "Completed";
type View =
  | { type: "List"; }
  | { type: "TaskCreator"; }
  | { type: "TaskEditor"; taskId: string; }
  | { type: "RepeatingTaskEditor"; repeatingTaskId: string; };

function AppSignedIn(props: {
  session: SignedIn;
  signOut: () => void;
  showNotice: (message: string) => void;
}) {
  const [view, setView] = createSignal<View>({ type: "List" });
  const [listMode, setListMode] = createSignal<ListMode>("Schedule");
  const [userData, setUserData] = createSignal<UserData>(emptyUserData());

  createEffect(() => {
    setUserData(emptyUserData());

    let requestedTaskCreationFromRepeatingTasks = false;

    const unsubscribe = subscribeUserData(props.session.user.userId, (data) => untrack(() => {
      // Close the editor if the item was deleted.
      const current = view();
      if (current.type === "TaskEditor" && userData().tasks[current.taskId] && !data.tasks[current.taskId])
        setView({ type: "List" });
      if (current.type === "RepeatingTaskEditor" && userData().repeatingTasks[current.repeatingTaskId] && !data.repeatingTasks[current.repeatingTaskId])
        setView({ type: "List" });

      setUserData(data);

      if (!requestedTaskCreationFromRepeatingTasks) {
        requestedTaskCreationFromRepeatingTasks = true;
        void createTasksFromRepeatingTasks(props.session.user.userId, data).catch(() => {
          props.showNotice("Could not update repeating tasks. Please close and reopen Kit.");
        });
      }
    }), () => {
      props.showNotice("There was a problem loading your data. The displayed tasks may be outdated.");
    });

    onCleanup(unsubscribe);
  });

  return (
    <Show when={view()} keyed>
      {(current) => {
        switch (current.type) {
          case "List":
            return (
              <List
                userData={userData()}
                listMode={listMode()}
                photoUrl={props.session.user.photoUrl}
                signOut={props.signOut}
                setListMode={setListMode}
                setView={setView}
                openTaskCreator={() => setView({ type: "TaskCreator" })}
              />
            );
          case "TaskCreator":
            return (
              <TaskCreator
                session={props.session}
                showNotice={props.showNotice}
                onBack={() => setView({ type: "List" })}
              />
            );
          case "TaskEditor":
            return (
              <Show when={userData().tasks[current.taskId]} fallback={<p>Loading...</p>}>
                {(task) => (
                  <TaskEditor
                    taskId={current.taskId}
                    task={task()}
                    session={props.session}
                    showNotice={props.showNotice}
                    onBack={() => setView({ type: "List" })}
                  />
                )}
              </Show>
            );
          case "RepeatingTaskEditor":
            return (
              <Show when={userData().repeatingTasks[current.repeatingTaskId]} fallback={<p>Loading...</p>}>
                {(repeatingTask) => (
                  <RepeatingTaskEditor
                    repeatingTaskId={current.repeatingTaskId}
                    repeatingTask={repeatingTask()}
                    session={props.session}
                    showNotice={props.showNotice}
                    onBack={() => setView({ type: "List" })}
                  />
                )}
              </Show>
            );
        }
      }}
    </Show>
  );
}

function List(props: {
  userData: UserData;
  listMode: ListMode;
  photoUrl: string | null;
  signOut: () => void;
  setListMode: (mode: ListMode) => void;
  setView: (view: View) => void;
  openTaskCreator: () => void;
}) {
  return (
    <div class="min-h-dvh flex flex-col">
      <MenuBar
        listMode={props.listMode}
        photoUrl={props.photoUrl}
        signOut={props.signOut}
        setListMode={props.setListMode}
      />
      <Switch>
        <Match when={props.listMode === "Schedule"}>
          <ActionBar openTaskCreator={props.openTaskCreator} />
          <ScheduleList userData={props.userData} setView={props.setView} />
        </Match>
        <Match when={props.listMode === "Open"}>
          <ActionBar openTaskCreator={props.openTaskCreator} />
          <OpenList userData={props.userData} setView={props.setView} />
        </Match>
        <Match when={props.listMode === "Completed"}>
          <CompletedList userData={props.userData} setView={props.setView} />
        </Match>
      </Switch>
    </div>
  );
}

function MenuBar(props: {
  listMode: ListMode;
  photoUrl: string | null;
  signOut: () => void;
  setListMode: (mode: ListMode) => void;
}) {
  return (
    <header class="p-4 grid grid-cols-[1fr_auto_1fr] items-center">
      <select
        class="col-start-2"
        value={props.listMode}
        onChange={(event) => {
          const mode = event.currentTarget.value;
          if (mode === "Schedule" || mode === "Open" || mode === "Completed") props.setListMode(mode);
        }}
      >
        <option value="Schedule">Schedule</option>
        <option value="Open">Open</option>
        <option value="Completed">Completed</option>
      </select>
      <div class="col-start-3 justify-self-end">
        <SignOutButton photoUrl={props.photoUrl} signOut={props.signOut} />
      </div>
    </header>
  );
}

function SignOutButton(props: { photoUrl: string | null; signOut: () => void; }) {
  return (
    <button
      type="button"
      class="block size-8 rounded-full cursor-pointer"
      onClick={props.signOut}
    >
      <img
        class="size-full rounded-full object-cover"
        src={props.photoUrl ?? "/assets/profile-placeholder.svg"}
        alt="Profile photo"
      />
    </button>
  );
}

function ActionBar(props: {
  openTaskCreator: () => void;
}) {
  return (
    <div class="order-last sticky bottom-0 mt-auto mx-auto w-full max-w-lg px-4 pt-4">
      <div class="bg-background pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button onClick={props.openTaskCreator}>＋ Task</Button>
      </div>
    </div>
  );
}

type ScheduleRow =
  | { type: "Task"; taskId: string; title: string; details: string; date: TaskDate; }
  | { type: "RepeatingTask"; repeatingTaskId: string; title: string; details: string; date: TaskDate; };

function ScheduleList(props: {
  userData: UserData;
  setView: (view: View) => void;
}) {
  return (
    <main class="px-4 mx-auto w-full max-w-lg">
      <ul class="divide-y divide-border px-4">
        <For each={scheduleRows(props.userData)}>
          {(row) => (
            <li class="py-4 first:pt-0 last:pb-0">
              {row.type === "Task" ? (
                <TaskRow
                  title={row.title}
                  details={row.details}
                  date={row.date}
                  onClick={() => props.setView({ type: "TaskEditor", taskId: row.taskId })}
                />
              ) : (
                <RepeatingTaskRow
                  title={row.title}
                  details={row.details}
                  date={row.date}
                  onClick={() => props.setView({ type: "RepeatingTaskEditor", repeatingTaskId: row.repeatingTaskId })}
                />
              )}
            </li>
          )}
        </For>
      </ul>
    </main>
  );
}

function scheduleRows(data: UserData): ScheduleRow[] {
  const taskRows: ScheduleRow[] = Object.entries(data.tasks)
    .flatMap(([taskId, task]) =>
      task.completedAt === null
        ? [{ type: "Task", taskId, title: task.title, details: task.details, date: task.date }]
        : []
    );
  const repeatingTaskRows: ScheduleRow[] = Object.entries(data.repeatingTasks)
    .flatMap(([repeatingTaskId, repeatingTask]) =>
      occurrenceDates(repeatingTask.schedule, taskDateOneYearFromToday())
        .map((date) => ({ type: "RepeatingTask", repeatingTaskId, title: repeatingTask.title, details: repeatingTask.details, date }))
    );
  return [...taskRows, ...repeatingTaskRows].sort((left, right) =>
    left.date.localeCompare(right.date) || left.title.localeCompare(right.title)
  );
}

type OpenRow =
  | { type: "Task"; taskId: string; title: string; details: string; date: TaskDate; }
  | { type: "RepeatingTask"; repeatingTaskId: string; title: string; details: string; date: TaskDate; };

function OpenList(props: {
  userData: UserData;
  setView: (view: View) => void;
}) {
  return (
    <main class="px-4 mx-auto w-full max-w-lg">
      <ul class="divide-y divide-border px-4">
        <For each={openRows(props.userData)}>
          {(row) => (
            <li class="py-4 first:pt-0 last:pb-0">
              {row.type === "Task" ? (
                <TaskRow
                  title={row.title}
                  details={row.details}
                  date={row.date}
                  onClick={() => props.setView({ type: "TaskEditor", taskId: row.taskId })}
                />
              ) : (
                <RepeatingTaskRow
                  title={row.title}
                  details={row.details}
                  date={row.date}
                  onClick={() => props.setView({ type: "RepeatingTaskEditor", repeatingTaskId: row.repeatingTaskId })}
                />
              )}
            </li>
          )}
        </For>
      </ul>
    </main>
  );
}

function openRows(data: UserData): OpenRow[] {
  const taskRows: OpenRow[] = Object.entries(data.tasks)
    .flatMap(([taskId, task]) =>
      task.completedAt === null
        ? [{ type: "Task", taskId, title: task.title, details: task.details, date: task.date }]
        : []
    );
  const repeatingTaskRows: OpenRow[] = Object.entries(data.repeatingTasks)
    .map(([repeatingTaskId, repeatingTask]) => ({
      type: "RepeatingTask",
      repeatingTaskId,
      title: repeatingTask.title,
      details: repeatingTask.details,
      date: repeatingTask.schedule.nextDate,
    }));
  return [...taskRows, ...repeatingTaskRows].sort((left, right) =>
    left.date.localeCompare(right.date) || left.title.localeCompare(right.title)
  );
}

type CompletedRow = { taskId: string; title: string; completedAt: Timestamp; };

function CompletedList(props: {
  userData: UserData;
  setView: (view: View) => void;
}) {
  return (
    <main class="px-4 mx-auto w-full max-w-lg">
      <ul class="divide-y divide-border px-4">
        <For each={completedRows(props.userData)}>
          {(row) => (
            <li class="py-4 first:pt-0 last:pb-0">
              <CompletedTaskRow
                title={row.title}
                completedAt={row.completedAt}
                onClick={() => props.setView({ type: "TaskEditor", taskId: row.taskId })}
              />
            </li>
          )}
        </For>
      </ul>
    </main>
  );
}

function completedRows(data: UserData): CompletedRow[] {
  return Object.entries(data.tasks)
    .flatMap(([taskId, task]) =>
      task.completedAt === null
        ? []
        : [{ taskId, title: task.title, completedAt: task.completedAt }]
    )
    .sort((left, right) => right.completedAt.seconds - left.completedAt.seconds || right.completedAt.nanoseconds - left.completedAt.nanoseconds);
}

function TaskRow(props: {
  title: string;
  details: string;
  date: TaskDate;
  onClick: () => void;
}) {
  return (
    <button
      class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 text-left cursor-pointer"
      type="button"
      onClick={props.onClick}
    >
      <span class="truncate" classList={{ "text-foreground-muted": !props.title }}>
        {props.title || "Empty title"}
      </span>
      <time dateTime={props.date}>{formatTaskDate(props.date, taskDateToday())}</time>
      <Show when={props.details}>
        <span class="col-span-2 truncate text-sm text-foreground-muted">{props.details}</span>
      </Show>
    </button>
  );
}

function RepeatingTaskRow(props: {
  title: string;
  details: string;
  date: TaskDate;
  onClick: () => void;
}) {
  return (
    <button
      class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 text-left cursor-pointer"
      type="button"
      onClick={props.onClick}
    >
      <span class="truncate" classList={{ "text-foreground-muted": !props.title }}>
        {props.title || "Empty title"}
      </span>
      <span>
        ↻ <time dateTime={props.date}>{formatTaskDate(props.date, taskDateToday())}</time>
      </span>
      <Show when={props.details}>
        <span class="col-span-2 truncate text-sm text-foreground-muted">{props.details}</span>
      </Show>
    </button>
  );
}

function CompletedTaskRow(props: {
  title: string;
  completedAt: Timestamp;
  onClick: () => void;
}) {
  const completedDate = () => props.completedAt.toDate();
  return (
    <button
      class="grid w-full grid-cols-1 text-left cursor-pointer"
      type="button"
      onClick={props.onClick}
    >
      <span class="truncate line-through" classList={{ "text-foreground-muted": !props.title }}>
        {props.title || "Empty title"}
      </span>
      <time class="truncate text-sm text-foreground-muted" dateTime={completedDate().toISOString()}>
        Completed {formatTaskDate(taskDateFromDate(completedDate()), taskDateToday())}
      </time>
    </button>
  );
}

// SIGNED OUT

function AppSignedOut(props: { signIn: () => void; }) {
  return (
    <main class="p-4 mx-auto w-full max-w-lg">
      <p class="mb-4 px-4 py-2.5 text-foreground">
        Kit is in pre-alpha. Try it out! But serious bugs, including data loss, are possible. To share feedback, <a class="underline" href="https://github.com/johnchinjew/kit/issues">open an issue</a>.
      </p>
      <Button onClick={props.signIn}>
        Sign in with Google
      </Button>
    </main>
  );
}
