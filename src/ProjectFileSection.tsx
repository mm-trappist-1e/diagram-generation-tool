import { ChangeEvent, Dispatch, DragEvent, MouseEvent, useState } from "react";
import { stateToCsv } from "./lib/export";
import { jSONToState } from "./lib/StateValidator";
import { Actions, State } from "./reducer/reducer";
import { Upload } from "./svg/Upload";

const sanitizeFileNamePart = (value: string) => {
  const normalized = value.trim().replace(/[\\/:*?"<>|]+/g, "-");
  return normalized || "diagram";
};

const createFileName = (
  extension: "json" | "csv",
  prefix = "diagram"
): string => {
  const d = new Date();
  const year = d.getFullYear().toString().padStart(4, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const date = d.getDate().toString().padStart(2, "0");
  return `${sanitizeFileNamePart(prefix)}-${year}-${month}-${date}.${extension}`;
};

const downloadText = (
  event: MouseEvent<HTMLButtonElement>,
  content: string,
  mimeType: string,
  fileName: string
) => {
  event.preventDefault();

  const link = document.createElement("a");
  link.href = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
  link.download = fileName;
  link.click();
};

type Props = {
  dispatch: Dispatch<Actions>;
  workspaceName: string;
};

type ExportControlsProps = {
  state: State;
  fileNamePrefix?: string;
  className?: string;
};

const DownloadIcon = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3v11" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

export const ExportControls = ({
  state,
  fileNamePrefix,
  className = "",
}: ExportControlsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const downloadJson = (event: MouseEvent<HTMLButtonElement>) => {
    downloadText(
      event,
      JSON.stringify(state, null, 2),
      "text/json",
      createFileName("json", fileNamePrefix)
    );
    setIsOpen(false);
  };

  const downloadCsv = (event: MouseEvent<HTMLButtonElement>) => {
    downloadText(
      event,
      stateToCsv(state),
      "text/csv",
      createFileName("csv", fileNamePrefix)
    );
    setIsOpen(false);
  };

  return (
    <div
      className={`relative flex justify-end ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="ダウンロード"
        title="ダウンロード"
      >
        <DownloadIcon />
      </button>
      {isOpen ? (
        <div
          className="absolute right-0 top-full z-40 mt-1 min-w-40 overflow-hidden rounded border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
          role="menu"
        >
          <button
            type="button"
            onClick={downloadJson}
            className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 dark:text-slate-100 dark:hover:bg-slate-800"
            role="menuitem"
          >
            JSON
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-emerald-50 dark:text-slate-100 dark:hover:bg-slate-800"
            role="menuitem"
          >
            CSV
          </button>
        </div>
      ) : null}
    </div>
  );
};

export const ProjectFileSection = ({ dispatch, workspaceName }: Props) => {
  const upload = (file: File) => {
    const fileReader = new FileReader();

    fileReader.onerror = (e: ProgressEvent<FileReader>) => {
      console.log(e);
      alert(e.target?.error);
    };

    fileReader.onload = (e: ProgressEvent<FileReader>) => {
      const result = e.target!.result;
      if (typeof result !== "string") return;

      const state = jSONToState(result);
      if (!state) return;

      dispatch({
        type: "changeFullState",
        payload: { state },
      });
    };

    fileReader.readAsText(file, "UTF-8");
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    const file = event.target.files?.[0];
    if (!file) return;
    upload(file);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;
    upload(file);
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-2xl">読み込み</h2>

      <section className="flex flex-col justify-center gap-4 rounded-lg bg-white p-6">
        <label
          htmlFor="dropzone-file"
          onDrop={onDrop}
          onDragOver={(e: DragEvent<HTMLLabelElement>) => e.preventDefault()}
          className="flex h-48 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100"
        >
          <div className="flex flex-col items-center justify-center gap-2 text-gray-500">
            <Upload />
            <p className="text-sm font-semibold">クリックでアップロード</p>
            <p className="text-sm">またはドラッグ&ドロップしてください。</p>
            <p className="text-xs">
              JSON / 現在のワークスペース: {workspaceName || "名称未設定"}
            </p>
          </div>
          <input
            id="dropzone-file"
            type="file"
            accept="application/json,.json"
            onChange={onChange}
            className="hidden"
          />
        </label>
      </section>
    </section>
  );
};
