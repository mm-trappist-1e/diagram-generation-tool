import { ChangeEvent, Dispatch } from "react";
import { Actions, State } from "./reducer/reducer";
import { TextInput } from "./TextInput";

type Props = {
  state: State;
  dispatch: Dispatch<Actions>;
};

export const StationMasterPanel = ({ state, dispatch }: Props) => (
  <aside className="flex min-w-0 flex-col gap-4 rounded-lg bg-white p-3 sm:p-4">
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold text-gray-800">Station</h2>
      <TextInput
        placeholder="駅名を追加"
        addButtonLabel="追加"
        onEnterPress={(name) =>
          dispatch({ type: "addStation", payload: { name } })
        }
      />
      <div className="flex flex-col gap-2">
        {state.stations.map((station) => {
          const isUsed = state.routeNodes.some(
            (routeNode) => routeNode.stationId === station.id
          );
          return (
            <div
              key={station.id}
              className="grid grid-cols-[minmax(0,1fr)_max-content] items-center gap-2"
            >
              <input
                type="text"
                value={station.name}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  dispatch({
                    type: "updateStation",
                    payload: { id: station.id, name: event.target.value },
                  })
                }
                className="min-w-0 rounded border border-gray-300 p-2 text-sm"
              />
              <button
                type="button"
                disabled={isUsed}
                title={isUsed ? "この駅を参照するノードがあります" : "駅を削除"}
                onClick={() =>
                  dispatch({
                    type: "removeStation",
                    payload: { id: station.id },
                  })
                }
                className="rounded bg-red-600 px-2 py-1 text-sm text-white disabled:bg-slate-300 disabled:text-slate-600 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
              >
                削除
              </button>
            </div>
          );
        })}
      </div>
    </section>
  </aside>
);
