import puppeteer from 'puppeteer-core'

const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:5173'
const errs = []

const browser = await puppeteer.launch({
  executablePath: EXE,
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
page.on('console', (m) => {
  if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 200))
})
page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e).slice(0, 200)))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// 1. landing
await page.goto(BASE + '/', { waitUntil: 'networkidle2' })
await page.screenshot({ path: 'shot-landing.png' })

// 2. control room
await page.goto(BASE + '/control', { waitUntil: 'networkidle2' })
await wait(2500)
await page.screenshot({ path: 'shot-control-idle.png' })
const sensorCount = await page.evaluate(() => document.body.innerText.match(/(\d+) TEL/)?.[1])

// 3. run the automatic demo, capture key beats
await page.keyboard.press('d')
await wait(5500) // event peak
await page.screenshot({ path: 'shot-demo-event.png' })
await wait(4000) // spike + anomaly
await page.screenshot({ path: 'shot-demo-spike.png' })
await wait(7500) // checkin + confirmations
await page.screenshot({ path: 'shot-demo-checkin.png' })
await wait(6000) // blocked route
await page.screenshot({ path: 'shot-demo-blocked.png' })
await wait(11000) // summary
await page.screenshot({ path: 'shot-demo-summary.png' })

const summaryText = await page.evaluate(() => document.body.innerText)
const hasSummary = summaryText.includes('Primeros 30 segundos')
const hasBlocked = summaryText.includes('RUTA ALTERNATIVA') || summaryText.includes('Salida bloqueada')

// 4. overflow check on desktop
const overflow = await page.evaluate(() => ({
  x: document.documentElement.scrollWidth - window.innerWidth,
  y: document.documentElement.scrollHeight - window.innerHeight,
}))

// 5. QR modal
await page.keyboard.press('Escape')
await page.keyboard.press('r')
await wait(600)
await page.keyboard.press('q')
await wait(900)
await page.screenshot({ path: 'shot-qr.png' })
const hasQR = await page.evaluate(() => !!document.querySelector('svg[height="210"], canvas'))

// 6. mobile sensor view
const m = await browser.newPage()
m.on('pageerror', (e) => errs.push('[mobile pageerror] ' + String(e).slice(0, 200)))
m.on('console', (x) => {
  if (x.type() === 'error') errs.push('[mobile console] ' + x.text().slice(0, 160))
})
await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
const code = await page.evaluate(() => document.body.innerText.match(/SESI[ÓO]N\s+(\S{4})/)?.[1])
await m.goto(BASE + '/sensor?room=' + code, { waitUntil: 'networkidle2' })
await wait(800)
await m.screenshot({ path: 'shot-phone-join.png' })
await m.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Conectar sensor'))?.click())
await wait(700)
await m.screenshot({ path: 'shot-phone-permission.png' })
await m.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('táctil'))?.click())
await wait(4200)
await m.screenshot({ path: 'shot-phone-live.png' })
const liveText = await m.evaluate(() => document.body.innerText)
await m.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Reportar peligro'))?.click())
await wait(600)
await m.screenshot({ path: 'shot-phone-hazard.png' })
await m.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Salida bloqueada'))?.click())
await wait(500)
await m.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Estoy bien'))?.click())
await wait(1500)
await page.bringToFront()
await page.keyboard.press('c')
await wait(1200)
await page.screenshot({ path: 'shot-hybrid.png' })
const hybrid = await page.evaluate(() => document.body.innerText)
const hybridOk = { phoneJoined: /4 TEL/.test(hybrid), gotOk: hybrid.includes('OK ×1'), gotHazard: hybrid.includes('SALIDA BLOQUEADA') }

console.log(
  JSON.stringify(
    {
      sensorCount,
      hasSummary,
      hasBlocked,
      hasQR,
      overflow,
      phoneLive: /Conectado|Sensor activo|Conectando/.test(liveText),
      code,
      phoneText: liveText.slice(0,100),
      hybridOk,
      phoneHasButtons: liveText.includes('Estoy bien') && liveText.includes('Necesito ayuda'),
      errors: [...new Set(errs)].slice(0, 12),
    },
    null,
    2,
  ),
)
await browser.close()
