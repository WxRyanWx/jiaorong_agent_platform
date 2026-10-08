/**
 * 终端问答：只用 `node:readline` 与 ANSI 转义，不引第三方依赖。
 *
 * 非交互终端由调用方（`bin/create-jiaorong-app.js`）提前降级成默认值，这里只负责问与答。
 */
import readline from 'node:readline'
import { UsageError } from './errors.js'

/** 问答被打断时的提示：输入流读到底（Ctrl+D、管道关掉），`question` 的回调不会再来。 */
const INPUT_CLOSED_HINT = '输入流已结束，问不下去了；请用命令行参数指定，或在交互终端里重跑'

/** 用户按 Ctrl+C 或 Esc 取消。 */
export class CancelledError extends Error {
  constructor() {
    super('已取消')
    this.name = 'CancelledError'
  }
}

/** ANSI 转义：清行、上移一行、加粗、暗色、重置。 */
const CLEAR_LINE = '\x1b[2K'
const MOVE_UP = '\x1b[1A'
/** 回到行首：配合换行与上移，保证每行都从第 0 列画起。 */
const LINE_START = '\r'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

/** 能不能进原始模式：能才画方向键菜单。 */
const isRawCapable = () =>
  Boolean(
    process.stdin.isTTY && process.stdout.isTTY && typeof process.stdin.setRawMode === 'function'
  )

/**
 * 问一行文本，空输入取默认值，校验不过就重问。
 * @param options message 提示语；initial 默认值；validate 返回字符串表示不通过
 * @returns 用户输入
 */
export const askText = async ({ message, initial = '', validate }) => {
  /** 行编辑器。 */
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  /** 默认值提示。 */
  const hint = initial ? ` ${DIM}(${initial})${RESET}` : ''
  try {
    for (;;) {
      /** 本次输入。 */
      const answer = await new Promise((resolve, reject) => {
        /** 是否已经落定：落定之后的 close / SIGINT 都要忽略，否则 `rl.close()` 会被当成中断。 */
        let isSettled = false
        /**
         * 落定：摘掉两个监听再交结果。
         * @param finish resolve 或 reject
         * @param value 答案或错误
         */
        const settle = (finish, value) => {
          if (isSettled) return
          isSettled = true
          rl.removeListener('close', onClose)
          rl.removeListener('SIGINT', onSigInt)
          finish(value)
        }
        /** 输入流结束（管道读完、Ctrl+D）：`question` 的回调不会再来，不兜住就永远挂着。 */
        const onClose = () => settle(reject, new UsageError(INPUT_CLOSED_HINT))
        /** Ctrl+C：readline 会把 SIGINT 吞掉并直接关流，接住它才算「用户取消」。 */
        const onSigInt = () => settle(reject, new CancelledError())
        rl.once('close', onClose)
        rl.once('SIGINT', onSigInt)
        rl.question(`${BOLD}?${RESET} ${message}${hint} `, (value) => settle(resolve, value))
      })
      /** 去空白，空输入取默认值。 */
      const value = answer.trim() || String(initial)
      /** 校验结果。 */
      const invalid = validate?.(value)
      if (!invalid) return value
      console.log(`  ${DIM}${invalid}${RESET}`)
    }
  } finally {
    rl.close()
  }
}

/**
 * 画一个方向键菜单，回传选中下标。
 * @param options message 提示语；labels 每项文案；initial 初始下标；onKey 额外按键 → 下标
 * @returns 选中下标
 */
