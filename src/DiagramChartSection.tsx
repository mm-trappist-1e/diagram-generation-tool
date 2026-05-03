import {
  Chart as ChartJS,
  ChartData,
  ChartDataset,
  ChartOptions,
  LinearScale,
  LineElement,
  Legend,
  PointElement,
  SubTitle,
  TimeScale,
  Title,
  Tooltip,
} from "chart.js";
import { ja } from "date-fns/locale";
import "chartjs-adapter-date-fns";
import { ChangeEvent, useMemo, useState } from "react";
import { Scatter } from "react-chartjs-2";
import {
  colorToBackgroundRGBA,
  colorToRGBA,
  getThemeTrainColor,
} from "./lib/Color";
import {
  getOrderedRouteNodes,
  getRouteNodeLabel,
  isValidTimeString,
  LineStyle,
  routeNodeTypeLabels,
  timeStringToDate,
  TrainRun,
} from "./lib/domain";
import { State } from "./reducer/reducer";

ChartJS.register(
  TimeScale,
  LinearScale,
  PointElement,
  LineElement,
  Legend,
  Title,
  SubTitle,
  Tooltip
);

type XY = { x: number; y: number };

const lineStyleBorderDash = (
  lineStyle: LineStyle,
  runType: TrainRun["runType"]
) => {
  const effectiveLineStyle =
    lineStyle === "auto"
      ? (
          {
            passenger: "solid",
            deadhead: "dashed",
            freight: "dotted",
            test: "dashDot",
          } satisfies Record<TrainRun["runType"], Exclude<LineStyle, "auto">>
        )[runType]
      : lineStyle;

  switch (effectiveLineStyle) {
    case "solid":
      return [];
    case "dashed":
      return [8, 6];
    case "dotted":
      return [2, 4];
    case "dashDot":
      return [10, 4, 2, 4];
    case "longDash":
      return [14, 6];
  }
};

const stopEventsToXY = (trainRun: TrainRun, state: State): XY[] => {
  const routeNodeIndexById = new Map(
    getOrderedRouteNodes(state.routeNodes, state.routeReadDirection).map(
      (routeNode, index) => [routeNode.id, index]
    )
  );

  const events = trainRun.stops.flatMap((stop) => {
    if (stop.status === "unset") return [];
    const y = routeNodeIndexById.get(stop.routeNodeId);
    if (y === undefined) return [];

    if (stop.status === "pass") {
      const time = stop.arrivalTime || stop.departureTime;
      return isValidTimeString(time) && time ? [{ time, y }] : [];
    }

    const stopEvents = [];
    if (isValidTimeString(stop.arrivalTime) && stop.arrivalTime) {
      stopEvents.push({ time: stop.arrivalTime, y });
    }
    if (isValidTimeString(stop.departureTime) && stop.departureTime) {
      stopEvents.push({ time: stop.departureTime, y });
    }
    return stopEvents;
  });

  let dayOffset = 0;
  let previousTime = 0;
  return events.map((event, index) => {
    let x = timeStringToDate(event.time, dayOffset);
    while (index !== 0 && x.getTime() < previousTime) {
      dayOffset += 1;
      x = timeStringToDate(event.time, dayOffset);
    }
    previousTime = x.getTime();
    return { x: x.getTime(), y: event.y };
  });
};

const repeatXY = (data: XY[], repeat: number): XY[] => {
  if (data.length < 2 || repeat <= 1) return data;

  const startTimeMS = data[0].x;
  const endTimeMS = data[data.length - 1].x;
  const intervalMS = endTimeMS - startTimeMS;
  if (intervalMS <= 0) return data;

  return Array.from({ length: repeat }).flatMap((_, repeatIndex) =>
    data.map((xy) => ({
      x: xy.x + intervalMS * repeatIndex,
      y: xy.y,
    }))
  );
};

