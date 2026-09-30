import { createSignal, onCleanup } from "solid-js";

export function createNotice() {
  const [notice, setNotice] = createSignal<string | null>(null);

  let timeout: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => clearTimeout(timeout));

  function showNotice(message: string) {
    clearTimeout(timeout);
    setNotice(message);
    timeout = setTimeout(() => setNotice(null), 6000);
  }

  return { notice, showNotice };
}
