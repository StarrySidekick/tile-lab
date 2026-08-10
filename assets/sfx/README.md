# Real sound files go here

The game synthesises every sound at runtime (see `src/audio.js`), so this folder
is empty by default and nothing breaks if it stays that way.

To replace a placeholder with a real recording, drop the file in here and list it
in `manifest.json`:

```json
{
  "place": "tile-clack.wav",
  "score": "chime.mp3",
  "treasure": "sparkle.ogg"
}
```

Anything **not** listed keeps using its synthesised voice, so you can swap the set
one sound at a time and A/B them against the placeholders.

Valid names — the full list is `SOUND_NAMES` in `src/audio.js`:

`place` `rotate` `meeple` `score` `step` `warp` `landmark` `rest`
`caveEnter` `caveExit` `treasure` `deny` `turn` `over`

Any format the browser can decode works (wav, mp3, ogg, m4a). Keep them short —
`rotate` and `place` fire constantly, so anything with a slow attack will feel
laggy even though nothing is actually delayed.
