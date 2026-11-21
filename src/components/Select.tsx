import type { JSX } from "solid-js";

type SelectProps = {
  name: string;
  value: string;
  children: JSX.Element;
  onChange: JSX.EventHandlerUnion<HTMLSelectElement, Event>;
};

export default function Select(props: SelectProps) {
  return (
    <select
      class="w-full rounded-md border border-border bg-background px-4 py-2.5 text-base"
      name={props.name}
      value={props.value}
      onChange={props.onChange}
    >
      {props.children}
    </select>
  );
}
