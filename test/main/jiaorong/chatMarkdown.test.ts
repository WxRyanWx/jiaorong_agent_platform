import { describe, expect, it } from 'vitest'
import { renderChatMarkdown } from '../../../src/jiaorong_src/apps/app-scaffold/web/src/components/jiaorongagentchat/lib/chatMarkdown'

describe('renderChatMarkdown', () => {
  it('renders GFM tables, horizontal rules, and inline emphasis', () => {
    const html = renderChatMarkdown(`**安全约束**

说明文字

---

**开发调试**

| 浏览器 | 安装测试 | 使用测试 | 备注 |
| --- | --- | --- | --- |
| Google Chrome | ✅ 成功 | ✅ 成功 | |
| Microsoft Edge | ✅ 成功 | ✅ 成功 | |
`)

    expect(html).toContain('<strong>安全约束</strong>')
    expect(html).toContain('<hr>')
    expect(html).toContain('<strong>开发调试</strong>')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>浏览器</th>')
    expect(html).toContain('<td>Google Chrome</td>')
    expect(html).toContain('<td>✅ 成功</td>')
    expect(html).not.toContain('|---|')
    expect(html).not.toMatch(/<p>[^<]*\|/)
  })
})
