import { createSignal, type JSX } from "solid-js";
import type { SignedIn } from "./session";
import { setTaskTitle, type Task } from "./userData";

export type TaskDraft = { id: string; task: Task; };

export default function Editor(props: {
  initialDraft: TaskDraft;
  session: SignedIn;
  showNotice: (message: string) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = createSignal<TaskDraft>(props.initialDraft);

  const onChangeTitle: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    setDraft((current) => ({
      ...current,
      task: { ...current.task, title: event.currentTarget.value }
    }));
  };

  const onClickBack: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    if (draft().task.title !== props.initialDraft.task.title) {
      void setTaskTitle(props.session.user.id, draft().id, draft().task.title).catch(() => {
        props.showNotice("Could not save task. Try again later.");
      });
    }
    props.onBack();
  };

  return (
    <main>
      <button type="button" onClick={onClickBack}>
        Back
      </button>
      <input
        name="title"
        type="text"
        value={draft().task.title}
        onInput={onChangeTitle}
      />
    </main>
  );
}
