import { describe, expect, it } from 'vitest'
import {
  displaySkillLabel,
  normalizeSlashCommands
} from '../../../src/jiaorong_src/apps/app-scaffold/web/src/components/jiaorongagentchat/lib/slashCommands'
import { buildTranscript } from '../../../src/jiaorong_src/apps/app-scaffold/web/src/components/jiaorongagentchat/lib/transcript'
import {
  getFileTypeIcon,
  isImageAttachment
} from '../../../src/jiaorong_src/apps/app-scaffold/web/src/components/jiaorongagentchat/lib/fileTypeIcon'

describe('normalizeSlashCommands', () => {
  it('turns skillDir into app-scoped skill names and ignores empty input', () => {
    expect(normalizeSlashCommands(undefined, 'demo-workbench')).toEqual([])
    expect(normalizeSlashCommands([], 'demo-workbench')).toEqual([])
    expect(
      normalizeSlashCommands(
        [
          {
            category: 'skill',
            skillDir: 'skill/parse-pdf',
            label: '解析 PDF',
            description: '读 PDF'
          },
          { category: 'tool', name: 'web_search', label: '网页搜索' }
        ],
        'demo-workbench'
      )
    ).toEqual([
      {
        id: 'skill:app.demo-workbench.parse-pdf',
        category: 'skill',
        label: '解析 PDF',
        description: '读 PDF',
        skillName: 'app.demo-workbench.parse-pdf',
        insertText: undefined
      },
      {
        id: 'tool:web_search',
        category: 'tool',
        label: '网页搜索',
        description: undefined,
        skillName: undefined,
        insertText: '@网页搜索 '
      }
    ])
  })

  it('does not double-prefix a skillDir that is already app.{appId}.{dir}', () => {
    expect(
      normalizeSlashCommands(
        [{ category: 'skill', skillDir: 'app.demo-workbench.weekly-report', label: '周报整理' }],
        'demo-workbench'
      )
    ).toEqual([
      {
        id: 'skill:app.demo-workbench.weekly-report',
        category: 'skill',
        label: '周报整理',
        description: undefined,
        skillName: 'app.demo-workbench.weekly-report',
        insertText: undefined
      }
    ])
  })
})

describe('displaySkillLabel', () => {
  it('prefers slash item labels and maps doubled app-prefixed names', () => {
    const items = [{ skillName: 'app.demo-workbench.weekly-report', label: '周报整理' }]
    expect(displaySkillLabel('app.demo-workbench.weekly-report', items)).toBe('周报整理')
    expect(displaySkillLabel('app.demo-workbench.app.demo-workbench.weekly-report', items)).toBe(
      '周报整理'
    )
    expect(displaySkillLabel('app.demo-workbench.weekly-report', [])).toBe('weekly-report')
  })
})

describe('buildTranscript', () => {
  it('keeps image thumbnail and path on user attachments', () => {
    const [item] = buildTranscript([
      {
        id: 'm1',
        sessionId: 's1',
        orderSeq: 1,
        role: 'user',
        content: JSON.stringify({
          text: '读这个图片',
          files: [
            {
              name: '111.png',
              path: '/tmp/111.png',
              mimeType: 'image/png',
              thumbnail: 'data:image/png;base64,abc'
            }
          ]
        }),
        status: 'sent',
        isContextEdge: 0,
        metadata: '',
        createdAt: 1,
        updatedAt: 1
      }
    ])
    expect(item.files).toEqual([
      {
        name: '111.png',
        mimeType: 'image/png',
        path: '/tmp/111.png',
        thumbnail: 'data:image/png;base64,abc'
      }
    ])
  })
})

describe('getFileTypeIcon', () => {
  it('uses vscode image icons for pictures instead of the text document icon', () => {
    expect(isImageAttachment('111.png')).toBe(true)
    expect(getFileTypeIcon('111.png')).toBe('vscode-icons:file-type-image')
    expect(getFileTypeIcon('a.pdf')).toBe('vscode-icons:file-type-pdf2')
    expect(getFileTypeIcon('a.docx')).toBe('vscode-icons:file-type-word')
    expect(getFileTypeIcon('unknown.bin')).toBe('vscode-icons:default-file')
  })
})

describe('normalizeSlashCommands', () => {
  it('turns skillDir into app-scoped skill names and ignores empty input', () => {
    expect(normalizeSlashCommands(undefined, 'demo-workbench')).toEqual([])
    expect(normalizeSlashCommands([], 'demo-workbench')).toEqual([])
    expect(
      normalizeSlashCommands(
        [
          {
            category: 'skill',
            skillDir: 'skill/parse-pdf',
            label: '解析 PDF',
            description: '读 PDF'
          },
          { category: 'tool', name: 'web_search', label: '网页搜索' }
        ],
        'demo-workbench'
      )
    ).toEqual([
      {
        id: 'skill:app.demo-workbench.parse-pdf',
        category: 'skill',
        label: '解析 PDF',
        description: '读 PDF',
        skillName: 'app.demo-workbench.parse-pdf',
        insertText: undefined
      },
      {
        id: 'tool:web_search',
        category: 'tool',
        label: '网页搜索',
        description: undefined,
        skillName: undefined,
        insertText: '@网页搜索 '
      }
    ])
  })
})

describe('getFileTypeIcon', () => {
  it('uses vscode image icons for pictures instead of the text document icon', () => {
    expect(isImageAttachment('111.png')).toBe(true)
    expect(getFileTypeIcon('111.png')).toBe('vscode-icons:file-type-image')
    expect(getFileTypeIcon('a.pdf')).toBe('vscode-icons:file-type-pdf2')
    expect(getFileTypeIcon('a.docx')).toBe('vscode-icons:file-type-word')
    expect(getFileTypeIcon('unknown.bin')).toBe('vscode-icons:default-file')
  })
})
