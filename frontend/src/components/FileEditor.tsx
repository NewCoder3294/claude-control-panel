import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import type { Extension } from "@codemirror/state";
import type { ConfigFile, FileWriteResponse } from "@shared/contracts";
import { api } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface FileEditorProps {
  file: ConfigFile;
  /** Notify the parent of the post-save file state (mtime/bytes refreshed). */
  onSaved?: (file: ConfigFile) => void;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; backup: string }
  | { kind: "error"; message: string };

function languageFor(path: string): Extension[] {
  if (path.endsWith(".json")) return [json()];
  // Default everything else (.md and unknown) to markdown.
  return [markdown()];
}

export function FileEditor({ file, onSaved }: FileEditorProps) {
  const [value, setValue] = useState(file.content);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  // Reset the buffer whenever a different file is selected.
  useEffect(() => {
    setValue(file.content);
    setSave({ kind: "idle" });
  }, [file.path, file.content]);

  const dirty = value !== file.content;
  const readOnly = !file.editable;
  // A missing-but-editable file can be created by saving (writeFile mkdir+writes).
  const canSave = !readOnly && (dirty || !file.exists);
  const extensions = useMemo(() => languageFor(file.path), [file.path]);

  async function handleSave() {
    if (!canSave) return;
    setSave({ kind: "saving" });
    try {
      const res: FileWriteResponse = await api.writeFile({
        path: file.path,
        content: value,
      });
      setSave({ kind: "saved", backup: res.backup });
      onSaved?.(res.file);
    } catch (cause) {
      setSave({
        kind: "error",
        message: cause instanceof Error ? cause.message : "Save failed",
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-fog-100">
            {file.label}
          </div>
          <div className="truncate font-mono text-xs text-fog-400">
            {file.displayPath}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {readOnly ? (
            <Badge tone="off">read only</Badge>
          ) : !file.exists ? (
            <Badge tone="neutral">new</Badge>
          ) : dirty ? (
            <Badge tone="warn">unsaved</Badge>
          ) : null}
          {!readOnly ? (
            <Button
              size="sm"
              variant="primary"
              onClick={handleSave}
              disabled={!canSave || save.kind === "saving"}
            >
              {save.kind === "saving"
                ? "Saving"
                : file.exists
                  ? "Save"
                  : "Create"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden border-t border-ink-700 bg-ink-900">
        <CodeMirror
          value={value}
          onChange={setValue}
          theme="light"
          extensions={extensions}
          editable={!readOnly}
          readOnly={readOnly}
          height="100%"
          style={{ height: "100%" }}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: !readOnly,
            foldGutter: true,
            highlightActiveLineGutter: !readOnly,
          }}
        />
      </div>

      <div className="flex min-h-[34px] items-center gap-2 border-t border-ink-700 px-4 py-1.5 text-xs">
        {save.kind === "saved" ? (
          <span className="text-status-ok">
            Saved · backed up to{" "}
            <span className="font-mono text-fog-300">{save.backup}</span>
          </span>
        ) : save.kind === "error" ? (
          <span className="text-status-fail">{save.message}</span>
        ) : readOnly ? (
          <span className="text-fog-500">
            This file is managed elsewhere and cannot be edited here.
          </span>
        ) : !file.exists ? (
          <span className="text-fog-500">
            Not created yet — Save to create it{" "}
            <span className="font-mono text-fog-400">{file.displayPath}</span>
          </span>
        ) : (
          <span className="font-mono text-fog-500">
            {file.bytes.toLocaleString()} bytes
            {file.mtime
              ? ` · modified ${new Date(file.mtime).toLocaleString()}`
              : ""}
          </span>
        )}
      </div>
    </div>
  );
}
