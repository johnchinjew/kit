type NoticeProps = {
  message: string;
};

export default function Notice(props: NoticeProps) {
  return (
    <p role="alert" class="fixed z-20 inset-x-4 top-4 px-4 py-2.5 rounded-md bg-background text-foreground border border-border">
      {props.message}
    </p>
  );
}
