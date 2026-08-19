import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import KnowledgeBaseSelectionChips from '@jiaorong/knowledgeBase/picker/KnowledgeBaseSelectionChips.vue'
import {
  clearKnowledgeBaseSelectionForSession,
  useKnowledgeBaseSelection
} from '@jiaorong/knowledgeBase/picker/useKnowledgeBaseSelection'

const SESSION_ID = 'kb-chips-scroll'

afterEach(() => {
  clearKnowledgeBaseSelectionForSession(SESSION_ID)
})

describe('KnowledgeBaseSelectionChips', () => {
  it('hides the echo area when nothing is selected', () => {
    const wrapper = mount(KnowledgeBaseSelectionChips, {
      props: { sessionId: SESSION_ID },
      global: {
        stubs: {
          Icon: true,
          KbIcon: true,
          KbFileTypeIcon: true
        }
      }
    })

    expect(wrapper.find('[data-testid="kb-selection-chips"]').exists()).toBe(false)
  })

  it('caps the echo area height and enables overflow scroll like master attachments', () => {
    const selection = useKnowledgeBaseSelection(() => SESSION_ID)
    selection.setItems(
      Array.from({ length: 20 }, (_, index) => ({
        key: `knowledgeBase:${index}`,
        kind: 'knowledgeBase' as const,
        id: String(index),
        name: `kb-${index}`
      }))
    )

    const wrapper = mount(KnowledgeBaseSelectionChips, {
      props: { sessionId: SESSION_ID },
      global: {
        stubs: {
          Icon: true,
          KbIcon: true,
          KbFileTypeIcon: true
        }
      }
    })

    const echo = wrapper.get('[data-testid="kb-selection-chips"]')
    expect(echo.classes()).toEqual(
      expect.arrayContaining(['kb-selection-chips', 'overflow-y-auto', 'overscroll-contain'])
    )
    expect(wrapper.findAll('[data-testid="kb-selection-chip"]')).toHaveLength(20)
  })
})
