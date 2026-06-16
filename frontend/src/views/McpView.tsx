import { useState } from "react";
import type { McpServer, McpAddRequest } from "@shared/contracts";
import { api } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { ErrorState, EmptyState } from "@/components/ViewState";
import { Spinner } from "@/components/ui/Spinner";

const STATUS_TONE: Record<
  McpServer["status"],
  "ok" | "warn" | "fail" | "off" | "neutral"
> = {
  connected: "ok",
  "needs-auth": "warn",
  failed: "fail",
  disabled: "off",
  unknown: "neutral",
};

type Transport = "stdio" | "http";

export function McpView() {
  const { data, loading, error, reload, setData } = useAsync(api.getMcp);
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<McpServer | null>(null);

  // Add-form state.
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<Transport>("stdio");
  const [command, setCommand] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading && !data) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-4 text-center">
        <Spinner label="Running MCP health checks" />
        <p className="max-w-sm text-xs leading-relaxed text-fog-500">
          Probing every configured server. This typically takes around 15
          seconds — connection state is checked live.
        </p>
      </div>
    );
  }
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState>No MCP configuration found.</EmptyState>;

  async function toggle(server: McpServer) {
    const action = server.status === "disabled" ? "enable" : "disable";
    setPending(server.name);
    try {
      const next = await api.mcpToggle({ name: server.name, action });
      setData(next);
    } catch (cause) {
      toast.push(
        cause instanceof Error ? cause.message : "Toggle failed",
        "fail",
      );
    } finally {
      setPending(null);
    }
  }

  function resetForm() {
    setName("");
    setTransport("stdio");
    setCommand("");
    setUrl("");
  }

  async function addServer() {
    if (!name.trim()) {
      toast.push("Server name is required.", "fail");
      return;
    }
    const req: McpAddRequest = {
      name: name.trim(),
      transport,
      command: transport === "stdio" ? command.trim() : "",
      url: transport === "http" ? url.trim() : "",
    };
    setBusy(true);
    try {
      const next = await api.mcpAdd(req);
      setData(next);
      toast.push("Server added.", "ok");
      setAdding(false);
      resetForm();
    } catch (cause) {
      toast.push(cause instanceof Error ? cause.message : "Add failed", "fail");
    } finally {
      setBusy(false);
    }
  }

  async function removeServer(server: McpServer) {
    setRemoveTarget(null);
    setPending(server.name);
    try {
      const next = await api.mcpRemove({ name: server.name });
      setData(next);
      toast.push("Server removed.", "ok");
    } catch (cause) {
      toast.push(
        cause instanceof Error ? cause.message : "Remove failed",
        "fail",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="font-mono text-2xs text-fog-500">
          {data.servers.length} servers
          {data.disabled.length > 0
            ? ` · ${data.disabled.length} disabled`
            : ""}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            Add server
          </Button>
          <Button size="sm" variant="ghost" onClick={reload}>
            Re-check
          </Button>
        </div>
      </div>

      {data.servers.length === 0 ? (
        <EmptyState>No MCP servers are configured.</EmptyState>
      ) : (
        <ScrollArea className="min-h-0 flex-1 rounded-lg border border-ink-700 bg-ink-850">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-ink-800/95 backdrop-blur">
              <tr className="text-left text-2xs uppercase tracking-widest text-fog-500">
                <th className="px-4 py-2.5 font-semibold">Server</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Scope</th>
                <th className="px-4 py-2.5 font-semibold">Transport</th>
                <th className="px-4 py-2.5 font-semibold">Detail</th>
                <th className="px-4 py-2.5 text-right font-semibold">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {data.servers.map((server) => {
                const busyRow = pending === server.name;
                return (
                  <tr
                    key={server.name}
                    className={busyRow ? "opacity-60" : undefined}
                  >
                    <td className="px-4 py-3 font-mono text-fog-100">
                      {server.name}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[server.status]}>
                        {server.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-fog-400">
                      {server.scope}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-fog-400">
                      {server.transport}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-fog-400">
                      <span className="block truncate" title={server.detail}>
                        {server.detail || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {server.managedLocally ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant={
                              server.status === "disabled"
                                ? "secondary"
                                : "ghost"
                            }
                            disabled={busyRow}
                            onClick={() => toggle(server)}
                          >
                            {busyRow
                              ? "Working"
                              : server.status === "disabled"
                                ? "Enable"
                                : "Disable"}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busyRow}
                            onClick={() => setRemoveTarget(server)}
                          >
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <span className="text-2xs text-fog-600">
                          claude.ai — manage in app
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}

      <Modal
        open={adding}
        title="Add MCP server"
        onClose={() => setAdding(false)}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={addServer}
              disabled={busy || !name.trim()}
            >
              {busy ? "Adding" : "Add"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <Label>Name</Label>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-server"
              />
            </label>
            <label className="block">
              <Label>Transport</Label>
              <Select
                value={transport}
                onChange={(e) => setTransport(e.target.value as Transport)}
              >
                <option value="stdio">stdio</option>
                <option value="http">http</option>
              </Select>
            </label>
          </div>
          {transport === "stdio" ? (
            <label className="block">
              <Label>Command</Label>
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx -y @scope/server"
                className="font-mono text-xs"
              />
            </label>
          ) : (
            <label className="block">
              <Label>URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/mcp"
                className="font-mono text-xs"
              />
            </label>
          )}
        </div>
      </Modal>

      <Modal
        open={removeTarget != null}
        title="Remove server"
        onClose={() => setRemoveTarget(null)}
        footer={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRemoveTarget(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => removeTarget && removeServer(removeTarget)}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm text-fog-300">
          Remove{" "}
          <span className="font-mono text-fog-100">{removeTarget?.name}</span>{" "}
          from your local MCP config?
        </p>
      </Modal>
    </div>
  );
}
