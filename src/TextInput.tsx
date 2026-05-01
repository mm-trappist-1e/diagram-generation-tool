import { ChangeEvent, KeyboardEvent, useState } from "react";

type Props = {
  placeholder: string;
  onEnterPress: (text: string) => void;
};

export const TextInput = ({ placeholder, onEnterPress }: Props) => {
  const [text, setText] = useState(``);
  const [isComposing, setIsComposing] = useState(false);

  return (
    <input
      type="text"
      value={text}
      placeholder={placeholder}
      className="rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500"
      onChange={(e: ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (isComposing) return;
        if (e.nativeEvent.isComposing) return;
        if (e.key !== `Enter`) return;
        if (!text.match(/\S/g)) return; // Ignore if text is empty or only contains whitespaces.

        onEnterPress(text);
        setText(``);
      }}
      onCompositionStart={() => {
        setIsComposing(true);
      }}
      onCompositionEnd={() => {
        setIsComposing(false);
      }}
    />
  );
};
