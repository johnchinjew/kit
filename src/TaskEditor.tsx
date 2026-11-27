import Field from "./components/Field";
import Input from "./components/Input";
import TextArea from "./components/TextArea";
import IconButton from "./components/IconButton";
import TextButton from "./components/TextButton";
import BottomBar from "./components/BottomBar";
import { createEffect, createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";
import RepeatingTaskEditor from "./RepeatingTaskEditor";
import type { RepeatingTask } from "./repeatingTask";
import { isSaveShortcut } from "./shortcuts";
import type { SignedIn } from "./session";
import type { Task } from "./task";
import { decodeTaskDate, taskDateOneYearFromToday, type TaskDate } from "./taskDate";
import {
  completeTask,
  deleteTask,
  reopenTask,
  setTaskDate,
  setTaskDetails,
  setTaskTitle,
} from "./userData";

type TaskDraft = {
  title: string;
  details: string;
  date: string;
};

export default function TaskEditor(props: {
  taskId: string;
  task: Task;
  repeatingTask?: RepeatingTask | undefined;
  session: SignedIn;
  showNotice: (message: string) => void;
  onBack: () => void;
}) {
  // Capture the task when the editor opens so unmodified fields don't overwrite remote edits.
  const initialTask = props.task;
  const [draft, setDraft] = createSignal<TaskDraft>(initialTask);
  const [showRepeatingTaskEditor, setShowRepeatingTaskEditor] = createSignal(false);

  createEffect(() => {
    // Close the editor when the repeating task is deleted by this or another client.
    if (!props.repeatingTask) setShowRepeatingTaskEditor(false);
  });

  const onChangeTitle: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    if (props.task.completedAt !== null) return;
    setDraft((current) => ({
      ...current,
      title: event.currentTarget.value
    }));
  };

  const onChangeDetails: JSX.EventHandler<HTMLTextAreaElement, InputEvent> = (event) => {
    if (props.task.completedAt !== null) return;
    setDraft((current) => ({ ...current, details: event.currentTarget.value }));
  };

  const onChangeDate: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    if (props.task.completedAt !== null) return;
    setDraft((current) => ({
      ...current,
      date: event.currentTarget.value
    }));
  };

  const saveAndBack = () => {
    if (!saveDate()) return;
    saveTitle();
    saveDetails();
    props.onBack();
  };

  onMount(() => {
    function onKeyDown(event: KeyboardEvent) {
      // If the repeating task editor is open, let it handle the shortcut instead.
      if (showRepeatingTaskEditor() || !isSaveShortcut(event)) return;
      event.preventDefault();
      saveAndBack();
    }

    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  const onClickComplete: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    if (!saveDate()) return;
    saveTitle();
    saveDetails();
    void completeTask(props.session.user.userId, props.taskId).catch(() => {
      props.showNotice("Could not complete task. Try again later.");
    });
    props.onBack();
  };

  const onClickReopen: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    void reopenTask(props.session.user.userId, props.taskId).catch(() => {
      props.showNotice("Could not reopen task. Try again later.");
    });
    props.onBack();
  };

  const onClickDelete: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    if (!window.confirm("Delete task?")) return;
    void deleteTask(props.session.user.userId, props.taskId).catch(() => {
      props.showNotice("Could not delete task. Try again later.");
    });
    props.onBack();
  };

  function saveTitle() {
    const title = draft().title.trim();
    if (props.task.completedAt === null && title !== initialTask.title) {
      void setTaskTitle(props.session.user.userId, props.taskId, title).catch(() => {
        props.showNotice("Could not save task. Try again later.");
      });
    }
  }

  function saveDetails() {
    const details = draft().details.trim();
    if (props.task.completedAt === null && details !== initialTask.details) {
      void setTaskDetails(props.session.user.userId, props.taskId, details).catch(() => {
        props.showNotice("Could not save task. Try again later.");
      });
    }
  }

  // Validate and save date changes for an incomplete task. Return false if the date is invalid.
  function saveDate() {
    const date = draft().date;
    if (props.task.completedAt === null && date !== initialTask.date) {
      let validatedDate: TaskDate;
      try {
        validatedDate = decodeTaskDate(date);
      } catch {
        props.showNotice("A date is required.");
        return false;
      }
      if (validatedDate > taskDateOneYearFromToday()) {
        props.showNotice("The date cannot be more than 1 year in the future.");
        return false;
      }
      void setTaskDate(props.session.user.userId, props.taskId, validatedDate).catch(() => {
        props.showNotice("Could not save task. Try again later.");
      });
    }
    return true;
  }

  return (
    <Show when={showRepeatingTaskEditor() && props.repeatingTask} fallback={
      <div class="min-h-dvh flex flex-col">
        <main class="mx-auto grid w-full max-w-lg gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <header class="flex justify-between">
            <IconButton aria-label={props.task.completedAt === null ? "Save" : "Back"} onClick={saveAndBack}>←</IconButton>
            <Show when={props.task.completedAt === null} fallback={
              <TextButton onClick={onClickReopen}>
                Reopen
              </TextButton>
            }>
              <TextButton onClick={onClickComplete}>
                Complete
              </TextButton>
            </Show>
          </header>
          <Field label="Title">
            <Input
              name="title"
              type="text"
              value={draft().title}
              readOnly={props.task.completedAt !== null}
              onInput={onChangeTitle}
            />
          </Field>
          <Field label="Details">
            <TextArea
              name="details"
              value={draft().details}
              readOnly={props.task.completedAt !== null}
              onInput={onChangeDetails}
            />
          </Field>
          <Field label="Date">
            <Input
              name="date"
              type="date"
              max={taskDateOneYearFromToday()}
              value={draft().date}
              readOnly={props.task.completedAt !== null}
              onInput={onChangeDate}
            />
          </Field>
          <div class="justify-self-end">
            <TextButton variant="danger" onClick={onClickDelete}>
              Delete
            </TextButton>
          </div>
        </main>
        <Show when={props.repeatingTask}>
          {(repeatingTask) => (
            <BottomBar>
              <TextButton variant="subtle" onClick={() => setShowRepeatingTaskEditor(true)}>
                Auto-created by <span class="font-semibold">{repeatingTask().title || "Empty title"}</span> <span role="img" aria-label="Repeating task">↻</span>
              </TextButton>
            </BottomBar>
          )}
        </Show>
      </div>
    }>
      {(repeatingTask) => (
        <RepeatingTaskEditor
          repeatingTaskId={props.task.repeatingTaskId!}
          repeatingTask={repeatingTask()}
          session={props.session}
          showNotice={props.showNotice}
          onBack={() => setShowRepeatingTaskEditor(false)}
        />
      )}
    </Show>
  );
}
