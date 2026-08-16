# Monitor Layout

A visual display arranger for [Omarchy](https://omarchy.org) v4: drag
monitor rectangles to position them, cycle resolutions and refresh rates,
step the scale, rotate, toggle VRR, or disable an output — every change
applies **instantly** (through Hyprland's Lua runtime API, the mechanism
Omarchy itself uses).

**Save layout** persists the arrangement keyed by each monitor's EDID
identity into Omarchy's sourced toggles directory — so your dock's monitors
get their saved positions whenever they are plugged in, on any port,
surviving reboots. **Forget** removes the file and your hand-written
`monitors.lua` is authoritative again.

A safety rail keeps the last enabled monitor from being disabled.

## Install

```sh
omarchy plugin add https://github.com/devmobasa/omarchy-monitor-layout --enable
omarchy-shell shell toggle community.monitor-layout '{}'
```

Keybinding example for `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + CTRL + M", "Monitor layout", "omarchy-shell shell toggle community.monitor-layout '{}'")
```

## Notes

- Runtime changes are transient until saved: a `hyprctl reload` reverts to
  your config. Saved layouts load *after* your config (toggles are sourced
  last), so they win — that is the point.
- Refresh rates are matched approximately; Hyprland picks the closest mode.

## Tests

```sh
OMARCHY_PATH=/path/to/omarchy ./test/all
```

## License

[MIT](LICENSE)
