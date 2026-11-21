import type { JSX } from "solid-js";

type TextAreaProps = {
  name: string;
  value: string;
  readOnly?: boolean;
  onInput: JSX.EventHandlerUnion<HTMLTextAreaElement, InputEvent>;
};

export default function TextArea(props: TextAreaProps) {
  return (
    <textarea
      class="field-sizing-content min-h-[calc(4lh+1.25rem+2px)] w-full rounded-md border border-border bg-background px-4 py-2.5 text-base read-only:bg-border resize-y"
      rows="4"
      name={props.name}
      value={props.value}
      readOnly={props.readOnly}
      onInput={props.onInput}
    />
  );
}