const formatChartTimeTick = (value: string | number) => {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "";
  const baseTime = timeStringToDate("00:00").getTime();
  const dayOffset = Math.max(
    0,
    Math.floor((date.getTime() - baseTime) / 86_400_000)
  );
  const time = `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
  return dayOffset > 0 ? `${dayOffset}．${time}` : time;
};

const trainRunsToChartDatasets = (
  state: State,
  isDarkTheme: boolean
): ChartDataset<"scatter">[] =>
  state.trainRuns.map((trainRun): ChartDataset<"scatter"> => {
    const data = repeatXY(stopEventsToXY(trainRun, state), trainRun.repeat);
    const themedColor = getThemeTrainColor(trainRun.color, isDarkTheme);
    const color = colorToRGBA(themedColor);
    return {
      label: trainRun.name,
      data,
      borderColor: color,
      backgroundColor: colorToBackgroundRGBA(themedColor),
      pointBorderColor: color,
      borderDash: lineStyleBorderDash(trainRun.lineStyle, trainRun.runType),
      borderWidth: trainRun.runType === "passenger" ? 2.25 : 1.75,
      showLine: true,
    };
  });

type Props = { state: State; isDarkTheme: boolean };

export const DiagramChartSection = ({ state, isDarkTheme }: Props) => {
  const [height, setHeight] = useState<number>(60);
  const chartBackgroundColor = isDarkTheme ? "#020617" : "#ffffff";
  const chartTextColor = isDarkTheme ? "#f8fafc" : "#334155";
  const chartGridColor = isDarkTheme ? "#475569" : "#e2e8f0";

  const orderedRouteNodes = useMemo(
    () => getOrderedRouteNodes(state.routeNodes, state.routeReadDirection),
    [state.routeNodes, state.routeReadDirection]
  );

  const yLabels = useMemo(
    () =>
      orderedRouteNodes.map((routeNode) => {
        const label = getRouteNodeLabel(state.stations, routeNode);
        if (routeNode.type === "station") return label;
        return `${label} (${routeNodeTypeLabels[routeNode.type]})`;
      }),
    [orderedRouteNodes, state.stations]
  );

  const options: ChartOptions<"scatter"> = {
    scales: {
      x: {
        type: "time",
        time: {
          unit: "hour",
          displayFormats: {
            hour: "HH:mm",
          },
        },
        ticks: {
          stepSize: 1,
          callback: formatChartTimeTick,
          color: chartTextColor,
        },
        grid: {
          color: chartGridColor,
        },
        adapters: {
          date: {
            locale: ja,
          },
        },
      },
      y: {
        type: "linear",
        min: -0.5,
        max: Math.max(0.5, yLabels.length - 0.5),
        reverse: true,
        afterBuildTicks: (axis) => {
          axis.ticks = yLabels.map((_, index) => ({ value: index }));
        },
        ticks: {
          autoSkip: false,
          precision: 0,
          stepSize: 1,
          color: chartTextColor,
          callback: (value) => {
            const index = Number(value);
            if (!Number.isInteger(index)) return "";
            return yLabels[index] ?? "";
          },
        },
        grid: {
          color: chartGridColor,
        },
      },
    },
    elements: {
      point: {
        radius: 2,
      },
    },
    plugins: {
      legend: {
        labels: {
          color: chartTextColor,
        },
      },
    },
    maintainAspectRatio: false,
  };

  const data: ChartData<"scatter"> = {
    datasets: trainRunsToChartDatasets(state, isDarkTheme),
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-2xl">ダイヤグラム</h2>
      <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center">
        <p className="shrink-0">グラフの高さ:</p>
        <input
          type="range"
          min="30"
          max="100"
          value={height}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setHeight(parseInt(e.target.value))
          }
          className="grow"
        />
      </div>
      <div className="overflow-x-auto">
        <div
          className="box-border min-w-[680px] pr-6"
          style={{ height: `${height}vh` }}
        >
          <Scatter
            key={isDarkTheme ? "dark-chart" : "light-chart"}
            options={options}
            data={data}
            plugins={[
              {
                id: "custom_canvas_background_color",
                beforeDraw: (chart) => {
                  const { ctx } = chart;
                  ctx.save();
                  ctx.globalCompositeOperation = "destination-over";
                  ctx.fillStyle = chartBackgroundColor;
                  ctx.fillRect(0, 0, chart.width, chart.height);
                  ctx.restore();
                },
              },
            ]}
            className="rounded-xl"
          />
        </div>
      </div>
    </section>
  );
};
