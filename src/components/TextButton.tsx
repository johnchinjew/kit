import type { JSX } from "solid-js";

type TextButtonProps = {
  children: JSX.Element;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  danger?: boolean;
};

export default function TextButton(props: TextButtonProps) {
  return (
    <button
      type="button"
      class="block px-4 py-2.5 font-semibold rounded-md cursor-pointer bg-background"
      classList={{ "text-danger": props.danger, "text-foreground": !props.danger }}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}


