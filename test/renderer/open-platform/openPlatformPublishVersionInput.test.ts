import { Input } from '@arco-design/web-vue'
import { Input as ShadcnInput } from '@shadcn/components/ui/input'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { normalizeOpenPlatformPublishVersionInput } from '@jiaorong/api/openPlatform/version'

const MAX_LENGTH = 8

function getInputLength(value: string): number {
  return normalizeOpenPlatformPublishVersionInput(value) === value ? value.length : MAX_LENGTH + 1
}

const VersionInput = defineComponent({
  components: { Input },
  setup() {
    const value = ref('')
    return {
      value,
      getInputLength,
      normalizeOpenPlatformPublishVersionInput
    }
  },
  template: `
    <Input
      v-model="value"
      :max-length="8"
      :word-length="getInputLength"
      :word-slice="normalizeOpenPlatformPublishVersionInput"
    />
  `
})

const AppVersionInput = defineComponent({
  components: { ShadcnInput },
  setup() {
    const value = ref('')
    const handleInput = (input: string | number) => {
      value.value = normalizeOpenPlatformPublishVersionInput(input)
    }
    return { value, handleInput }
  },
  template: `
    <ShadcnInput
      :model-value="value"
      :maxlength="8"
      @update:model-value="handleInput"
    />
  `
})

describe('open platform publish version input', () => {
  it('normalizes pasted and continuously typed values to two digits per segment', async () => {
    const wrapper = mount(VersionInput, { attachTo: document.body })
    const input = wrapper.get('input')

    await input.setValue('99.1212.123')
    await nextTick()

    expect((input.element as HTMLInputElement).value).toBe('99.12.12')
    expect((wrapper.vm as unknown as { value: string }).value).toBe('99.12.12')
    wrapper.unmount()
  })

  it('normalizes the app version input through the shadcn update event', async () => {
    const wrapper = mount(AppVersionInput, { attachTo: document.body })
    const input = wrapper.get('input')

    expect(input.attributes('maxlength')).toBe('8')
    await input.setValue('99.99.9999')
    await nextTick()

    expect((input.element as HTMLInputElement).value).toBe('99.99.99')
    expect((wrapper.vm as unknown as { value: string }).value).toBe('99.99.99')
    wrapper.unmount()
  })
})
