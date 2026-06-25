# HostPapa Release Checklist

## Before upload

- Run `npm test`.
- Run `npm run deploy-check`.
- Confirm all tests pass.
- If browser assets changed, increment the shared `v=` release value in:
  - `index.html`
  - `js/app.js`
  - `js/ai.js`

## Upload

Upload these items to the intended HostPapa web directory:

- `.htaccess`
- `index.html`
- `css/`
- `js/`

The following development files are optional on the server:

- `README.md`
- `DEPLOYMENT.md`
- `package.json`
- `test/`

## Verify online

- Load the HTTPS URL.
- Confirm the board and controls appear without console errors.
- Start a human-versus-computer game.
- Select and drag a piece.
- Check copy and jump destination indicators.
- Check Suggest, Pause, Skip, zoom, pan, and computer speed.
- Reload and confirm saved settings remain.
- Test one desktop and one mobile browser.
