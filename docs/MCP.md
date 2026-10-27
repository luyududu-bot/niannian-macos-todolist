# MCP setup

For ordinary app use and iPhone sync, start with the [three-step guide](SYNC.md). MCP is optional and only needed when an agent should operate tasks.

The app exposes a model-agnostic **local STDIO** MCP server. It calls no model provider. Node.js 20+ is required for the server; the desktop app itself does not need Node.js.

## Use a built distribution

First run `/bin/zsh scripts/build.sh`. Keep `dist/念念/` together or move that whole folder to a fixed location. Use the launch command from **that built folder**:

```json
{
  "mcpServers": {
    "niannian": {
      "command": "/bin/zsh",
      "args": ["/absolute/path/to/念念/MCP/运行.command"]
    }
  }
}
```

Replace the placeholder with the actual absolute path. Restart/reload the MCP connection in your client. `MCP/Codex.example.toml` is an example for a client that accepts that format; different clients may have different configuration layouts.

If Node is not on the client's PATH, provide an absolute Node executable in the environment variable `NIANNIAN_NODE`. The launcher can also find a user's installed Codex runtime under their own home directory. It contains no machine-specific username.

## Developing directly from the repository

The repository root does not contain an app or task data. To point the source server to a built app, pass both paths:

```sh
node MCP/server.mjs --app-path '/absolute/path/to/念念/念念.app' --data-dir '/absolute/path/to/念念/念念资料'
```

Avoid running against a user's live data for tests. The canonical writer is the Mac app; mutations use a local request/reply queue. If the app is stopped the service attempts to launch it, and reports a clear error if macOS cannot launch it. Read-only operations can inspect existing data independently.

## Tools

All tool names start with `niannian_`:

| Tool | Purpose |
| --- | --- |
| `list_tasks` | Today, long-term or all tasks; optional filters |
| `create_task` | Add a daily or long-term task |
| `update_task` | Rename or change a daily date |
| `complete_task` | Complete or undo completion |
| `delete_task` / `restore_task` | Recoverable deletion and restore |
| `plan_step` | Turn a long-term goal into a daily step |
| `get_monthly_record` | Read a month of task records |
| `get_sync_status` | Read Reminders sync and Notes archive status |
| `sync_reminders_now` | Request already connected Reminders sync |
| `resolve_reminders_conflicts` | Resolve only after the user chooses local/remote |
| `sync_notes_now` | Request already enabled Notes sync/archive |
| `resolve_sync_conflicts` | Apply the user's chosen conflict direction |

Resources: `niannian://tasks`, `niannian://sync`, `niannian://month/{YYYY-MM}`.

Enabling Apple Notes for the first time is an in-app action that selects the user's iCloud account. The MCP client controls tool access and confirmation policy. The server does not grant blanket approval, expose public network access or treat Notes/task text as instructions.
