import { ExternalLink } from "lucide-react";
import { toolCategories } from "../data/tools";

export function ToolList() {
  return (
    <div>
      <div className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          運用ツール一覧
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          各環境の運用ツールへのリンク
        </p>
      </div>
      <div className="space-y-10">
        {toolCategories.map((category) => (
          <div key={category.name}>
            <h2 className="text-base font-semibold text-foreground mb-4">
              {category.name}
            </h2>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full caption-bottom text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="h-11 px-5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      ツール
                    </th>
                    <th className="h-11 px-5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      説明
                    </th>
                    <th className="h-11 px-5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      dev
                    </th>
                    <th className="h-11 px-5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      tes
                    </th>
                    <th className="h-11 px-5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      prd
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {category.tools.map((tool) => (
                    <tr
                      key={tool.name}
                      className="border-b border-border/50 last:border-0 hover:bg-accent/50 transition-colors"
                    >
                      <td className="px-5 py-4 font-medium text-sm">
                        {tool.name}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground text-sm">
                        {tool.description}
                      </td>
                      {(["dev", "tes", "prd"] as const).map((env) => (
                        <td key={env} className="px-5 py-4 text-center">
                          {tool.urls[env] ? (
                            <a
                              href={tool.urls[env]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm text-foreground hover:text-primary transition-colors"
                            >
                              開く
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground/20">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
