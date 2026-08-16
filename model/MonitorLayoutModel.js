// Monitor layout model. Loaded by both the QML panel and the Node test
// harness, so it must stay dependency-free.
//
// Omarchy runs Hyprland's Lua config provider: runtime changes go through
// `hyprctl eval 'hl.monitor({...})'` (verified in-use by Omarchy's own
// tools; `hyprctl keyword monitor` is not the house path), and durability
// comes from a flag file in the sourced toggles directory whose specs are
// keyed by EDID description (`desc:` selectors) — so each monitor's saved
// settings re-apply whenever that monitor is present, on any port.

var FLAG_BASENAME = "community-monitor-layout.lua"

function stateDir(xdgStateHome, home) {
  var base = typeof xdgStateHome === "string" && xdgStateHome.trim().length > 0
    ? xdgStateHome.trim()
    : String(home == null ? "" : home) + "/.local/state"
  return base + "/omarchy/toggles/hypr"
}

function flagPath(xdgStateHome, home) {
  return stateDir(xdgStateHome, home) + "/" + FLAG_BASENAME
}

function monitorsCommand() {
  return ["hyprctl", "-j", "monitors", "all"]
}

// Parse `hyprctl -j monitors all` into display records.
function parseMonitors(text) {
  var parsed = null
  if (typeof text === "string" && text.length > 0) {
    try { parsed = JSON.parse(text) } catch (error) { parsed = null }
  }
  if (!Array.isArray(parsed)) return []
  var monitors = []
  for (var i = 0; i < parsed.length; i++) {
    var m = parsed[i]
    if (!m || typeof m.name !== "string") continue
    monitors.push({
      name: m.name,
      description: typeof m.description === "string" ? m.description : "",
      disabled: m.disabled === true,
      width: Number(m.width) || 0,
      height: Number(m.height) || 0,
      refreshRate: Number(m.refreshRate) || 0,
      x: Number(m.x) || 0,
      y: Number(m.y) || 0,
      scale: Number(m.scale) || 1,
      transform: Number(m.transform) || 0,
      vrr: m.vrr === true,
      availableModes: Array.isArray(m.availableModes) ? m.availableModes : []
    })
  }
  monitors.sort(function (a, b) { return a.name < b.name ? -1 : 1 })
  return monitors
}

// Logical (post-scale, post-transform) size, for the arrangement canvas.
function logicalSize(monitor) {
  var rotated = monitor.transform === 1 || monitor.transform === 3
    || monitor.transform === 5 || monitor.transform === 7
  var w = rotated ? monitor.height : monitor.width
  var h = rotated ? monitor.width : monitor.height
  var scale = monitor.scale > 0 ? monitor.scale : 1
  return { w: Math.round(w / scale), h: Math.round(h / scale) }
}

// ---- Lua building (sanitized: nothing unvalidated reaches eval) ------------

function luaString(value) {
  var text = String(value == null ? "" : value)
  if (/[^\x20-\x7e]/.test(text)) return null
  return '"' + text.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'
}

function validMode(mode) {
  return /^\d{3,5}x\d{3,5}@\d{1,3}(\.\d+)?(Hz)?$/.test(String(mode == null ? "" : mode))
}

// Build one hl.monitor spec. `selector` is "name" (runtime apply to the
// connector) or "desc" (persistence keyed to the panel's EDID identity).
function monitorSpec(monitor, selectorKind) {
  var selector = selectorKind === "desc" && monitor.description.length > 0
    ? "desc:" + monitor.description : monitor.name
  var output = luaString(selector)
  if (output === null) return null
  if (monitor.disabled) {
    return "hl.monitor({ output = " + output + ", disabled = true })"
  }
  var mode = Math.round(monitor.width) + "x" + Math.round(monitor.height)
    + "@" + (Math.round(monitor.refreshRate * 100) / 100)
  if (!validMode(mode)) return null
  var x = Math.round(Number(monitor.x))
  var y = Math.round(Number(monitor.y))
  var scale = Math.round(Number(monitor.scale) * 100000) / 100000
  var transform = Math.round(Number(monitor.transform))
  if (!isFinite(x) || !isFinite(y) || !isFinite(scale) || scale <= 0 || scale > 4) return null
  if (transform < 0 || transform > 7) return null
  return "hl.monitor({ output = " + output
    + ", mode = " + luaString(mode)
    + ", position = " + luaString(x + "x" + y)
    + ", scale = " + scale
    + ", transform = " + transform
    + (monitor.vrr ? ", vrr = 1" : "")
    + " })"
}

