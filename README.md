# Copilot Diary Study Extension

A VS Code extension that captures Copilot Chat sessions for a UX research diary study.

## For Study Participants

### Installing the Extension

1. Download the latest `.vsix` file from the **Releases** page of the GitHub repository.
2. In VS Code, open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
3. Run **Extensions: Install from VSIX…** and select the downloaded file.
4. Reload VS Code when prompted.

### Using the Extension

After a Copilot Chat session, type **`@diary /log`** in the chat panel to log the session. You'll be asked three quick questions:

1. **What were you trying to do?** — describe the task in your own words.
2. **Copilot got the job done** — rate on a 5-point scale.
3. **What would a great experience have looked like?** — or just say "it was great."

Sessions are saved locally to `~/.copilot-diary/sessions/`. No data is sent anywhere.

### Exporting Your Diary

When the study period ends, run **Copilot Diary: Export Diary** from the Command Palette. Review the export for any sensitive content, then share the file with the research team.

## For Developers

### Building from Source

```bash
npm install
npm run compile
npm run package   # creates copilot-diary-study-{version}.vsix
```

### Releasing a New Version

1. Bump `version` in `package.json`.
2. Commit and push.
3. Tag and push: `git tag v0.2.0 && git push origin v0.2.0`
4. GitHub Actions will build, test, and publish a Release with the `.vsix` attached.

## Privacy

- All data is stored **locally only** — no telemetry, no network calls.
- The extension captures **only** Copilot Chat content you explicitly log.
- You can delete any entry before exporting.
