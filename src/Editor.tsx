import { createSignal, Show, type JSX } from "solid-js";
import type { SignedIn } from "./session";
import { completeTask, reopenTask, setTaskTitle, type Task } from "./userData";

export type TaskDraft = { id: string; task: Task; };

export default function Editor(props: {
  initialDraft: TaskDraft;
  session: SignedIn;
  showNotice: (message: string) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = createSignal<TaskDraft>(props.initialDraft);

  const onChangeTitle: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    if (props.initialDraft.task.completed) return;
    setDraft((current) => ({
      ...current,
      task: { ...current.task, title: event.currentTarget.value }
    }));
  };

  const onClickBack: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    saveTitle();
    props.onBack();
  };

  const onClickComplete: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    saveTitle();
    void completeTask(props.session.user.id, draft().id).catch(() => {
      props.showNotice("Could not complete task. Try again later.");
    });
    props.onBack();
  };

  const onClickReopen: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    void reopenTask(props.session.user.id, draft().id).catch(() => {
      props.showNotice("Could not reopen task. Try again later.");
    });
    props.onBack();
  };

  function saveTitle() {
    if (!props.initialDraft.task.completed && draft().task.title !== props.initialDraft.task.title) {
      void setTaskTitle(props.session.user.id, draft().id, draft().task.title).catch(() => {
        props.showNotice("Could not save task. Try again later.");
      });
    }
  }

  return (
    <main>
      <button type="button" onClick={onClickBack}>
        Back
      </button>
      <input
        name="title"
        type="text"
        value={draft().task.title}
        readOnly={props.initialDraft.task.completed}
        onInput={onChangeTitle}
      />
      <Show when={!props.initialDraft.task.completed}>
        <button type="button" onClick={onClickComplete}>
          Complete
        </button>
      </Show>
      <Show when={props.initialDraft.task.completed}>
        <button type="button" onClick={onClickReopen}>
          Reopen
        </button>
      </Show>
    </main>
  );
}
