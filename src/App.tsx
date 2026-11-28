import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
  untrack,
  useContext
} from "solid-js";
import { containsSearchPhrase } from "./search";
import TaskCreator from "./TaskCreator";
import TaskEditor from "./TaskEditor";
import RepeatingTaskEditor from "./RepeatingTaskEditor";
import Button from "./components/Button";
import TextButton from "./components/TextButton";
import BottomBar from "./components/BottomBar";
import Notice from "./components/Notice";
import type { Timestamp } from "firebase/firestore";
import { occurrenceDates } from "./repeatingTask";
import {
  TodayContext,
  formatTaskDate,
  taskDateFromDate,
  taskDateOneYearAfter,
  taskDateToday,
  type TaskDate
} from "./taskDate";
import { createNotice } from "./notice";
import { createSession, type SignedIn } from "./session";
import {
  createTasksFromRepeatingTasks,
  deleteTasksWithElapsedRetention,
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
      <p role="status" class="px-4 py-2.5 text-center">Loading...</p>
    </main>
  );
}

// SIGNED IN

type View =
  | { type: "List"; }
  | { type: "TaskCreator"; }
  | { type: "TaskEditor"; taskId: string; }
  | { type: "RepeatingTaskEditor"; repeatingTaskId: string; };

type ListMode =
  | { type: "Search"; phrase: string; }
  | { type: "Schedule"; }
  | { type: "Open"; }
  | { type: "Completed"; };

function AppSignedIn(props: {
  session: SignedIn;
  signOut: () => void;
  showNotice: (message: string) => void;
}) {
  const [today, setToday] = createSignal(taskDateToday());
  const [view, setView] = createSignal<View>({ type: "List" });
  const [listMode, setListMode] = createSignal<ListMode>({ type: "Schedule" });
  const [userData, setUserData] = createSignal<UserData>(emptyUserData());

  createEffect(() => {
    setUserData(emptyUserData());

    // The todayTimerTick() loop keeps Kit's date-based behavior updated:
    // 1. Updates date-based UI.
    // 2. Creates tasks from repeating tasks.
    const submittedTaskCreations = new Set<string>();
    let todayTimer: ReturnType<typeof setInterval> | undefined;
    let todayTimerStopped = false;
    const todayTimerTick = () => untrack(async () => {
      if (todayTimerStopped) {
        return;
      }
      try {
        const newToday = taskDateToday();
        setToday(newToday);
        await createTasksFromRepeatingTasks(props.session.user.userId, userData(), newToday, submittedTaskCreations);
      } catch {
        if (todayTimerStopped) {
          return;
        }
        // On any failures, we are using a super simplistic strategy for now:
        // stop polling entirely and just ask the user to restart Kit.
        todayTimerStopped = true;
        clearInterval(todayTimer);
        props.showNotice("Could not update repeating tasks. Please close and reopen Kit.");
      }
    });

    let submittedTaskDeletions = false;

    const unsubscribe = subscribeUserData(props.session.user.userId, (data) => untrack(() => {
      // Close the editor if the item was deleted.
      const current = view();
      if (current.type === "TaskEditor" && userData().tasks[current.taskId] && !data.tasks[current.taskId])
        setView({ type: "List" });
      if (current.type === "RepeatingTaskEditor" && userData().repeatingTasks[current.repeatingTaskId] && !data.repeatingTasks[current.repeatingTaskId])
        setView({ type: "List" });

      setUserData(data);

      // Until the first snapshot arrives, we don't need the todayTimerTick() loop to be running.
      if (todayTimer === undefined) {
        todayTimer = setInterval(todayTimerTick, 1500);
        void todayTimerTick();
      }

      if (!submittedTaskDeletions) {
        submittedTaskDeletions = true;
        void deleteTasksWithElapsedRetention(props.session.user.userId, data).catch(() => {
          props.showNotice("Could not complete clean up. Please close and reopen Kit.");
        });
      }
    }), () => {
      props.showNotice("There was a problem loading your data. The displayed tasks may be outdated.");
    });

    onCleanup(() => {
      todayTimerStopped = true;
      clearInterval(todayTimer);
      unsubscribe();
    });
  });

  return (
    <TodayContext.Provider value={today}>
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
                <Show when={userData().tasks[current.taskId]} fallback={<AppLoading />}>
                  <TaskEditor
                    taskId={current.taskId}
                    userData={userData()}
                    session={props.session}
                    showNotice={props.showNotice}
                    onBack={() => setView({ type: "List" })}
                  />
                </Show>
              );
            case "RepeatingTaskEditor":
              return (
                <Show when={userData().repeatingTasks[current.repeatingTaskId]} fallback={<AppLoading />}>
                  <RepeatingTaskEditor
                    repeatingTaskId={current.repeatingTaskId}
                    userData={userData()}
                    session={props.session}
                    showNotice={props.showNotice}
                    onBack={() => setView({ type: "List" })}
                  />
                </Show>
              );
          }
        }}
      </Show>
    </TodayContext.Provider>
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
  // Use memo to avoid updating stuff that only depends on the list mode type i.e. stuff that doesn't need to be updated
  // when the user is typing in the search bar.
  const listModeType = createMemo(() => props.listMode.type);

  return (
    <div class="min-h-dvh flex flex-col">
      <MenuBar
        listMode={listModeType()}
        photoUrl={props.photoUrl}
        signOut={props.signOut}
        setListMode={props.setListMode}
      />
      <Switch>
        <Match when={props.listMode.type === "Search" && props.listMode}>
          {(search) => (
            <SearchList
              userData={props.userData}
              phrase={search().phrase}
              setPhrase={(phrase) => props.setListMode({ type: "Search", phrase })}
              setView={props.setView}
            />
          )}
        </Match>
        <Match when={listModeType() === "Schedule"}>
          {/* Keep ActionBar first to ensure TAB reaches the ActionBar before any list rows. */}
          <ActionBar openTaskCreator={props.openTaskCreator} />
          <ScheduleList userData={props.userData} setView={props.setView} />
        </Match>
        <Match when={listModeType() === "Open"}>
          {/* Keep ActionBar first to ensure TAB reaches the ActionBar before any list rows. */}
          <ActionBar openTaskCreator={props.openTaskCreator} />
          <OpenList userData={props.userData} setView={props.setView} />
        </Match>
        <Match when={listModeType() === "Completed"}>
          <CompletedList userData={props.userData} setView={props.setView} />
        </Match>
      </Switch>
    </div>
  );
}

