import { ChangeEvent, Dispatch, DragEvent, MouseEvent } from "react";
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

export const ExportControls = ({
  state,
  fileNamePrefix,
  className = "",
}: ExportControlsProps) => {
  const downloadJson = (event: MouseEvent<HTMLButtonElement>) => {
    downloadText(
      event,
      JSON.stringify(state, null, 2),
      "text/json",
      createFileName("json", fileNamePrefix)
    );
  };

  const downloadCsv = (event: MouseEvent<HTMLButtonElement>) => {
    downloadText(
      event,
      stateToCsv(state),
      "text/csv",
      createFileName("csv", fileNamePrefix)
    );
  };

  return (
    <div className={`flex flex-wrap justify-end gap-2 ${className}`}>
      <button
        type="button"
        onClick={downloadJson}
        className="flex-1 rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 sm:flex-none"
      >
        Download JSON
      </button>
      <button
        type="button"
        onClick={downloadCsv}
        className="flex-1 rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 sm:flex-none"
      >
        Export CSV
      </button>
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
