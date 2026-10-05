import { createSignal, Show, type JSX } from "solid-js";
import type { SignedIn } from "./session";
import { decodeDate, oneYearFromToday, type TaskDate } from "./date";
import {
  completeTask,
  reopenTask,
  setTaskDate,
  setTaskTitle,
  type Task
} from "./userData";

type TaskDraft = {
  title: string;
  completed: boolean;
  date: string;
};

export default function Editor(props: {
  taskId: string;
  task: Task;
  session: SignedIn;
  showNotice: (message: string) => void;
  onBack: () => void;
}) {
  // Capture the task when the editor opens so unmodified fields don't overwrite remote edits
  const initialTask = props.task;
  const [draft, setDraft] = createSignal<TaskDraft>(initialTask);

  const onChangeTitle: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    if (props.task.completed) return;
    setDraft((current) => ({
      ...current,
      title: event.currentTarget.value
    }));
  };

  const onChangeDate: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    if (props.task.completed) return;
    setDraft((current) => ({
      ...current,
      date: event.currentTarget.value
    }));
  };

  const onClickBack: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    if (!saveDate()) return;
    saveTitle();
    props.onBack();
  };

  const onClickComplete: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    if (!saveDate()) return;
    saveTitle();
    void completeTask(props.session.user.id, props.taskId).catch(() => {
      props.showNotice("Could not complete task. Try again later.");
    });
    props.onBack();
  };

  const onClickReopen: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    void reopenTask(props.session.user.id, props.taskId).catch(() => {
      props.showNotice("Could not reopen task. Try again later.");
    });
    props.onBack();
  };

  function saveTitle() {
    if (!props.task.completed && draft().title !== initialTask.title) {
      void setTaskTitle(props.session.user.id, props.taskId, draft().title).catch(() => {
        props.showNotice("Could not save task. Try again later.");
      });
    }
  }

  function saveDate() {
    const date = draft().date;
    if (!props.task.completed && date !== initialTask.date) {
      let validatedDate: TaskDate;
      try {
        validatedDate = decodeDate(date);
      } catch {
        props.showNotice("A date is required.");
        return false;
      }
      if (validatedDate > oneYearFromToday()) {
        props.showNotice("The date cannot be more than 1 year in the future.");
        return false;
      }
      void setTaskDate(props.session.user.id, props.taskId, validatedDate).catch(() => {
        props.showNotice("Could not save task. Try again later.");
      });
    }
    return true;
  }

  return (
    <main>
      <button type="button" onClick={onClickBack}>
        Back
      </button>
      <input
        name="title"
        type="text"
        value={draft().title}
        readOnly={props.task.completed}
        onInput={onChangeTitle}
      />
      <input
        name="date"
        type="date"
        max={oneYearFromToday()}
        value={draft().date}
        readOnly={props.task.completed}
        onInput={onChangeDate}
      />
      <Show when={!props.task.completed}>
        <button type="button" onClick={onClickComplete}>
          Complete
        </button>
      </Show>
      <Show when={props.task.completed}>
        <button type="button" onClick={onClickReopen}>
          Reopen
        </button>
      </Show>
    </main>
  );
}
