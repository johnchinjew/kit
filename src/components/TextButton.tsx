import type { JSX } from "solid-js";

type TextButtonProps = {
  children: JSX.Element;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
};

export default function TextButton(props: TextButtonProps) {
  return (
    <button
      type="button"
      class="w-full px-4 py-2.5 font-semibold rounded-md cursor-pointer bg-background text-foreground"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}


