'use strict'

const { Service } = require('egg')

/**
 * 业务扩展点。脚手架默认原样转发，不改入参和出参。
 *
 * 团队在这里加鉴权、审计、改写 args / data。
 * 不要改 pageHost 或 service/jiaorong.js 的转发层。
 *
 * beforeInvoke(method, args) → 真正传给宿主的 args
 * afterInvoke(method, args, data) → 返回给页面的 data
 */
class BizService extends Service {
  /**
   * 调宿主之前改写入参。脚手架原样返回。
   * @param {string} _method 方法名（脚手架未用）
   * @param {*} args 前端传来的 args
   * @returns {Promise<*>} 交给 jiaorong.invoke 的 args
   */
  async beforeInvoke(_method, args) {
    return args
  }

  /**
   * 调宿主之后改写出参。脚手架原样返回。
   * @param {string} _method 方法名（脚手架未用）
   * @param {*} _args 已交给宿主的 args（脚手架未用）
   * @param {*} data 宿主返回值
   * @returns {Promise<*>} 写入页面回包
   */
  async afterInvoke(_method, _args, data) {
    return data
  }
}

module.exports = BizService
