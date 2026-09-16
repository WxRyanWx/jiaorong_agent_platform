'use strict'

const fs = require('node:fs')
const path = require('node:path')

/**
 * 从上级 app.json 读应用 id，给本机 `node server.js` 用。
 * 无参数。
 * 返回：清单里的 id；读失败或字段不合法时回退 `demo-workbench`。
 */
function readManifestAppId() {
  try {
    const file = path.join(__dirname, '../../app.json')
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    // id 必须是非空字符串，避免空串覆盖环境变量回退。
    if (typeof parsed.id === 'string' && parsed.id.trim()) return parsed.id.trim()
  } catch {
    // 文件不存在或 JSON 坏了：走默认 id，不打断 Egg 启动。
  }
  return 'app-scaffold'
}

/**
 * Egg 默认配置。
 *
 * 本机脚手架：关掉 CSRF / X-Frame，开 CORS。
 * 端口与 appId 跟宿主 spawn 环境变量对齐。单独 `node server.js` 时从上级 app.json 读 id。
 */
module.exports = {
  keys: 'app-scaffold-keys',
  middleware: ['cors'],
  security: {
    csrf: {
      enable: false
    },
    xframe: {
      enable: false
    }
  },
  bodyParser: {
    jsonLimit: '20mb',
    formLimit: '20mb'
  },
  jiaorong: {
    // appId：优先宿主注入；本机调试再读清单。
    appId: process.env.JIAORONG_APP_ID || readManifestAppId(),
    // port：写进 /api/health，方便页面确认实际端口。
    port: Number(process.env.JIAORONG_NODE_PORT || 0)
  }
}
