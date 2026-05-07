const updatedAt = "2026-05-08";
const author = {
  name: "TRAPPIST-1E",
  url: "https://github.com/mm-trappist-1e/diagram-generation-tool",
};

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
