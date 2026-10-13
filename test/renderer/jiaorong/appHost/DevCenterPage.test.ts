import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import DevCenterPage from '@jiaorong/appHost/devCenter/renderer/DevCenterPage.vue'
import type { JiaorongDevCenterItem } from '@jiaorong/appHost/types'
import type { AppManifestFormFields } from '@jiaorong/appHost/manifestRules'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@iconify/vue', () => ({
  Icon: { template: '<span />' }
}))

vi.mock('@shadcn/components/ui/button', () => ({
  Button: {
    props: ['disabled', 'size', 'variant'],
    emits: ['click'],
    template:
      '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
  }
}))

vi.mock('@shadcn/components/ui/dialog', () => ({
  Dialog: {
    props: ['open'],
    template: '<div v-if="open"><slot /></div>'
  },
  DialogContent: { template: '<div><slot /></div>' },
  DialogDescription: { template: '<div><slot /></div>' },
  DialogFooter: { template: '<div><slot /></div>' },
  DialogHeader: { template: '<div><slot /></div>' },
  DialogTitle: { template: '<div><slot /></div>' }
}))

vi.mock('@shadcn/components/ui/input', () => ({
  Input: {
    props: ['disabled', 'modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    template:
      '<input :disabled="disabled" :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  }
}))

vi.mock('@shadcn/components/ui/textarea', () => ({
  Textarea: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>'
  }
}))

vi.mock('@shadcn/components/ui/tooltip', () => ({
  Tooltip: { template: '<div><slot /></div>' },
  TooltipContent: { template: '<div><slot /></div>' },
  TooltipProvider: { template: '<div><slot /></div>' },
  TooltipTrigger: { template: '<span><slot /></span>' }
}))

const toastMock = vi.fn()

vi.mock('@/components/use-toast', () => ({
  useToast: () => ({ toast: toastMock })
}))

vi.mock('@/stores/ui/project', () => ({
  useProjectStore: () => ({ openDirectory: vi.fn() })
}))

vi.mock('@api/runtime', () => ({
  openRuntimeExternal: vi.fn()
}))

const app: JiaorongDevCenterItem = {
  id: 'test-app',
  name: 'Test App',
  description: '',
  iconSrc: '',
  version: '1.0.0',
  installStatus: 'installed',
  openable: true,
  provider: '',
  dir: '/tmp/test-app'
}

const fields: AppManifestFormFields = {
  id: 'test-app',
  name: 'Test App',
  version: '1.0.1',
  entry: 'web-ui/index.html',
  slot: 'app-center',
  icon: '',
  description: '',
  spawn: ''
}

const publishMock = vi.fn()

vi.mock('@jiaorong/appHost/devCenter/renderer/useJiaorongDevCenter', () => ({
  useJiaorongDevCenter: () => ({
    apps: [app],
    lastError: ref(null),
    isBusy: false,
    isOpening: () => false,
    create: vi.fn(),
    remove: vi.fn(),
    publish: publishMock,
    pickZip: vi.fn(async () => '/tmp/app.zip'),
    peekZip: vi.fn(async () => fields),
    open: vi.fn()
  })
}))

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll('button').find((item) => item.text() === text)
  expect(button).toBeTruthy()
  return button
}

describe('DevCenterPage', () => {
  beforeEach(() => {
    publishMock.mockReset()
    toastMock.mockClear()
  })

  it('keeps the dialog open while publishing and closes it after success', async () => {
    let resolvePublish: (value: boolean) => void = () => undefined
    publishMock.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolvePublish = resolve
        })
    )
    const wrapper = mount(DevCenterPage)

    await wrapper.find('[data-testid="dev-center-publish-test-app"]').trigger('click')
    await flushPromises()
    await findButton(wrapper, 'routes.devCenterPublishZipPick').trigger('click')
    await flushPromises()
    await findButton(wrapper, 'routes.devCenterConfirm').trigger('click')
    await flushPromises()

    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-app' }), {
      manifestJson: expect.any(String),
      zipPath: '/tmp/app.zip'
    })
    expect(wrapper.find('[data-testid="dev-center-publish-id"]').exists()).toBe(true)
    expect(findButton(wrapper, 'routes.devCenterCancel').attributes('disabled')).toBeDefined()

    resolvePublish(true)
    await flushPromises()

    expect(wrapper.find('[data-testid="dev-center-publish-id"]').exists()).toBe(false)
    expect(toastMock).toHaveBeenCalledWith({ title: 'routes.devCenterPublishPending' })
  })
})
