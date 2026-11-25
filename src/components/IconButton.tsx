import type { JSX } from "solid-js";

type IconButtonProps = {
  children: JSX.Element;
  "aria-label": string;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
};

export default function IconButton(props: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={props["aria-label"]}
      class="block px-4 py-2.5 font-semibold rounded-md cursor-pointer bg-background"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
