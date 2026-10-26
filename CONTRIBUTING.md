# Contributing

Issues, forks and small improvements are welcome. Explain the problem and resulting behavior, and include relevant verification. Preserve the project's minimal appearance and readable typography.

1. Fork or clone the repository.
2. Use Node.js 20+ for `npm test` (there are no external npm dependencies).
3. On macOS, run `/bin/zsh scripts/build.sh` to build a separate development copy.
4. Use synthetic tasks and isolated Notes test accounts/data; do not commit personal data.
5. Check `.gitignore` and the full staged file list before publishing.

The automated tests cover task logic, Notes parsing/merging and the MCP transport. Native dragging, pinning, resizing, permission prompts and real iCloud delivery need manual verification. State which checks you actually performed.

See [AGENTS.md](AGENTS.md) for implementation details and [LICENSE](LICENSE) for reuse terms. A Star is appreciated but never required to use, fork, modify or contribute.
