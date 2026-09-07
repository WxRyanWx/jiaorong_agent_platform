'use strict'

/**
 * 本机脚手架：关掉 CSRF / X-Frame，开 CORS。
 * 端口与 appId 跟宿主 spawn 环境变量对齐。
 */
module.exports = {
  keys: 'demo-workbench-scaffold',
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
    appId: process.env.JIAORONG_APP_ID || 'demo-workbench',
    port: Number(process.env.JIAORONG_NODE_PORT || 8787)
  }
}
