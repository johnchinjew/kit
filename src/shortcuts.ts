export function isSaveShortcut(event: KeyboardEvent): boolean {
  return event.key === "Enter" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.defaultPrevented &&
    !event.isComposing &&
    !event.repeat;
}
