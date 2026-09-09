import { createRequire } from 'module'
import fs from 'node:fs'
import { close_api, delay, send, startService, waitForApi } from "./utils/utils.js";
import { printGreen, printMagenta, printRed, printYellow } from "./utils/colorOut.js";
import { summarizeResponse } from "./utils/safeLog.js";
import { upsertUser, saveUserinfo } from "./utils/userinfo.js";

const require = createRequire(import.meta.url)
// 优先从常规 node_modules 解析（本地/全局安装场景），失败再回退到 Actions 构建产物中的 api/node_modules 硬编码路径
let QRCode
try {
  QRCode = require('qrcode')
} catch {
  QRCode = require('./api/node_modules/qrcode')
}

// GitHub Actions 运行环境下自动注入的 Step Summary 文件路径
const SUMMARY_FILE = process.env.GITHUB_STEP_SUMMARY || ''
const QR_DIR = './qr'
const KEYS_FILE = './qrkeys.json'

/**
 * 向 GitHub Step Summary 追加 Markdown 内容。
 * 非 Actions 环境（本地运行）时 SUMMARY_FILE 为空，自动跳过。
 * @param {string} markdown
 */
function appendSummary(markdown) {
  if (!SUMMARY_FILE) return
  try {
    fs.appendFileSync(SUMMARY_FILE, markdown + '\n')
    const size = fs.statSync(SUMMARY_FILE).size
    if (size > 0) {
      console.log(`[Summary] 已追加 ${Buffer.byteLength(markdown)} 字节，总计 ${size} 字节`)
    }
  } catch (err) {
    console.warn(`[Summary] 写入失败：${err.message}`)
  }
}

/**
 * 生成并展示单个二维码 — 展示渠道：
 *
 *   ① PNG 文件（qr/qr-N.png）：Release 直链 + HTML 内嵌双用途
 *   ② 自包含 HTML 页面（qr/login.html）：浏览器打开即见大图，手机直接扫
 *   ③ base64 data URI：HTML <img> 共用
 *
 * @param {string} url   酷狗扫码登录完整 URL
 * @param {number} index 账号序号（从 1 开始）
 * @param {number} total 总账号数
 * @returns {{ dataUrl: string, url: string, header: string, index: number }} 供 HTML 聚合用
 */
async function buildQr(url, index, total) {
  const header = total > 1 ? `（第 ${index}/${total} 个账号）` : ''

  // ── 1) PNG 文件（Release 直链 + HTML 内嵌双用途）──
  await QRCode.toFile(`${QR_DIR}/qr-${index}.png`, url, { width: 320, margin: 2 })

  // ── 2) base64 data URI（HTML <img> 共用）──
  const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 })

  // ── 3) 日志输出：指引去直链步骤 ──
  printMagenta(`\n═══ 第 ${index}/${total} 个二维码已生成 ═══`)
  console.log('')
  console.log('  🔗 请查看下一步「发布二维码图片直链」输出的链接，浏览器打开即可直接扫码')
  console.log('')

  return { dataUrl, url, header, index }
}

/**
 * 生成自包含 HTML 登录页（所有二维码的大图集中展示）
 * 用户从 artifact 下载后双击/手机打开即可直接扫码，无需任何依赖。
 */
