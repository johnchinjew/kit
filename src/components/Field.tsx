import type { JSX } from "solid-js";

type FieldProps = {
  label: string;
  children: JSX.Element;
};

export default function Field(props: FieldProps) {
  return (
    <label class="grid gap-1 text-sm">
      <span class="px-4 text-foreground-muted">{props.label}</span>
      {props.children}
    </label>
  );
}
