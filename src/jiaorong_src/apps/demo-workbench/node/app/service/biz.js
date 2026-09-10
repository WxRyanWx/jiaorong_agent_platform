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
  /**
   * 调 SDK 之前改写入参。脚手架原样返回。
   * @param {string} _method SDK 方法名（脚手架未用）
   * @param {*} args 前端传来的 args
   * @returns {Promise<*>} 交给 jiaorong.invoke 的 args
   */
  async beforeInvoke(_method, args) {
    return args
  }

  /**
   * 调 SDK 之后改写出参。脚手架原样返回。
   * @param {string} _method SDK 方法名（脚手架未用）
   * @param {*} _args 已交给 SDK 的 args（脚手架未用）
   * @param {*} data SDK 返回值
   * @returns {Promise<*>} 写入 HTTP 响应 data 字段
   */
  async afterInvoke(_method, _args, data) {
    return data
  }
}

module.exports = BizService
