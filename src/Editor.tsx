import { createSignal, Show, type JSX } from "solid-js";
import type { SignedIn } from "./session";
import { decodeTaskDate, taskDateOneYearFromToday, type TaskDate } from "./taskDate";
import {
  completeTask,
  reopenTask,
  setTaskDate,
  setTaskTitle,
  type Task
} from "./userData";

type TaskDraft = {
  title: string;
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
    if (props.task.completedAt !== null) return;
    setDraft((current) => ({
      ...current,
      title: event.currentTarget.value
    }));
  };

  const onChangeDate: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    if (props.task.completedAt !== null) return;
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
    if (props.task.completedAt === null && draft().title !== initialTask.title) {
      void setTaskTitle(props.session.user.id, props.taskId, draft().title).catch(() => {
        props.showNotice("Could not save task. Try again later.");
      });
    }
  }

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
        readOnly={props.task.completedAt !== null}
        onInput={onChangeTitle}
      />
      <input
        name="date"
        type="date"
        max={taskDateOneYearFromToday()}
        value={draft().date}
        readOnly={props.task.completedAt !== null}
        onInput={onChangeDate}
      />
      <Show when={props.task.completedAt === null}>
        <button type="button" onClick={onClickComplete}>
          Complete
        </button>
      </Show>
      <Show when={props.task.completedAt !== null}>
        <button type="button" onClick={onClickReopen}>
          Reopen
        </button>
      </Show>
    </main>
  );
}
