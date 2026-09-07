'use strict'

const { Service } = require('egg')

/**
 * 业务扩展点。脚手架默认原样转发，不改 SDK 入参和出参。
 *
 * 团队在这里加鉴权、审计、改写 args / data。
 * 不要改 controller/sdk.js 或 service/jiaorong.js 的转发层。
 *
 * beforeInvoke(method, args) → 真正传给 SDK 的 args
 * afterInvoke(method, args, data) → 返回给前端的 data
 */
class BizService extends Service {
  async beforeInvoke(_method, args) {
    return args
  }

  async afterInvoke(_method, _args, data) {
    return data
  }
}

module.exports = BizService
