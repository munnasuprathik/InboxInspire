# How to Recover Your Unsaved Changes in Cursor

## Method 1: Cursor's Local History (Recommended)

Cursor automatically saves local history of your files. Here's how to access it:

1. **Right-click on the file** you want to recover (e.g., `frontend/src/App.js`)
2. Select **"Local History"** or **"Timeline"** from the context menu
3. You'll see a list of previous versions with timestamps
4. Click on the version **before your rollback** to view it
5. Copy the content you need or restore the entire file

## Method 2: Using Cursor's Timeline View

1. Open the file you want to recover
2. Look for the **"Timeline"** icon in the left sidebar (clock icon)
3. Click on it to see all saved versions
4. Select the version from before your rollback
5. Click **"Restore"** or copy the content

## Method 3: Check Git Stash

If you accidentally stashed your changes:

```bash
# List all stashes
git stash list

# View the most recent stash
git stash show -p

# Apply the most recent stash
git stash pop

# Apply a specific stash (replace 0 with stash number)
git stash apply stash@{0}
```

## Method 4: Check Current Working Directory

Your changes might still be in your working directory! Check:

```bash
# See what files have been modified
git status

# See the actual changes
git diff

# If you see your changes, you can restore them by:
# 1. Staging them: git add .
# 2. Or creating a new branch: git checkout -b recover-changes
```

## Method 5: Cursor's Undo History

1. Press `Ctrl+Z` (or `Cmd+Z` on Mac) multiple times
2. This will undo your recent changes step by step
3. Keep undoing until you see your lost changes
4. Then copy/save them

## Method 6: Check Cursor's Workspace Storage

Cursor stores unsaved changes in workspace storage. The location is typically:
- Windows: `%APPDATA%\Cursor\User\workspaceStorage\`
- Mac: `~/Library/Application Support/Cursor/User/workspaceStorage/`
- Linux: `~/.config/Cursor/User/workspaceStorage/`

## Quick Recovery Steps:

1. **First, check if your changes are still there:**
   ```bash
   git status
   git diff
   ```

2. **If changes are gone, use Cursor's Local History:**
   - Right-click file → Local History
   - Find version before rollback
   - Restore or copy content

3. **If that doesn't work, check Git stash:**
   ```bash
   git stash list
   git stash show -p stash@{0}
   ```

## Prevention for Future:

1. **Always commit before rollback:**
   ```bash
   git add .
   git commit -m "WIP: saving changes before rollback"
   ```

2. **Use Git stash instead of rollback:**
   ```bash
   git stash save "my changes"
   # Later: git stash pop
   ```

3. **Enable auto-save in Cursor:**
   - Settings → Files → Auto Save: "afterDelay"
