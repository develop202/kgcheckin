import { createRequire } from 'module'
import fs from 'node:fs'
import { close_api, delay, send, startService } from "./utils/utils.js";
import { printGreen, printMagenta, printRed, printYellow } from "./utils/colorOut.js";
import { summarizeResponse } from "./utils/safeLog.js";
import { upsertUser, saveUserinfo } from "./utils/userinfo.js";

const require = createRequire(import.meta.url)
const QRCode = require('./api/node_modules/qrcode')

/**
 * 渲染 QR 矩阵为纯 ASCII 文本（无 ANSI 转义码）
 * 每个模块用双字符宽度，保证在等宽字体下比例正确
 * @param {string} url - 需要编码为二维码的 URL
 * @returns {string} ASCII 二维码文本
 */
function renderQrAscii(url) {
  const qr = QRCode.create(url, { margin: 2 })
  const modules = qr.modules
  const size = modules.size
  let ascii = ''
  for (let r = 0; r < size; r++) {
    let line = ''
    for (let c = 0; c < size; c++) {
      line += modules.get(r, c) ? '██' : '  '
    }
    ascii += line + '\n'
  }
  return ascii
}

/**
 * 显示二维码
 * - 日志: 直接输出 ASCII 二维码（纯 Unicode，无 ANSI 码）
 * - Summary: 写入 qr-summary.md，供 workflow 在 step 结束后写入 $GITHUB_STEP_SUMMARY
 * - PNG: 保存为文件供 artifact 下载
 * @param {string} url - 需要编码为二维码的 URL
 * @param {number} index - 当前是第几个二维码（从1开始）
 * @param {number} total - 总共需要登录几个账号
 */
async function displayQrcode(url, index, total) {
  const ascii = renderQrAscii(url)

  // 1. 输出到日志（实时可见，用户可在此扫码）
  const header = total > 1 ? `（第 ${index}/${total} 个账号）` : ''
  printMagenta(`\n请使用酷狗音乐 APP 扫描下方二维码登录${header}`)
  console.log(ascii)
  printMagenta('如二维码无法扫描，请复制此链接到浏览器打开扫码：')
  console.log(url)
  console.log('')

  // 2. 保存 PNG 文件，供 workflow 上传为 artifact
  try {
    await QRCode.toFile('./qr-code.png', url, { width: 256, margin: 2 })
  } catch {
    // PNG 保存失败不影响主流程
  }

  // 3. 写入 Markdown 文件，供 workflow 在 step 结束后写入 $GITHUB_STEP_SUMMARY
  const md = [
    `## 🎵 酷狗音乐扫码登录${header}`,
    '',
    '请使用 **酷狗音乐 APP** 扫描下方二维码登录',
    '',
    '```',
    ascii,
    '```',
    '',
    `或复制此链接到浏览器打开扫码：`,
    '',
    url,
    '',
  ].join('\n')

  try {
    if (index === 1) {
      fs.writeFileSync('./qr-summary.md', md)
    } else {
      fs.appendFileSync('./qr-summary.md', '\n---\n\n' + md)
    }
  } catch {
    // 文件写入失败不影响主流程
  }
}

async function qrcode() {

  // 启动服务
  const api = startService()
  await delay(2000)
  let qrcode = ""
  const USERINFO = process.env.USERINFO
  const APPEND_USER = process.env.APPEND_USER
  const userinfo = (USERINFO && APPEND_USER == "是") ? JSON.parse(USERINFO) : []
  const args = process.argv.slice(2);
  const number = parseInt(process.env.NUMBER || args[0] || "1")
  try {
    for (let n = 0; n < number; n++) {
      // 二维码
      const result = await send(`/login/qr/key?timestrap=${Date.now()}`, "GET", {})
      if (result.status === 1) {
        qrcode = result.data.qrcode
        const qrUrl = `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${qrcode}`
        await displayQrcode(qrUrl, n + 1, number)
      } else {
        printRed("响应内容")
        console.dir(summarizeResponse(result), { depth: null })
        throw new Error("请求出错")
      }
      printMagenta("正在等待，请扫描二维码并确定登录")
      // 登录
      for (let i = 0; i < 25; i++) {
        const timestrap = Date.now();
        const res = await send(`/login/qr/check?key=${qrcode}&timestrap=${timestrap}`, "GET", {})
        const status = res?.data?.status
        switch (status) {
          case 0:
            printYellow("二维码已过期")
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
            break

          default:
            printRed("请求出错")
            console.dir(summarizeResponse(res), { depth: null })
        }
        if (status == 4 || status == 0) {
          break
        }
        if (i == 24) {
          printRed("等待超时\n")
          break
        }
        await delay(5000)
      }
    }
    saveUserinfo(userinfo)
  } finally {
    close_api(api)
  }

  if (api.killed) {
    process.exit(0)
  }
}

qrcode()
