import { ChangeEvent, KeyboardEvent, useState } from "react";

type Props = {
  placeholder: string;
  onEnterPress: (text: string) => void;
  addButtonLabel?: string;
};

export const TextInput = ({
  placeholder,
  onEnterPress,
  addButtonLabel,
}: Props) => {
  const [text, setText] = useState(``);
  const [isComposing, setIsComposing] = useState(false);
  const canSubmit = Boolean(text.match(/\S/g));
  const submitText = () => {
    if (!canSubmit) return;
    onEnterPress(text);
    setText(``);
  };

  const input = (
    <input
      type="text"
      value={text}
      placeholder={placeholder}
      className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500"
      onChange={(e: ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (isComposing) return;
        if (e.nativeEvent.isComposing) return;
        if (e.key !== `Enter`) return;
        submitText();
      }}
      onCompositionStart={() => {
        setIsComposing(true);
      }}
      onCompositionEnd={() => {
        setIsComposing(false);
      }}
    />
  );

  if (!addButtonLabel) return input;

  return (
    <div className="flex items-center gap-2">
      {input}
      <button
        type="button"
        disabled={!canSubmit}
        onClick={submitText}
        className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
      >
        {addButtonLabel}
      </button>
    </div>
  );
};
