import { createSignal, Show, type JSX } from "solid-js";
import { maxInterval, type IntervalUnit, type Schedule } from "./schedule";
import type { SignedIn } from "./session";
import { decodeTaskDate, taskDateOneYearFromToday, type TaskDate } from "./taskDate";
import {
  completeTask,
  setTaskSchedule,
  removeTaskSchedule,
  deleteTask,
  reopenTask,
  setTaskDate,
  setTaskDetails,
  setTaskTitle,
  type Task
} from "./userData";

type TaskDraft = {
  title: string;
  details: string;
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
  const currentDate = () => props.task.type === "RepeatingTask" ? props.task.schedule.nextDate : props.task.date;
  const initialDate = currentDate();
  const [draft, setDraft] = createSignal<TaskDraft>({ title: initialTask.title, details: initialTask.details, date: initialDate });

  const initialSchedule = initialTask.type === "RepeatingTask" ? initialTask.schedule : undefined;
  const currentSchedule = () => props.task.type === "RepeatingTask" ? props.task.schedule : undefined;
  const [unit, setUnit] = createSignal<IntervalUnit | "">(initialSchedule?.unit ?? "");
  const [dateTouched, setDateTouched] = createSignal(false);
  const [every, setEvery] = createSignal(initialSchedule?.every ?? 1);
  const readOnly = () => props.task.type === "NonRepeatingTask" && props.task.completedAt !== null;

  const onChangeTitle: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    if (readOnly()) return;
    setDraft((current) => ({
      ...current,
      title: event.currentTarget.value
    }));
  };

  const onChangeDetails: JSX.EventHandler<HTMLTextAreaElement, InputEvent> = (event) => {
    if (readOnly()) return;
    setDraft((current) => ({ ...current, details: event.currentTarget.value }));
  };

  const onChangeDate: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    if (readOnly()) return;
    const date = event.currentTarget.value;
    setDateTouched(true);
    setDraft((current) => ({
      ...current,
      date
    }));
  };

  const onClickBack: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    const saveSchedule = prepareScheduleSave();
    if (!saveSchedule) return;
    saveTitle();
    saveDetails();
    saveSchedule();
    props.onBack();
  };

  const onClickComplete: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    const saveSchedule = prepareScheduleSave();
    if (!saveSchedule) return;
    saveTitle();
    saveDetails();
    saveSchedule();
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

  const onClickDelete: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    void deleteTask(props.session.user.id, props.taskId).catch(() => {
      props.showNotice("Could not delete task. Try again later.");
    });
    props.onBack();
  };

  function saveTitle() {
    if (!readOnly() && draft().title !== initialTask.title) {
      void setTaskTitle(props.session.user.id, props.taskId, draft().title).catch(() => {
        props.showNotice("Could not save task. Try again later.");
      });
    }
  }

  function saveDetails() {
    if (!readOnly() && draft().details !== initialTask.details) {
      void setTaskDetails(props.session.user.id, props.taskId, draft().details).catch(() => {
        props.showNotice("Could not save task. Try again later.");
      });
    }
  }

  function prepareScheduleSave(): (() => void) | undefined {
    if (readOnly()) return () => {};
    const dateChanged = dateTouched() && (draft().date !== initialDate || draft().date !== currentDate());
    const intervalChanged = unit() !== (initialSchedule?.unit ?? "") || (unit() !== "" && every() !== (initialSchedule?.every ?? 1));
    if (!dateChanged && !intervalChanged) return () => {};
    let date: TaskDate;
    try {
      date = decodeTaskDate(dateChanged ? draft().date : currentDate());
    } catch {
      props.showNotice("A date is required.");
      return undefined;
    }
    if (date > taskDateOneYearFromToday()) {
      props.showNotice("The date cannot be more than 1 year in the future.");
      return undefined;
    }
    const selectedUnit = unit();
    if (selectedUnit && (!Number.isInteger(every()) || every() < 1 || every() > maxInterval(selectedUnit))) {
      props.showNotice("Choose a whole-number interval of no more than 1 year.");
      return undefined;
    }
    if (initialSchedule || currentSchedule() || selectedUnit) {
      const schedule: Schedule | null = selectedUnit ? {
        nextDate: date, every: every(), unit: selectedUnit,
        anchorDate: dateChanged ? date : initialSchedule?.anchorDate ?? date,
      } : null;
      return () => {
        void (schedule
          ? setTaskSchedule(props.session.user.id, props.taskId, schedule)
          : removeTaskSchedule(props.session.user.id, props.taskId, date)).catch(() => {
          props.showNotice("Could not save schedule. Try again later.");
        });
      };
    } else {
      return () => {
        void setTaskDate(props.session.user.id, props.taskId, date).catch(() => {
          props.showNotice("Could not save task. Try again later.");
        });
      };
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
        value={draft().title}
        readOnly={readOnly()}
        onInput={onChangeTitle}
      />
      <textarea
        name="details"
        value={draft().details}
        readOnly={readOnly()}
        onInput={onChangeDetails}
      />
      <label>{unit() ? "Next date" : "Date"}
      <input
        name="date"
        type="date"
        max={taskDateOneYearFromToday()}
        value={dateTouched() ? draft().date : currentDate()}
        readOnly={readOnly()}
        onInput={onChangeDate}
      />
      </label>
      <Show when={!readOnly()}>
        <label>Repeat
          <select name="repeat" value={unit()} onChange={(event) => { setUnit(event.currentTarget.value as IntervalUnit | ""); setEvery(1); }}>
            <option value="">Does not repeat</option>
            <option value="Days">Days</option>
            <option value="Weeks">Weeks</option>
            <option value="Months">Months</option>
            <option value="Years">Years</option>
          </select>
        </label>
        <Show when={unit()}>
          <label>Every <input name="interval" type="number" min="1" max={unit() ? maxInterval(unit() as IntervalUnit) : 1} value={every()} onInput={(event) => setEvery(event.currentTarget.valueAsNumber)} /> {unit().toLowerCase()}</label>
          <p>Repeats indefinitely.</p>
        </Show>
      </Show>
      <Show when={!readOnly() && !unit() && !currentSchedule()}>
        <button type="button" onClick={onClickComplete}>
          Complete
        </button>
      </Show>
      <Show when={readOnly()}>
        <button type="button" onClick={onClickReopen}>
          Reopen
        </button>
      </Show>
      <button type="button" onClick={onClickDelete}>
        Delete
      </button>
    </main>
  );
}
