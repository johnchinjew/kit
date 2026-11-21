import type { JSX } from "solid-js";

type InputProps = {
  name: string;
  type: "text" | "number" | "date";
  value: string | number;
  min?: string | number;
  max?: string | number;
  readOnly?: boolean;
  onInput: JSX.EventHandlerUnion<HTMLInputElement, InputEvent>;
};

export default function Input(props: InputProps) {
  return (
    <input
      class="w-auto justify-self-stretch rounded-md border border-border bg-background px-4 py-2.5 text-base read-only:bg-border"
      name={props.name}
      type={props.type}
      value={props.value}
      min={props.min}
      max={props.max}
      readOnly={props.readOnly}
      onInput={props.onInput}
    />
  );
}
