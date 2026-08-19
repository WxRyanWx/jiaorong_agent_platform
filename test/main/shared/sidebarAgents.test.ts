import { describe, expect, it } from 'vitest'
import { partitionSidebarAgents } from '@shared/sidebarAgents'

describe('partitionSidebarAgents', () => {
  it('pins builtin deepchat ahead of user agents', () => {
    const agents = [
      { id: 'acp-a', name: 'ACP A' },
      { id: 'deepchat', name: '交融对话' },
      { id: 'user-1', name: 'User' }
    ]

    expect(partitionSidebarAgents(agents)).toEqual({
      deepchat: { id: 'deepchat', name: '交融对话' },
      userAgents: [
        { id: 'acp-a', name: 'ACP A' },
        { id: 'user-1', name: 'User' }
      ]
    })
  })

  it('returns undefined deepchat when the builtin agent is missing', () => {
    const agents = [{ id: 'acp-a', name: 'ACP A' }]
    expect(partitionSidebarAgents(agents)).toEqual({
      deepchat: undefined,
      userAgents: agents
    })
  })
})
