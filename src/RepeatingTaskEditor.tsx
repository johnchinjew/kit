import TextButton from "./components/TextButton";
import { createSignal, type JSX } from "solid-js";
import { maxInterval, type IntervalUnit, type RepeatingTask, type Schedule } from "./repeatingTask";
import type { SignedIn } from "./session";
import { decodeTaskDate, taskDateOneYearFromToday, type TaskDate } from "./taskDate";
import {
  deleteRepeatingTask,
  setRepeatingTaskSchedule,
  setRepeatingTaskDetails,
  setRepeatingTaskTitle,
} from "./userData";

type RepeatingTaskDraft = {
  title: string;
  details: string;
  schedule: ScheduleDraft;
};

type ScheduleDraft = {
  nextDate: string;
  interval: number;
  intervalUnit: IntervalUnit;
  anchorDate: TaskDate;
};

export default function RepeatingTaskEditor(props: {
  repeatingTaskId: string;
  repeatingTask: RepeatingTask;
  session: SignedIn;
  showNotice: (message: string) => void;
  onBack: () => void;
}) {
  // Capture the repeating task when the editor opens so unmodified fields don't overwrite remote edits.
  const initialRepeatingTask = props.repeatingTask;
  const [draft, setDraft] = createSignal<RepeatingTaskDraft>(initialRepeatingTask);

  const onChangeTitle: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    setDraft((current) => ({
      ...current,
      title: event.currentTarget.value
    }));
  };

  const onChangeDetails: JSX.EventHandler<HTMLTextAreaElement, InputEvent> = (event) => {
    setDraft((current) => ({ ...current, details: event.currentTarget.value }));
  };

  const onChangeNextDate: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    setDraft((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        nextDate: event.currentTarget.value
      }
    }));
  };

  const onChangeIntervalUnit: JSX.EventHandler<HTMLSelectElement, Event> = (event) => {
    const intervalUnit = event.currentTarget.value as IntervalUnit;
    setDraft((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        intervalUnit,
        interval: Math.min(current.schedule.interval, maxInterval(intervalUnit))
      }
    }));
  };

  const onChangeInterval: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    setDraft((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        interval: event.currentTarget.valueAsNumber
      }
    }));
  };

  const onClickBack: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    if (!saveSchedule()) return;
    saveTitle();
    saveDetails();
    props.onBack();
  };

  const onClickDelete: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
    void deleteRepeatingTask(props.session.user.userId, props.repeatingTaskId).catch(() => {
      props.showNotice("Could not delete repeating task. Try again later.");
    });
    props.onBack();
  };

  function saveTitle() {
    const title = draft().title.trim();
    if (title !== initialRepeatingTask.title) {
      void setRepeatingTaskTitle(props.session.user.userId, props.repeatingTaskId, title).catch(() => {
        props.showNotice("Could not save repeating task. Try again later.");
      });
    }
  }

  function saveDetails() {
    const details = draft().details.trim();
    if (details !== initialRepeatingTask.details) {
      void setRepeatingTaskDetails(props.session.user.userId, props.repeatingTaskId, details).catch(() => {
        props.showNotice("Could not save repeating task. Try again later.");
      });
    }
  }

  // Validate and save schedule changes. Return false if the schedule is invalid.
  function saveSchedule() {
    const { nextDate, interval, intervalUnit, anchorDate } = draft().schedule;

    const nextDateChanged = nextDate !== initialRepeatingTask.schedule.nextDate;
    const intervalUnitChanged = intervalUnit !== initialRepeatingTask.schedule.intervalUnit;
    const intervalChanged = interval !== initialRepeatingTask.schedule.interval;
    const scheduleChanged = nextDateChanged || intervalUnitChanged || intervalChanged;
    if (!scheduleChanged) return true;

    let validatedNextDate: TaskDate;
    try {
      validatedNextDate = decodeTaskDate(nextDate);
    } catch {
      props.showNotice("A next date is required.");
      return false;
    }
    if (validatedNextDate > taskDateOneYearFromToday()) {
      props.showNotice("The next date cannot be more than 1 year in the future.");
      return false;
    }
    if (!Number.isInteger(interval) || interval < 1 || interval > maxInterval(intervalUnit)) {
      props.showNotice(`The interval must be a number from 1 to ${maxInterval(intervalUnit)}.`);
      return false;
    }

    const schedule: Schedule = {
      nextDate: validatedNextDate,
      interval,
      intervalUnit,
      anchorDate: nextDateChanged || intervalUnitChanged ? validatedNextDate : anchorDate,
    };
    void setRepeatingTaskSchedule(props.session.user.userId, props.repeatingTaskId, schedule).catch(() => {
      props.showNotice("Could not save repeating task. Try again later.");
    });
    return true;
  }

  return (
    <main class="mx-auto grid w-full max-w-lg gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div class="justify-self-start">
        <TextButton onClick={onClickBack}>
          ←
        </TextButton>
      </div>
      <label class="grid gap-1 text-sm">
        <span class="px-4 text-foreground-muted">Title</span>
        <input
          class="w-full rounded-md border border-border bg-background px-4 py-2.5 text-base"
          name="title"
          type="text"
          value={draft().title}
          onInput={onChangeTitle}
        />
      </label>
      <label class="grid gap-1 text-sm">
        <span class="px-4 text-foreground-muted">Details</span>
        <textarea
          class="w-full rounded-md border border-border bg-background px-4 py-2.5 text-base resize-y"
          rows="4"
          name="details"
          value={draft().details}
          onInput={onChangeDetails}
        />
      </label>
      <label class="grid gap-1 text-sm">
        <span class="px-4 text-foreground-muted">Repeats next on</span>
        <input
          class="w-full rounded-md border border-border bg-background px-4 py-2.5 text-base"
          name="nextDate"
          type="date"
          max={taskDateOneYearFromToday()}
          value={draft().schedule.nextDate}
          onInput={onChangeNextDate}
        />
      </label>
      <fieldset>
        <legend class="mb-1 px-4 text-sm text-foreground-muted">Repeats every</legend>
        <div class="grid grid-cols-2 gap-2">
          <input
            class="w-full rounded-md border border-border bg-background px-4 py-2.5 text-base"
            name="interval"
            type="number"
            min="1"
            max={maxInterval(draft().schedule.intervalUnit)}
            value={draft().schedule.interval}
            onInput={onChangeInterval}
          />
          <select
            class="w-full rounded-md border border-border bg-background px-4 py-2.5 text-base"
            name="intervalUnit"
            value={draft().schedule.intervalUnit}
            onChange={onChangeIntervalUnit}
          >
            <option value="Days">Days</option>
            <option value="Weeks">Weeks</option>
            <option value="Months">Months</option>
            <option value="Years">Years</option>
          </select>
        </div>
      </fieldset>
      <div class="justify-self-end">
        <TextButton onClick={onClickDelete}>
          Delete
        </TextButton>
      </div>
    </main>
  );
}
