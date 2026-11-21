import type { JSX } from "solid-js";

type FieldsetProps = {
  legend: string;
  children: JSX.Element;
};

export default function Fieldset(props: FieldsetProps) {
  return (
    <fieldset>
      <legend class="mb-1 px-4 text-sm text-foreground-muted">{props.legend}</legend>
      {props.children}
    </fieldset>
  );
}