function applyCommand(monitor) {
  var spec = monitorSpec(monitor, "name")
  if (spec === null) return null
  return ["hyprctl", "eval", spec]
}

// The persistence flag: one desc-keyed spec per monitor; Hyprland ignores
// specs whose monitor is absent, which is exactly the auto-apply behavior.
function buildFlagContent(monitors) {
  var lines = [
    "-- Saved monitor layout (community.monitor-layout / Omarchy Nexus suite).",
    "-- Keyed by EDID description, so each monitor's settings re-apply",
    "-- whenever it is connected. Delete this file to forget the layout.",
    ""
  ]
  var wrote = 0
  for (var i = 0; i < (monitors ? monitors.length : 0); i++) {
    var spec = monitorSpec(monitors[i], "desc")
    if (spec !== null) {
      lines.push(spec)
      wrote += 1
    }
  }
  if (wrote === 0) return null
  lines.push("")
  return lines.join("\n")
}

// ---- arrangement canvas math ------------------------------------------------

// Scale-to-fit factor for drawing monitor rects inside a canvas.
function canvasScale(monitors, canvasW, canvasH) {
  var maxX = 1
  var maxY = 1
  for (var i = 0; i < (monitors ? monitors.length : 0); i++) {
    var m = monitors[i]
    if (m.disabled) continue
    var size = logicalSize(m)
    if (m.x + size.w > maxX) maxX = m.x + size.w
    if (m.y + size.h > maxY) maxY = m.y + size.h
  }
  return Math.min(canvasW / (maxX * 1.15), canvasH / (maxY * 1.15))
}

// Snap a dragged position and normalize so the layout origin stays 0,0.
function snap(value, grid) {
  var g = Number(grid) || 16
  return Math.round(Number(value) / g) * g
}

function normalizePositions(monitors) {
  var minX = Infinity
  var minY = Infinity
  var enabled = 0
  for (var i = 0; i < monitors.length; i++) {
    if (monitors[i].disabled) continue
    enabled += 1
    if (monitors[i].x < minX) minX = monitors[i].x
    if (monitors[i].y < minY) minY = monitors[i].y
  }
  if (enabled === 0 || (minX === 0 && minY === 0)) return monitors
  var out = []
  for (var j = 0; j < monitors.length; j++) {
    var m = monitors[j]
    out.push(m.disabled ? m : mergeMonitor(m, { x: m.x - minX, y: m.y - minY }))
  }
  return out
}

function mergeMonitor(monitor, changes) {
  var next = {}
  for (var key in monitor) next[key] = monitor[key]
  for (var change in changes) next[change] = changes[change]
  return next
}

// Parse an availableModes entry ("3840x2160@60.00Hz") for the mode picker.
function parseMode(text) {
  var match = /^(\d+)x(\d+)@(\d+(?:\.\d+)?)Hz$/.exec(String(text == null ? "" : text).trim())
  if (!match) return null
  return { width: Number(match[1]), height: Number(match[2]), refresh: Number(match[3]) }
}

if (typeof module !== "undefined") {
  module.exports = {
    FLAG_BASENAME: FLAG_BASENAME,
    stateDir: stateDir,
    flagPath: flagPath,
    monitorsCommand: monitorsCommand,
    parseMonitors: parseMonitors,
    logicalSize: logicalSize,
    luaString: luaString,
    validMode: validMode,
    monitorSpec: monitorSpec,
    applyCommand: applyCommand,
    buildFlagContent: buildFlagContent,
    canvasScale: canvasScale,
    snap: snap,
    normalizePositions: normalizePositions,
    mergeMonitor: mergeMonitor,
    parseMode: parseMode
  }
}