const pickIndex = ({ message, labels, initial = 0, onKey }) =>
  new Promise((resolve, reject) => {
    /** 当前下标。 */
    let index = Math.min(Math.max(initial, 0), labels.length - 1)
    /** 菜单行数，重绘前先退回去。 */
    const rows = labels.length
    /** 是否已经落定：落定后同一批按键剩下的不再处理。 */
    let settled = false

    /** 画一次菜单。 */
    const draw = () => {
      /** 每行文案：选中项加粗带箭头。 */
      const lines = labels.map((label, position) =>
        position === index
          ? `${CLEAR_LINE}  ${BOLD}› ${label}${RESET}`
          : `${CLEAR_LINE}  ${DIM}${label}${RESET}`
      )
      process.stdout.write(`${CLEAR_LINE}${BOLD}?${RESET} ${message}\r\n${lines.join('\r\n')}`)
    }

    /** 光标退回菜单开头。 */
    const rewind = () => {
      for (let step = 0; step < rows; step += 1) process.stdout.write(MOVE_UP)
      // 上移不换列，不回行首的话下一整行会缩进残留列
      process.stdout.write(LINE_START)
    }

    /**
     * 落定：把菜单压成一行结果。
     * 光标停在最后一个选项行，先整块擦掉「问题行 + 全部选项行」再写结果，
     * 否则后续输出行数更少时，屏幕上会留下没被覆盖的选项残影。
     */
    const settle = (chosen) => {
      settled = true
      cleanup()
      // 从当前选项行往上逐行清，清完光标正好落在问题行
      process.stdout.write(CLEAR_LINE)
      for (let step = 0; step < rows; step += 1) process.stdout.write(`${MOVE_UP}${CLEAR_LINE}`)
      process.stdout.write(
        `${LINE_START}${BOLD}?${RESET} ${message} ${DIM}${labels[chosen]}${RESET}\r\n`
      )
      resolve(chosen)
    }

    /** 退出原始模式并摘掉监听。 */
    const cleanup = () => {
      if (typeof process.stdin.setRawMode === 'function') process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeListener('data', onData)
    }

    /**
     * 处理一个按键。
     * @param key 单个按键，方向键是完整转义序列
     */
    const handleKey = (key) => {
      // Ctrl+C 与 Esc 都算取消
      if (key === '\u0003' || key === '\u001b') {
        settled = true
        cleanup()
        process.stdout.write('\r\n')
        reject(new CancelledError())
        return
      }
      // 回车确认当前项
      if (key === '\r' || key === '\n') {
        settle(index)
        return
      }
      /** 是不是「上」：CSI 与 SS3 两种写法都算。 */
      const isUp = key === '\x1b[A' || key === '\x1bOA'
      /** 是不是「下」：CSI 与 SS3 两种写法都算。 */
      const isDown = key === '\x1b[B' || key === '\x1bOB'
      // 上 / 下方向键
      if (isUp || isDown) {
        index = isUp ? (index - 1 + rows) % rows : (index + 1) % rows
        rewind()
        draw()
        return
      }
      /** 快捷键给出的下标，例如 y / n。 */
      const shortcut = onKey?.(key)
      if (shortcut !== undefined) {
        settle(shortcut)
        return
      }
      // 数字键直接选第几项
      const digit = Number(key)
      if (Number.isInteger(digit) && digit >= 1 && digit <= rows) settle(digit - 1)
    }

    /** 按键处理：一次可能粘过来多个按键，逐个处理，落定后停。 */
    const onData = (chunk) => {
      /** 本次输入。 */
      const text = String(chunk)
      for (let cursor = 0; cursor < text.length && !settled; cursor += 1) {
        // 方向键是「ESC + [ 或 O + 字母」三字符，整体当一个按键；
        // 只认 `[` 的话，发 SS3 序列（ESC O A）的终端会被当成单独的 Esc，直接把问答取消掉
        const isEscapeSequence =
          text[cursor] === '\x1b' &&
          (text[cursor + 1] === '[' || text[cursor + 1] === 'O') &&
          Boolean(text[cursor + 2])
        if (isEscapeSequence) {
          handleKey(text.slice(cursor, cursor + 3))
          cursor += 2
          continue
        }
        handleKey(text[cursor])
      }
    }

    // 进不了原始模式就退化成「输入序号」
    if (!isRawCapable()) {
      console.log(`${BOLD}?${RESET} ${message}`)
      labels.forEach((label, position) => console.log(`  ${position + 1}) ${label}`))
      void askText({ message: '输入序号', initial: String(initial + 1) })
        .then((value) => {
          /** 序号。 */
          const chosen = Number(value) - 1
          if (!Number.isInteger(chosen) || chosen < 0 || chosen >= rows)
            reject(new CancelledError())
          else resolve(chosen)
        })
        // askText 会因输入流结束或 Ctrl+C 而 reject，不接住就成了未处理的 rejection，外层永远挂着
        .catch((error) => reject(error))
      return
    }

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', onData)
    draw()
  })

/**
 * 单选。
 * @param options message 提示语；choices `{ title, value }[]`；initial 默认下标
 * @returns 选中项的 value
 */
export const askSelect = async ({ message, choices, initial = 0 }) => {
  /** 选中下标。 */
  const index = await pickIndex({
    message,
    labels: choices.map((choice) => choice.title),
    initial
  })
  return choices[index].value
}

/**
 * 是 / 否开关，额外支持 y 与 n 快捷键。
 * @param options message 提示语；active 选「是」的文案；inactive 选「否」的文案；initial 默认值
 * @returns 布尔值
 */
export const askToggle = async ({ message, active, inactive, initial = true }) => {
  /** 选中下标：0 是，1 否。 */
  const index = await pickIndex({
    message,
    labels: [active, inactive],
    initial: initial ? 0 : 1,
    onKey: (key) => {
      if (key === 'y' || key === 'Y') return 0
      if (key === 'n' || key === 'N') return 1
      return undefined
    }
  })
  return index === 0
}