function generateHtmlPage(qrItems) {
  const cards = qrItems.map(item => `
    <div class="card">
      <h2>账号 ${item.index}/${qrItems.length} ${item.header}</h2>
      <div class="qrcode">
        <img src="${item.dataUrl}" alt="账号${item.index} 二维码" />
      </div>
      <p class="url"><code>${item.url}</code></p>
      <p class="tip">⏳ 有效期约 2 分钟</p>
    </div>
  `).join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>酷狗音乐扫码登录</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  background:#0d1117;color:#e6edf3;display:flex;flex-direction:column;
  align-items:center;min-height:100vh;padding:20px;
}
.header{text-align:center;margin-bottom:30px}
.header h1{font-size:24px;color:#58a6ff}
.header p{color:#8b949e;font-size:14px;margin-top:8px}
.cards{display:flex;flex-wrap:wrap;justify-content:center;gap:24px;width:100%;max-width:960px}
.card{
  background:#161b22;border:1px solid #30363d;border-radius:16px;
  padding:28px 20px;text-align:center;width:320px;
}
.card h2{font-size:16px;color:#e6edf3;margin-bottom:16px}
.qrcode img{
  width:280px;height:auto;border-radius:12px;
  border:3px solid #30363d;background:#fff;padding:12px;
}
.url{margin-top:14px;word-break:break-all;font-size:13px;color:#8b949e}
.tip{margin-top:8px;color:#f0883e;font-size:13px;font-weight:600}
.footer{margin-top:40px;color:#484f58;font-size:12px}
@media(max-width:400px){
  .card{width:100%;padding:20px 12px}
  .qrcode img{width:240px}
}
</style>
</head>
<body>
<div class="header">
  <h1>🎵 酷狗音乐扫码登录</h1>
  <p>使用「酷狗音乐 APP」扫描下方二维码完成登录</p>
</div>
<div class="cards">${cards}</div>
<p class="footer">此页面由 kgcheckin 自动生成 · 二维码有效期约 2 分钟 · 请尽快扫描</p>
</body>
</html>`
}

/** 解析账号数量，无效输入回退为 1 */
function resolveNumber() {
  const args = process.argv.slice(3)
  const n = parseInt(process.env.NUMBER || args[0] || "1")
  return (Number.isNaN(n) || n < 1) ? 1 : n
}

/**
 * 模式一：生成二维码（PNG + HTML），随后立即结束 step。
 * step 结束后 Release 直链即可使用，用户浏览器打开直接扫码。
 */
async function genMode() {
  const api = startService()
  try {
    await waitForApi()
  } catch (e) {
    close_api(api)
    throw e
  }
  const number = resolveNumber()
  const keys = []

  // 清理上次运行残留的 QR 文件，避免旧二维码混入本次 Release
  fs.rmSync(QR_DIR, { recursive: true, force: true })
  fs.mkdirSync(QR_DIR, { recursive: true })

  if (!SUMMARY_FILE) {
    console.log('[INFO] 非 Actions 环境（$GITHUB_STEP_SUMMARY 未设置），Summary 将跳过')
  }

  try {
    const qrItems = [] // 收集所有二维码信息用于生成聚合 HTML

    for (let n = 0; n < number; n++) {
      const result = await send(`/login/qr/key?timestrap=${Date.now()}`, "GET", {})
      if (result.status === 1) {
        const qrcode = result.data.qrcode
        const qrUrl = `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${qrcode}`
        keys.push(qrcode)
        const item = await buildQr(qrUrl, n + 1, number)
        qrItems.push(item)
      } else {
        printRed("响应内容")
        console.dir(summarizeResponse(result), { depth: null })
        throw new Error(`获取二维码密钥失败：接口返回 status=${result.status}`)
      }
    }

    // ── 生成自包含 HTML 登录页（核心展示渠道！）──
    if (qrItems.length > 0) {
      const htmlContent = generateHtmlPage(qrItems)
      fs.writeFileSync(`${QR_DIR}/login.html`, htmlContent, 'utf8')

      // 也把每个二维码单独做成一个 HTML 方便多账号时逐个处理
      for (const item of qrItems) {
        fs.writeFileSync(
          `${QR_DIR}/qr-${item.index}.html`,
          `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>扫码登录 ${item.header}</title>` +
          `<style>*{margin:0;padding:0}body{display:flex;justify-content:center;align-items:center;min-height:100vh;background:#0d1117}` +
          `img{border-radius:16px;border:3px solid #30363d;padding:20px;background:#fff;max-width:90vw}</style></head>` +
          `<body><img src="${item.dataUrl}" alt="扫码登录${item.header}" /></body></html>`,
          'utf8'
        )
      }
    }

    fs.writeFileSync(KEYS_FILE, JSON.stringify({ number, keys }))
    printMagenta(`\n✅ 已生成 ${number} 个二维码。`)
    printMagenta(`🔗 请查看下一步「发布二维码图片直链」输出的可点击链接，浏览器打开即可直接扫码！`)

    // 写入 Summary 提示
    appendSummary(`## 🎵 酷狗音乐扫码登录\n\n✅ 已生成 ${number} 个二维码，请查看下一步「发布二维码图片直链」输出的链接进行扫码。\n\n⏳ 二维码有效期约 2 分钟，请尽快扫描。`)
  } catch (e) {
    const msg = e && e.message ? e.message : String(e)
    console.error(`::error::二维码生成失败：${msg}`)
    appendSummary(`## ❌ 二维码生成失败\n\n错误信息：${msg}`)
    throw e
  } finally {
    close_api(api)
  }
}

/**
 * 模式二：读取已生成的二维码密钥，轮询等待用户扫码确认
 */
async function waitMode() {
  const api = startService()
  try {
    await waitForApi()
  } catch (e) {
    close_api(api)
    throw e
  }
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'))
  } catch {
    throw new Error('未找到二维码密钥文件，请确认已先运行「生成登录二维码图片」步骤')
  }
  const { number, keys } = parsed
  const USERINFO = process.env.USERINFO
  const APPEND_USER = process.env.APPEND_USER
  const userinfo = (USERINFO && APPEND_USER == "是") ? JSON.parse(USERINFO) : []

  const results = [] // 收集每个账号的扫码结果用于 Summary

  try {
    for (let n = 0; n < number; n++) {
      const qrcode = keys[n]
      if (!qrcode) {
        printRed(`第 ${n + 1}/${number} 个账号的二维码密钥缺失，跳过`)
        results.push({ index: n + 1, status: '密钥缺失' })
        continue
      }
      printMagenta(`\n正在等待第 ${n + 1}/${number} 个账号扫码登录...`)
      let loggedIn = false
      let expireFlag = false
      for (let i = 0; i < 30; i++) {
        const timestrap = Date.now();
        const res = await send(`/login/qr/check?key=${qrcode}&timestrap=${timestrap}`, "GET", {})
        const status = res?.data?.status
        switch (status) {
          case 0:
            printYellow("二维码已过期，请重新运行工作流生成新二维码")
            expireFlag = true
            break
          case 1:
            // 未扫描二维码
            break
          case 2:
            // 二维码未确认，请点击确认登录
            break
          case 4:
            printGreen("登录成功！")
            upsertUser(userinfo, { userid: res.data.userid, token: res.data.token }, APPEND_USER == "是")
            loggedIn = true
            break
          default:
            printRed("请求出错")
            console.dir(summarizeResponse(res), { depth: null })
        }
        if (loggedIn || expireFlag) {
          break
        }
        if (i === 29) {
          printRed("等待超时\n")
        }
        // 前 10 次用 3 秒间隔（快速响应），之后用 5 秒间隔
        await delay(i < 10 ? 3000 : 5000)
      }
      results.push({
        index: n + 1,
        status: loggedIn ? '✅ 登录成功' : (expireFlag ? '❌ 二维码过期' : '❌ 等待超时')
      })
    }
    saveUserinfo(userinfo)

    // 写入扫码结果到 Summary
    const resultLines = results.map(r => `- 账号 ${r.index}/${number}：${r.status}`).join('\n')
    appendSummary(`### 扫码结果\n\n${resultLines}`)
  } finally {
    close_api(api)
  }
}

const mode = process.argv[2] || 'gen'
if (mode === 'wait') {
  waitMode().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
} else {
  genMode().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
}
