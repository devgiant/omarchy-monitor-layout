const assert = require('node:assert/strict')
const model = require('../model/MonitorLayoutModel.js')

const dell = {
  name: 'DP-1', description: 'Dell Inc. DELL U3219Q 9WTG413', disabled: false,
  width: 3840, height: 2160, refreshRate: 59.997, x: 2304, y: 0,
  scale: 1.67, transform: 0, vrr: false, availableModes: ['3840x2160@60.00Hz']
}

// ---- parsing ----------------------------------------------------------------

const parsed = model.parseMonitors(JSON.stringify([dell, { bogus: true }, null]))
assert.equal(parsed.length, 1)
assert.equal(parsed[0].name, 'DP-1')
assert.deepEqual(model.parseMonitors('junk'), [])

assert.deepEqual(model.parseMode('3840x2160@60.00Hz'), { width: 3840, height: 2160, refresh: 60 })
assert.equal(model.parseMode('nope'), null)

assert.deepEqual(model.logicalSize(dell), { w: 2299, h: 1293 })
assert.deepEqual(model.logicalSize(model.mergeMonitor(dell, { transform: 1 })),
  { w: 1293, h: 2299 }, 'rotation swaps the logical box')

// ---- Lua safety -------------------------------------------------------------

assert.equal(model.luaString('Dell "27"'), '"Dell \\"27\\""')
assert.equal(model.luaString('back\\slash'), '"back\\\\slash"')
assert.equal(model.luaString('evil\nname'), null, 'control characters never reach eval')

const spec = model.monitorSpec(dell, 'name')
assert.match(spec, /^hl\.monitor\(\{ output = "DP-1", mode = "3840x2160@60", position = "2304x0", scale = 1\.67, transform = 0 \}\)$/)

const descSpec = model.monitorSpec(dell, 'desc')
assert.match(descSpec, /output = "desc:Dell Inc\. DELL U3219Q 9WTG413"/)

const disabledSpec = model.monitorSpec(model.mergeMonitor(dell, { disabled: true }), 'name')
assert.equal(disabledSpec, 'hl.monitor({ output = "DP-1", disabled = true })')

assert.equal(model.monitorSpec(model.mergeMonitor(dell, { scale: 99 }), 'name'), null,
  'absurd scales are rejected')
assert.equal(model.monitorSpec(model.mergeMonitor(dell, { name: 'DP\n1' }), 'name'), null)

const vrrSpec = model.monitorSpec(model.mergeMonitor(dell, { vrr: true }), 'name')
assert.match(vrrSpec, /vrr = 1/)

assert.deepEqual(model.applyCommand(dell).slice(0, 2), ['hyprctl', 'eval'])
assert.equal(model.applyCommand(model.mergeMonitor(dell, { transform: 9 })), null)

// ---- persistence flag -------------------------------------------------------

const flag = model.buildFlagContent([dell, model.mergeMonitor(dell, { name: 'HDMI-A-1', description: 'LG TV', x: 0 })])
assert.match(flag, /desc:Dell Inc/)
assert.match(flag, /desc:LG TV/)
assert.ok(flag.endsWith('\n'))
assert.equal(model.buildFlagContent([]), null, 'an empty layout writes nothing')

// ---- canvas math ------------------------------------------------------------

assert.equal(model.snap(1017, 16), 1024)
assert.equal(model.snap(-9, 16), -16)

const shifted = model.normalizePositions([
  model.mergeMonitor(dell, { x: 500, y: 200 }),
  model.mergeMonitor(dell, { name: 'DP-3', x: 2804, y: 200 })
])
assert.equal(shifted[0].x, 0, 'the layout origin normalizes to 0,0')
assert.equal(shifted[1].x, 2304)
assert.equal(shifted[0].y, 0)

const scale = model.canvasScale([dell], 600, 300)
assert.ok(scale > 0 && scale < 1)

console.log('ok - monitor layout model')
