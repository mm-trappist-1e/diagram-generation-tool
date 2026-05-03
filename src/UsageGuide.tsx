const updatedAt = "2026-05-03";
const author = {
  name: "TRAPPIST-1E",
  url: "https://github.com/mm-trappist-1e/diagram-generation-tool",
};

const sections = [
  {
    title: "1. ワークスペース",
    items: [
      "ワークスペースを新規作成すると、現在のデータを残したまま空の編集環境を開始できます。",
      "Download JSON と Export CSV は、現在選択中のワークスペースの内容だけを出力します。",
      "保存した JSON は下部の読み込み欄から現在のワークスペースへ復元されます。",
    ],
  },
  {
    title: "2. 駅と路線図",
    items: [
      "Station で駅名を追加し、右側のノード追加から駅・車庫・留置線などを配置します。",
      "行き止まり側だけ接続点を出す場合は、ノード編集で終端を有効にします。立体交差駅は水平終端・垂直終端を別々に指定できます。",
      "ノードはドラッグで移動し、円形ボタンで回転・裏返しできます。接続点同士は Ctrl + ドラッグで接続します。",
      "Shift + 左ドラッグで範囲選択し、Delete / Backspace または Ctrl + 右クリックでまとめて削除できます。",
    ],
  },
  {
    title: "3. 分岐と接続線",
    items: [
      "接続線は Shift + 左クリックで選択します。",
      "選択した接続線には Ctrl + Shift + 左ドラッグで分岐器を挿入できます。ドラッグ中の位置と離す側で初期向きが決まります。",
      "Ctrl + Shift + 左クリックで単独の分岐器を配置できます。分岐器の形状や反転はノード編集で変更できます。",
    ],
  },
  {
    title: "4. 所要時間",
    items: [
      "所要時間の設定モードで、開始接続点、中継する分岐、終端接続点の順に選択します。",
      "設定済み区間はクリックで選び、所要時間や進行方向を調整します。",
      "分岐を含む区間では、分岐間の時間配分を必要に応じて調整できます。",
    ],
  },
  {
    title: "5. 経路セットと列車",
    items: [
      "経路設定モードでは、キャンバス上の駅・車庫ノードを番線ごとにクリックして営業経路を作ります。",
      "回送経路を使う場合は、経路セット側で回送経路を有効にして指定します。",
      "列車には経路セット、営業時間、回送時間、停車/通過設定を指定します。時刻は所要時間から自動計算されます。",
    ],
  },
  {
    title: "6. 保存と出力",
    items: [
      "編集内容はワークスペース単位でブラウザ内に自動保存されます。",
      "公開環境や別端末へ移す場合は、対象ワークスペースを選んで Download JSON で保存してください。",
      "Export CSV でダイヤグラム用の時刻データを出力できます。",
    ],
  },
];

export const UsageGuide = () => (
  <section className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
    <details>
      <summary className="cursor-pointer select-none text-base font-semibold text-slate-900 dark:text-slate-100">
        操作方法
      </summary>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {sections.map((section) => (
          <section
            key={section.title}
            className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900"
          >
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              {section.title}
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  </section>
);

export const SiteMetaFooter = () => (
  <footer className="px-4 pb-1 text-right text-xs text-slate-400 dark:text-slate-500">
    <span>更新日: {updatedAt}</span>
    <span className="mx-2">/</span>
    <span>
      作者:{" "}
      <a
        href={author.url}
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-slate-500 dark:hover:text-slate-300"
      >
        {author.name}
      </a>
    </span>
  </footer>
);
