import type { JSX } from "solid-js";

type ButtonProps = {
  children: JSX.Element;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
};

export default function Button(props: ButtonProps) {
  return (
    <button
      type="button"
      class="block w-full px-4 py-2.5 font-semibold rounded-md cursor-pointer bg-background text-foreground border border-border"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
