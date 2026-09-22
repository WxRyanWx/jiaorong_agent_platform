import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { useNativeViewOcclusion } from '@/composables/useNativeViewOcclusion'

const Host = defineComponent({
  setup() {
    return useNativeViewOcclusion()
  },
  template: '<div />'
})

describe('useNativeViewOcclusion', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('treats mermaid fullscreen as a native-view occlusion', async () => {
    const wrapper = mount(Host)
    await nextTick()
    expect(wrapper.vm.isOccluded).toBe(false)

    const portal = document.createElement('div')
    portal.className = 'markstream-vue'
    document.body.appendChild(portal)
    await Promise.resolve()
    await nextTick()
    expect(wrapper.vm.isOccluded).toBe(false)

    const overlay = document.createElement('div')
    overlay.className = 'mermaid-modal-overlay'
    portal.appendChild(overlay)
    await Promise.resolve()
    await nextTick()

    expect(wrapper.vm.isOccluded).toBe(true)

    overlay.remove()
    await Promise.resolve()
    await nextTick()
    expect(wrapper.vm.isOccluded).toBe(false)
    wrapper.unmount()
  })

  it('treats dialog overlays as a native-view occlusion', async () => {
    const wrapper = mount(Host)
    await nextTick()

    const overlay = document.createElement('div')
    overlay.setAttribute('data-slot', 'dialog-overlay')
    document.body.appendChild(overlay)
    await Promise.resolve()
    await nextTick()

    expect(wrapper.vm.isOccluded).toBe(true)
    wrapper.unmount()
  })
})
