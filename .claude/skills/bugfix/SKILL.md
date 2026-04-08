# Bug Fix Workflow

1. First reproduce the bug by running the relevant endpoint/command
2. Check if the issue is client-side (terminal, browser) before investigating server-side
3. Review related migration files before making DB changes
4. After fixing, restart the affected service
5. Verify the fix by re-running the original reproduction step
6. Check for secondary issues introduced by the fix