function MenuBar(props: {
  listMode: ListMode["type"];
  photoUrl: string | null;
  signOut: () => void;
  setListMode: (mode: ListMode) => void;
}) {
  const [showStickyMenuBar, setShowStickyMenuBar] = createSignal(false);
  let header!: HTMLElement;

  onMount(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry) {
        setShowStickyMenuBar(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
      }
    });

    observer.observe(header);
    onCleanup(() => observer.disconnect());
  });

  return (
    <>
      <header ref={header} class="p-4 grid grid-cols-[1fr_auto_1fr] items-center">
        <div class="col-start-2">
          <ListModeSelector listMode={props.listMode} setListMode={props.setListMode} />
        </div>
        <div class="col-start-3 justify-self-end">
          <SignOutButton photoUrl={props.photoUrl} signOut={props.signOut} />
        </div>
      </header>
      <Show when={showStickyMenuBar()}>
        <div class="fixed inset-x-0 top-0 z-10 flex justify-center border-b border-border bg-background px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
          <ListModeSelector listMode={props.listMode} setListMode={props.setListMode} />
        </div>
      </Show>
    </>
  );
}

function ListModeSelector(props: {
  listMode: ListMode["type"];
  setListMode: (mode: ListMode) => void;
}) {
  return (
    <select
      aria-label="List selector"
      class="font-semibold"
      value={props.listMode}
      onChange={(event) => {
        const mode = event.currentTarget.value;
        if (mode === "Search") {
          props.setListMode({ type: "Search", phrase: "" });
        } else if (mode === "Schedule" || mode === "Open" || mode === "Completed") {
          props.setListMode({ type: mode });
        }
      }}
    >
      <option value="Search">Search</option>
      <option value="Schedule">Schedule</option>
      <option value="Open">Open</option>
      <option value="Completed">Completed</option>
    </select>
  );
}

