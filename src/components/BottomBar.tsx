import type { JSX } from "solid-js";

type BottomBarProps = {
  children: JSX.Element;
};

export default function BottomBar(props: BottomBarProps) {
  return (
    <div class="order-last isolate sticky bottom-0 mt-auto mx-auto flex w-full max-w-lg justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] before:content-[''] before:absolute before:inset-0 before:-top-8 before:-z-10 before:pointer-events-none before:bg-background before:mask-[linear-gradient(to_bottom,transparent,rgb(0_0_0/70%)_1.5rem,rgb(0_0_0/90%)_2.25rem,black_3rem)]">
      {props.children}
    </div>
  );
}
