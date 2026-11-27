import type { JSX } from "solid-js";

type TextButtonProps = {
  children: JSX.Element;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  variant?: "danger"; // Omit variant for the default appearance.
};

export default function TextButton(props: TextButtonProps) {
  return (
    <button
      type="button"
      class="block px-4 py-2.5 font-semibold rounded-md cursor-pointer bg-background"
      classList={{
        "text-danger": props.variant === "danger",
        "text-foreground": props.variant === undefined,
      }}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}


