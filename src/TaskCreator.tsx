import Field from "./components/Field";
import Fieldset from "./components/Fieldset";
import Input from "./components/Input";
import Select from "./components/Select";
import TextArea from "./components/TextArea";
import { createSignal, Show } from "solid-js";
import TextButton from "./components/TextButton";
import { maxInterval, type IntervalUnit } from "./repeatingTask";
import type { SignedIn } from "./session";
import { decodeTaskDate, taskDateOneYearFromToday, taskDateToday, type TaskDate } from "./taskDate";
import { createRepeatingTask, createTask } from "./userData";

export default function TaskCreator(props: {
  session: SignedIn;
  showNotice: (message: string) => void;
  onBack: () => void;
}) {
  const [title, setTitle] = createSignal("");
  const [details, setDetails] = createSignal("");
  const [repeats, setRepeats] = createSignal(false);
  const [date, setDate] = createSignal<string>(taskDateToday());
  const [interval, setInterval] = createSignal(1);
  const [intervalUnit, setIntervalUnit] = createSignal<IntervalUnit>("Days");

  function changeIntervalUnit(unit: IntervalUnit) {
    setIntervalUnit(unit);
    setInterval(Math.min(interval(), maxInterval(unit)));
  }

  function onClickBack() {
    let validatedDate: TaskDate;
    try {
      validatedDate = decodeTaskDate(date());
    } catch {
      props.showNotice("A date is required.");
      return;
    }
    if (validatedDate > taskDateOneYearFromToday()) {
      props.showNotice("The date cannot be more than 1 year in the future.");
      return;
    }

    if (repeats()) {
      if (!Number.isInteger(interval()) || interval() < 1 || interval() > maxInterval(intervalUnit())) {
        props.showNotice(`The interval must be a number from 1 to ${maxInterval(intervalUnit())}.`);
        return;
      }
      const schedule = { nextDate: validatedDate, anchorDate: validatedDate, interval: interval(), intervalUnit: intervalUnit() };
      void createRepeatingTask(props.session.user.userId, crypto.randomUUID(), title().trim(), details().trim(), schedule).catch(() => {
        props.showNotice("Could not create repeating task. Try again later.");
      });
    } else {
      void createTask(props.session.user.userId, crypto.randomUUID(), title().trim(), details().trim(), validatedDate).catch(() => {
        props.showNotice("Could not create task. Try again later.");
      });
    }
    props.onBack();
  }

  return (
    <main class="mx-auto grid w-full max-w-lg gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div class="flex justify-between">
        <TextButton onClick={onClickBack}>←</TextButton>
        <TextButton danger onClick={props.onBack}>Cancel</TextButton>
      </div>
      <Field label="Title">
        <Input
          name="title"
          type="text"
          value={title()}
          onInput={(event) => setTitle(event.currentTarget.value)}
        />
      </Field>
      <Field label="Details">
        <TextArea
          name="details"
          value={details()}
          onInput={(event) => setDetails(event.currentTarget.value)}
        />
      </Field>
      <label class="flex items-center gap-2 px-4">
        <input type="checkbox" checked={repeats()} onChange={(event) => setRepeats(event.currentTarget.checked)} />
        Repeats
      </label>
      <Field label={repeats() ? "Repeats next on" : "Date"}>
        <Input
          name="date"
          type="date"
          max={taskDateOneYearFromToday()}
          value={date()}
          onInput={(event) => setDate(event.currentTarget.value)}
        />
      </Field>
      <Show when={repeats()}>
        <Fieldset legend="Repeats every">
          <div class="grid grid-cols-2 gap-2">
            <Input
              name="interval"
              type="number"
              min="1"
              max={maxInterval(intervalUnit())}
              value={interval()}
              onInput={(event) => setInterval(event.currentTarget.valueAsNumber)}
            />
            <Select
              name="intervalUnit"
              value={intervalUnit()}
              onChange={(event) => changeIntervalUnit(event.currentTarget.value as IntervalUnit)}
            >
              <option value="Days">Days</option>
              <option value="Weeks">Weeks</option>
              <option value="Months">Months</option>
              <option value="Years">Years</option>
            </Select>
          </div>
        </Fieldset>
      </Show>
    </main>
  );
}
