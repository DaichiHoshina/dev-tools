import { useMemo, useRef, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, MySQL } from "@codemirror/lang-sql";
import { autocompletion, acceptCompletion } from "@codemirror/autocomplete";
import { keymap } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
type Props = {
  value: string;
  onChange: (value: string) => void;
  onExecute: (selectedText?: string) => void;
  schema?: Record<string, string[]>;
};

export default function SqlEditor({
  value,
  onChange,
  onExecute,
  schema,
}: Props) {
  const onExecuteRef = useRef(onExecute);
  useEffect(() => {
    onExecuteRef.current = onExecute;
  }, [onExecute]);

  const sqlExtension = useMemo(
    () => sql({ dialect: MySQL, schema, upperCaseKeywords: true }),
    [schema],
  );

  const completionExtension = useMemo(
    () =>
      autocompletion({
        activateOnTyping: true,
        activateOnCompletion: () => true,
        interactionDelay: 30,
      }),
    [],
  );

  const tabAcceptKeymap = useMemo(
    () => keymap.of([{ key: "Tab", run: acceptCompletion }]),
    [],
  );

  const executeKeymap = useMemo(
    () =>
      keymap.of([
        {
          key: "Mod-Enter",
          run: (view) => {
            const selection = view.state.selection.main;
            if (selection.from !== selection.to) {
              onExecuteRef.current(
                view.state.sliceDoc(selection.from, selection.to),
              );
            } else {
              onExecuteRef.current();
            }
            return true;
          },
        },
      ]),
    [],
  );

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Editor */}
      <div className="flex-1 min-h-0">
        <CodeMirror
          value={value}
          onChange={onChange}
          extensions={[
            sqlExtension,
            completionExtension,
            tabAcceptKeymap,
            executeKeymap,
            EditorView.lineWrapping,
          ]}
          theme="light"
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            bracketMatching: true,
            autocompletion: false,
            foldGutter: true,
          }}
          className="h-full"
        />
      </div>

      {/* Hint bar */}
      {!value && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-ctp-surface2 space-y-2">
            <p className="text-sm font-medium">Enter SQL query</p>
            <div className="flex items-center gap-3 text-xs">
              <span>
                <kbd>⌘</kbd> + <kbd>Enter</kbd> to run
              </span>
              <span className="text-ctp-surface1">|</span>
              <span>Select text for partial execution</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
