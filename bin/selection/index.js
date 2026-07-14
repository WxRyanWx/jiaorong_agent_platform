'use strict'
const platform = process.platform
const binaryName = platform === 'win32' ? 'selection.win32.node' : 'selection.node'
module.exports = require('./' + binaryName)
