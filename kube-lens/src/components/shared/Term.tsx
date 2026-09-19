import { K8S_GLOSSARY } from "~/lib/glossary";
import { Tooltip } from "./Tooltip";

interface Props {
  /** 辞書キー（K8S_GLOSSARYに存在する用語） */
  k: string;
  /** 表示テキスト（省略時はkをそのまま表示） */
  children?: string;
}

/** K8s用語をツールチップ付きで表示 */
export function Term({ k, children }: Props) {
  const desc = K8S_GLOSSARY[k];
  if (!desc) return <span>{children ?? k}</span>;

  return (
    <Tooltip text={desc}>
      <span class="term-text">{children ?? k}</span>
    </Tooltip>
  );
}
