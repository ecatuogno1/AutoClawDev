import {
  COMMAND_PRIORITY_LOW,
  KEY_ENTER_COMMAND,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
} from "lexical";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  type MutableRefObject,
  useRef,
} from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { cn } from "@/lib/cn";

export interface ComposerPromptEditorHandle {
  focusAtEnd: () => void;
}

interface ComposerPromptEditorProps {
  value: string;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

function SetEditorRefPlugin({
  onReady,
}: {
  onReady: (editor: ReturnType<typeof useLexicalComposerContext>[0]) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    onReady(editor);
  }, [editor, onReady]);

  return null;
}

function EditableSyncPlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  return null;
}

function SubmitOnEnterPlugin({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: () => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (disabled || event?.shiftKey || event?.isComposing) {
          return false;
        }

        event?.preventDefault();
        onSubmit();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [disabled, editor, onSubmit]);

  return null;
}

function ValueSyncPlugin({
  value,
  syncingRef,
}: {
  value: string;
  syncingRef: MutableRefObject<boolean>;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.update(() => {
      const current = $getRoot().getTextContent();
      if (current === value) {
        syncingRef.current = false;
        return;
      }

      syncingRef.current = true;
      const root = $getRoot();
      root.clear();

      if (value.length === 0) {
        syncingRef.current = false;
        return;
      }

      for (const line of value.split(/\r?\n/)) {
        const paragraph = $createParagraphNode();
        if (line.length > 0) {
          paragraph.append($createTextNode(line));
        }
        root.append(paragraph);
      }

      syncingRef.current = false;
    });
  }, [editor, syncingRef, value]);

  return null;
}

export const ComposerPromptEditor = forwardRef<
  ComposerPromptEditorHandle,
  ComposerPromptEditorProps
>(function ComposerPromptEditor(
  { className, disabled = false, onChange, onSubmit, placeholder, value },
  ref,
) {
  const editorRef = useRef<ReturnType<typeof useLexicalComposerContext>[0] | null>(null);
  const syncingRef = useRef(false);

  const initialConfig = useMemo(
    () => ({
      namespace: "autoclaw-composer-editor",
      editable: !disabled,
      onError(error: Error) {
        throw error;
      },
    }),
    [disabled],
  );

  const handleEditorReady = useCallback(
    (editor: ReturnType<typeof useLexicalComposerContext>[0]) => {
      editorRef.current = editor;
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      focusAtEnd: () => {
        const editor = editorRef.current;
        if (!editor) {
          return;
        }

        editor.focus(() => {
          editor.update(() => {
            $getRoot().selectEnd();
          });
        });
      },
    }),
    [],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative">
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              className={cn(
                "block max-h-[200px] min-h-[72px] w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-sm leading-6 text-[var(--color-text-primary)] outline-none",
                disabled && "cursor-not-allowed opacity-70",
                className,
              )}
              data-testid="composer-editor"
              aria-placeholder={placeholder}
              placeholder={<span />}
            />
          }
          placeholder={
            <div className="pointer-events-none absolute inset-0 text-sm leading-6 text-[var(--color-text-muted)]/90">
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>

      <SetEditorRefPlugin onReady={handleEditorReady} />
      <EditableSyncPlugin disabled={disabled} />
      <ValueSyncPlugin value={value} syncingRef={syncingRef} />
      <SubmitOnEnterPlugin disabled={disabled} onSubmit={onSubmit} />
      <OnChangePlugin
        onChange={(editorState) => {
          if (syncingRef.current) {
            return;
          }

          editorState.read(() => {
            onChange($getRoot().getTextContent());
          });
        }}
      />
      <HistoryPlugin />
    </LexicalComposer>
  );
});