function SignOutButton(props: { photoUrl: string | null; signOut: () => void; }) {
  return (
    <button
      type="button"
      class="block size-8 rounded-full cursor-pointer"
      title="Sign out"
      aria-label="Sign out"
      onClick={() => {
        if (window.confirm("Sign out?")) props.signOut();
      }}
    >
      {/* Use alt="" to mark the img as decorative (the button already has title and aria-label). */}
      <img
        class="size-full rounded-full object-cover"
        src={props.photoUrl ?? "/assets/profile-placeholder.svg"}
        alt=""
      />
    </button>
  );
}

function ActionBar(props: {
  openTaskCreator: () => void;
}) {
  return (
    <BottomBar>
      <TextButton onClick={props.openTaskCreator}>＋ Add task</TextButton>
    </BottomBar>
  );
}

type SearchRow =
  | { type: "Task"; taskId: string; title: string; details: string; date: TaskDate; }
  | { type: "RepeatingTask"; repeatingTaskId: string; title: string; details: string; date: TaskDate; }
  | { type: "CompletedTask"; taskId: string; title: string; details: string; date: TaskDate; completedAt: Timestamp; };

function SearchList(props: {
  userData: UserData;
  phrase: string;
  setPhrase: (phrase: string) => void;
  setView: (view: View) => void;
}) {
  let input!: HTMLInputElement;

  onMount(() => input.focus());

  return (
    <main class="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] mx-auto w-full max-w-lg">
      <div role="search" class="relative mb-4">
        <input
          ref={input}
          type="text"
          aria-label="Search"
          placeholder="Search"
          class="w-full rounded-md border border-border bg-background pl-4 pr-10 py-2.5"
          value={props.phrase}
          onInput={(event) => props.setPhrase(event.currentTarget.value)}
        />
        <Show when={props.phrase}>
          <button
            type="button"
            aria-label="Clear search"
            class="absolute right-0 top-0 h-full px-4 cursor-pointer"
            onClick={() => {
              props.setPhrase("");
              input.focus();
            }}
          >
            ×
          </button>
        </Show>
      </div>
      <ul role="list" class="divide-y divide-border px-4">
        <For each={searchRows(props.userData, props.phrase)}>
          {(row) => {
            switch (row.type) {
              case "Task":
                return (
                  <li class="py-4 first:pt-0 last:pb-0">
                    <TaskRow
                      title={row.title}
                      details={row.details}
                      date={row.date}
                      onClick={() => props.setView({ type: "TaskEditor", taskId: row.taskId })}
                    />
                  </li>
                );
              case "RepeatingTask":
                return (
                  <li class="py-4 first:pt-0 last:pb-0">
                    <RepeatingTaskRow
                      title={row.title}
                      details={row.details}
                      date={row.date}
                      onClick={() => props.setView({ type: "RepeatingTaskEditor", repeatingTaskId: row.repeatingTaskId })}
                    />
                  </li>
                );
              case "CompletedTask":
                return (
                  <li class="py-4 first:pt-0 last:pb-0">
                    <CompletedTaskRow
                      title={row.title}
                      completedAt={row.completedAt}
                      onClick={() => props.setView({ type: "TaskEditor", taskId: row.taskId })}
                    />
                  </li>
                );
            }
          }}
        </For>
      </ul>
    </main>
  );
}

function searchRows(data: UserData, phrase: string): SearchRow[] {
  const taskRows: SearchRow[] = Object.entries(data.tasks)
    .map(([taskId, task]) =>
      task.completedAt === null
        ? { type: "Task", taskId, title: task.title, details: task.details, date: task.date }
        : { type: "CompletedTask", taskId, title: task.title, details: task.details, date: task.date, completedAt: task.completedAt }
    );
  const repeatingTaskRows: SearchRow[] = Object.entries(data.repeatingTasks)
    .map(([repeatingTaskId, repeatingTask]) => ({
      type: "RepeatingTask",
      repeatingTaskId,
      title: repeatingTask.title,
      details: repeatingTask.details,
      date: repeatingTask.schedule.nextDate,
    }));
  return [...taskRows, ...repeatingTaskRows]
    .filter((row) => containsSearchPhrase(row.title, phrase) || containsSearchPhrase(row.details, phrase))
    // Show all open tasks before all completed tasks.
    // Within each status, order tasks by date.
    // Within each date, show non-repeating tasks before repeating tasks.
    // Within each task type, order tasks by title alphabetically.
    .sort((left, right) => {
      if (left.type === "CompletedTask") {
        if (right.type !== "CompletedTask") return 1;
        return left.date.localeCompare(right.date) || left.title.localeCompare(right.title);
      }
      if (right.type === "CompletedTask") return -1;
      const dateOrder = left.date.localeCompare(right.date);
      if (dateOrder !== 0) return dateOrder;
      if (left.type !== right.type) return left.type === "Task" ? -1 : 1;
      return left.title.localeCompare(right.title);
    });
}

