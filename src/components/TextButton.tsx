import type { JSX } from "solid-js";

type TextButtonProps = {
  children: JSX.Element;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  variant?: "danger" | "subtle"; // Omit variant for the default appearance.
};

export default function TextButton(props: TextButtonProps) {
  return (
    <button
      type="button"
      class="block px-4 py-2.5 rounded-md cursor-pointer bg-background"
      classList={{
        "text-base text-foreground font-semibold": props.variant === undefined,
        "text-base text-danger font-semibold": props.variant === "danger",
        "text-sm text-foreground-muted": props.variant === "subtle",
      }}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}


