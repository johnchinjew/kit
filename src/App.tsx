import { createEffect, createSignal, For, Match, onCleanup, Show, Switch, untrack } from "solid-js";
import TaskEditor from "./TaskEditor";
import RepeatingTaskEditor from "./RepeatingTaskEditor";
import Button from "./components/Button";
import Notice from "./components/Notice";
import type { Timestamp } from "firebase/firestore";
import { occurrenceDates } from "./repeatingTask";
import { formatTaskDate, taskDateOneYearFromToday, taskDateToday, type TaskDate } from "./taskDate";
import { formatDate } from "./date";
import { createNotice } from "./notice";
import { createSession, type SignedIn } from "./session";
import {
  createRepeatingTask,
  createTasksFromRepeatingTasks,
  createTask,
  emptyUserData,
  subscribeUserData,
  type UserData,
} from "./userData";

export default function App() {
  const { notice, showNotice } = createNotice();
  const { session, signIn, signOut } = createSession(showNotice);

  if (import.meta.env.MODE !== "emulator") {
    showNotice("This is a work in progress demo and may contain bugs!");
  }

  return (
    <>
      <Switch>
        <Match when={session().status === "CheckingAuth"}><AppLoading /></Match>
        <Match when={session().status === "SigningIn"}><AppLoading /></Match>
        <Match when={session().status === "SigningOut"}><AppLoading /></Match>
        <Match when={session().status === "SignedIn" && (session() as SignedIn)}>
          {(current) => <AppSignedIn session={current()} signOut={signOut} showNotice={showNotice} />}
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

type ListMode = "Schedule" | "Completed";
type Selection = { type: "Task"; taskId: string; } | { type: "RepeatingTask"; repeatingTaskId: string; };
type ScheduleRow =
  | { type: "Task"; taskId: string; title: string; details: string; date: TaskDate; }
  | { type: "RepeatingTask"; repeatingTaskId: string; title: string; details: string; date: TaskDate; };
type CompletedRow = { taskId: string; title: string; completedAt: Timestamp; };

function AppSignedIn(props: {
  session: SignedIn;
  signOut: () => void;
  showNotice: (message: string) => void;
}) {
  const [selected, setSelected] = createSignal<Selection>();
  const [listMode, setListMode] = createSignal<ListMode>("Schedule");
  const [userData, setUserData] = createSignal<UserData>(emptyUserData());

  createEffect(() => {
    setUserData(emptyUserData());

    let requestedTaskCreationFromRepeatingTasks = false;

    const unsubscribe = subscribeUserData(props.session.user.userId, (data) => untrack(() => {
      // Close the editor if the item was deleted.
      const current = selected();
      if (current?.type === "Task" && userData().tasks[current.taskId] && !data.tasks[current.taskId]) setSelected(undefined);
      if (current?.type === "RepeatingTask" && userData().repeatingTasks[current.repeatingTaskId] && !data.repeatingTasks[current.repeatingTaskId]) setSelected(undefined);

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

  function addTask() {
    const taskId = crypto.randomUUID();
    void createTask(props.session.user.userId, taskId).catch(() => {
      props.showNotice("Could not create task. Try again later.");
      const current = selected();
      if (current?.type === "Task" && current.taskId === taskId) setSelected(undefined);
    });
    setSelected({ type: "Task", taskId });
  }

  function addRepeatingTask() {
    const repeatingTaskId = crypto.randomUUID();
    void createRepeatingTask(props.session.user.userId, repeatingTaskId).catch(() => {
      props.showNotice("Could not create repeating task. Try again later.");
      const current = selected();
      if (current?.type === "RepeatingTask" && current.repeatingTaskId === repeatingTaskId) setSelected(undefined);
    });
    setSelected({ type: "RepeatingTask", repeatingTaskId });
  }

  return (
    <Show when={selected()} fallback={
      <List
        userData={userData()}
        listMode={listMode()}
        photoUrl={props.session.user.photoUrl}
        signOut={props.signOut}
        setListMode={setListMode}
        setSelected={setSelected}
        addTask={addTask}
        addRepeatingTask={addRepeatingTask}
      />
    }>
      {(selection) => (
        <Editor
          session={props.session}
          userData={userData()}
          selection={selection()}
          showNotice={props.showNotice}
          onBack={() => setSelected(undefined)}
        />
      )}
    </Show>
  );
}

// SIGNED IN LIST

function List(props: {
  userData: UserData;
  listMode: ListMode;
  photoUrl: string | null;
  signOut: () => void;
  setListMode: (mode: ListMode) => void;
  setSelected: (selection: Selection) => void;
  addTask: () => void;
  addRepeatingTask: () => void;
}) {
  return (
    <div class="min-h-dvh flex flex-col">
      <MenuBar
        listMode={props.listMode}
        photoUrl={props.photoUrl}
        signOut={props.signOut}
        setListMode={props.setListMode}
      />
      <Show when={props.listMode === "Schedule"}>
        <ActionBar addTask={props.addTask} addRepeatingTask={props.addRepeatingTask} />
      </Show>
      <Switch>
        <Match when={props.listMode === "Schedule"}>
          <main class="px-4 mx-auto w-full max-w-lg">
            <ul class="px-4">
              <For each={scheduleRows(props.userData)}>
                {(row) => (
                  <li>
                    <Switch>
                      <Match when={row.type === "Task" && row}>
                        {(taskRow) => (
                          <>
                            <button type="button" onClick={() => props.setSelected({ type: "Task", taskId: taskRow().taskId })}>
                              {taskRow().title || "Untitled"}
                              <Show when={taskRow().details.trim()}> • {taskRow().details}</Show>
                            </button>
                            <time dateTime={taskRow().date}>{formatTaskDate(taskRow().date, taskDateToday())}</time>
                          </>
                        )}
                      </Match>
                      <Match when={row.type === "RepeatingTask" && row}>
                        {(repeatingTaskRow) => (
                          <>
                            <button type="button" onClick={() => props.setSelected({ type: "RepeatingTask", repeatingTaskId: repeatingTaskRow().repeatingTaskId })}>
                              {repeatingTaskRow().title || "Untitled"}
                              <Show when={repeatingTaskRow().details.trim()}> • {repeatingTaskRow().details}</Show>
                            </button>
                            ↻
                            <time dateTime={repeatingTaskRow().date}>{formatTaskDate(repeatingTaskRow().date, taskDateToday())}</time>
                          </>
                        )}
                      </Match>
                    </Switch>
                  </li>
                )}
              </For>
            </ul>
          </main>
        </Match>
        <Match when={props.listMode === "Completed"}>
          <main class="px-4 mx-auto w-full max-w-lg">
            <ul class="px-4">
              <For each={completedRows(props.userData)}>
                {(row) => (
                  <li>
                    <button type="button" onClick={() => props.setSelected({ type: "Task", taskId: row.taskId })}>
                      {row.title || "Untitled"}
                    </button>
                    <time dateTime={row.completedAt.toDate().toISOString()}>
                      {formatDate(row.completedAt.toDate())}
                    </time>
                  </li>
                )}
              </For>
            </ul>
          </main>
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
          if (mode === "Schedule" || mode === "Completed") props.setListMode(mode);
        }}
      >
        <option value="Schedule">Schedule</option>
        <option value="Completed">Completed</option>
      </select>
      <div class="col-start-3 justify-self-end">
        <SignOutButton photoUrl={props.photoUrl} signOut={props.signOut} />
      </div>
    </header>
  );
}

function ActionBar(props: {
  addTask: () => void;
  addRepeatingTask: () => void;
}) {
  return (
    <div class="order-last sticky bottom-0 mt-auto mx-auto w-full max-w-lg flex gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <Button onClick={props.addTask}>＋ Task</Button>
      <Button onClick={props.addRepeatingTask}>＋ Repeating Task</Button>
    </div>
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
  return [...taskRows, ...repeatingTaskRows].sort((left, right) => left.date.localeCompare(right.date));
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

// SIGNED IN EDITOR

function Editor(props: {
  session: SignedIn;
  userData: UserData;
  selection: Selection;
  showNotice: (message: string) => void;
  onBack: () => void;
}) {
  return (
    <Switch>
      <Match when={props.selection.type === "Task" && props.selection}>
        {(selection) => (
          <Show when={props.userData.tasks[selection().taskId]} fallback={<p>Loading task</p>}>
            {(task) => (
              <TaskEditor
                taskId={selection().taskId}
                task={task()}
                session={props.session}
                showNotice={props.showNotice}
                onBack={props.onBack}
              />
            )}
          </Show>
        )}
      </Match>
      <Match when={props.selection.type === "RepeatingTask" && props.selection}>
        {(selection) => (
          <Show when={props.userData.repeatingTasks[selection().repeatingTaskId]} fallback={<p>Loading repeating task</p>}>
            {(repeatingTask) => (
              <RepeatingTaskEditor
                repeatingTaskId={selection().repeatingTaskId}
                repeatingTask={repeatingTask()}
                session={props.session}
                showNotice={props.showNotice}
                onBack={props.onBack}
              />
            )}
          </Show>
        )}
      </Match>
    </Switch>
  );
}

// SIGNED OUT

function AppSignedOut(props: { signIn: () => void; }) {
  return (
    <main class="p-4 mx-auto w-full max-w-lg">
      <Button onClick={props.signIn}>
        Sign in with Google
      </Button>
    </main>
  );
}