type ScheduleRow =
  | { type: "Task"; taskId: string; title: string; details: string; date: TaskDate; }
  | { type: "RepeatingTask"; repeatingTaskId: string; title: string; details: string; date: TaskDate; };

function ScheduleList(props: {
  userData: UserData;
  setView: (view: View) => void;
}) {
  const today = useContext(TodayContext);
  return (
    <main class="px-4 mx-auto w-full max-w-lg">
      <ul role="list" class="divide-y divide-border px-4">
        <For each={scheduleRows(props.userData, today())}>
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

function scheduleRows(data: UserData, today: TaskDate): ScheduleRow[] {
  const taskRows: ScheduleRow[] = Object.entries(data.tasks)
    .flatMap(([taskId, task]) =>
      task.completedAt === null
        ? [{ type: "Task", taskId, title: task.title, details: task.details, date: task.date }]
        : []
    );
  const repeatingTaskRows: ScheduleRow[] = Object.entries(data.repeatingTasks)
    .flatMap(([repeatingTaskId, repeatingTask]) =>
      occurrenceDates(repeatingTask.schedule, taskDateOneYearAfter(today))
        .map((date) => ({ type: "RepeatingTask", repeatingTaskId, title: repeatingTask.title, details: repeatingTask.details, date }))
    );
  // Order tasks by date.
  // Within each date, show non-repeating tasks before repeating tasks.
  // Within each task type, order tasks by title alphabetically.
  return [...taskRows, ...repeatingTaskRows].sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date);
    if (dateOrder !== 0) return dateOrder;
    if (left.type !== right.type) return left.type === "Task" ? -1 : 1;
    return left.title.localeCompare(right.title);
  });
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
      <ul role="list" class="divide-y divide-border px-4">
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
  // Order tasks by date.
  // Within each date, show non-repeating tasks before repeating tasks.
  // Within each task type, order tasks by title alphabetically.
  return [...taskRows, ...repeatingTaskRows].sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date);
    if (dateOrder !== 0) return dateOrder;
    if (left.type !== right.type) return left.type === "Task" ? -1 : 1;
    return left.title.localeCompare(right.title);
  });
}

type CompletedRow = { taskId: string; title: string; completedAt: Timestamp; };

function CompletedList(props: {
  userData: UserData;
  setView: (view: View) => void;
}) {
  return (
    <main class="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] mx-auto w-full max-w-lg">
      <p class="px-4 pb-4 text-center text-sm text-foreground-muted">Tasks are automatically deleted one year after completion.</p>
      <ul role="list" class="divide-y divide-border px-4">
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
  // Order tasks by completion time, most recently completed first.
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
  const today = useContext(TodayContext);
  return (
    <button
      class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 text-left cursor-pointer"
      type="button"
      onClick={props.onClick}
    >
      <span class="truncate" classList={{ "text-foreground-muted": !props.title }}>
        {props.title || "Empty title"}
      </span>
      <time class="text-foreground-muted" dateTime={props.date}>{formatTaskDate(props.date, today())}</time>
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
  const today = useContext(TodayContext);
  return (
    <button
      class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 text-left cursor-pointer"
      type="button"
      onClick={props.onClick}
    >
      <span class="truncate" classList={{ "text-foreground-muted": !props.title }}>
        {props.title || "Empty title"}
      </span>
      <span class="text-foreground-muted">
        <span role="img" aria-label="Repeating task">↻</span> <time dateTime={props.date}>{formatTaskDate(props.date, today())}</time>
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
  const today = useContext(TodayContext);
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
        Completed {formatTaskDate(taskDateFromDate(completedDate()), today())}
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
