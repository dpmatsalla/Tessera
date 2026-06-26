# Tessera Web Edition

A static HTML, CSS, and JavaScript recreation of the 2002 Visual Basic 6
version of Tessera. It requires no database, PHP, Node.js, or server-side
framework after deployment.  Developed by Devon Matsalla.

## Play locally

Serve this directory with any static web server. For example:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

Opening `index.html` directly may work, but a local web server is recommended
because the application uses JavaScript modules.

## Test

With Node.js installed:

```powershell
npm test
```

## HostPapa deployment

1. Open the HostPapa cPanel File Manager or connect by FTP/SFTP.
2. Open the public site directory, normally `public_html`.
3. Upload the contents of `HTML-JS Source Code`, preserving the `css` and `js`
   directories.
4. Confirm that `index.html` is directly inside the intended web root.
5. Ensure the hidden `.htaccess` file was uploaded.
6. Visit the HTTPS URL. CSS and JavaScript URLs include a release version,
   and `.htaccess` instructs Apache to revalidate web assets.

No build command is required. Settings and the active game are stored separately
in each visitor's browser using `localStorage`. An unfinished game resumes
automatically when the page is reopened.

When publishing a later release, update the shared `v=` value in `index.html`,
`js/app.js`, and `js/ai.js`.

Before uploading, run:

```powershell
npm run deploy-check
```

This verifies local asset paths, filename casing, cache-version consistency,
and the required Apache cache headers.

## Legacy compatibility

The web edition preserves both the 2002 hexagonal geometry and the original
1996 square geometry, including their move and jump rules, piece conversion,
board sizes, rock percentages, starting layouts, player modes,
computer skill/aggressiveness controls, computer speed, colors, suggestions,
passing, pausing, score display, and keyboard shortcuts.

## Web edition enhancements

- Selectable Hexagonal, original 1996 Square, and Triangular board geometries.
- Automatic save and resume for the current game.
- Adjustable Undo retention from zero through twenty previous turns.
- Replay controls for retained human-game history.
- Computer-versus-computer games skip history and session snapshot writes.
- At 1 ms computer speed, computer-versus-computer turns run in short batches
  with one board redraw per batch.
- Easy, Medium, Hard, Expert, and Classic VB computer difficulties.
- A dedicated final-score dialog with rematch and replay actions.

## Intentional differences

- When either player cannot move, every remaining empty cell is awarded to the
  opponent and the game ends immediately. Manual Skip remains a normal pass
  unless it passes to a player who has no legal move.
- The AI retains the deterministic first-best tie ordering used by the VB6
  implementation, despite its source comment mentioning random choice.
- Random rock placement retains VB6 duplicate placement attempts and uses
  Visual Basic-style banker's rounding for generated coordinates.
