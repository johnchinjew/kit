import { Show } from "solid-js";
import { formatTaskDate, taskDateToday, type TaskDate } from "./taskDate";

export default function RepeatingTaskButton(props: {
  title: string;
  details: string;
  date: TaskDate;
  onClick: () => void;
}) {
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
        <span role="img" aria-label="Repeating task">↻</span> <time dateTime={props.date}>{formatTaskDate(props.date, taskDateToday())}</time>
      </span>
      <Show when={props.details}>
        <span class="col-span-2 truncate text-sm text-foreground-muted">{props.details}</span>
      </Show>
    </button>
  );
}
