import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import AppsPane from '@jiaorong/open-platform/renderer/AppsPane.vue'
import type { OpenPlatformClient } from '@jiaorong/api/openPlatform/types'
import type { OpenPlatformAppCapabilities } from '@jiaorong/open-platform/renderer/clientAppCapabilities'
import type { OpenPlatformAppCard } from '@jiaorong/open-platform/renderer/useOpenPlatformApps'
import type { AppManifestFormFields } from '@jiaorong/appHost/manifestRules'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@iconify/vue', () => ({
  Icon: { template: '<span />' }
}))

vi.mock('@arco-design/web-vue', () => ({
  Button: {
    props: ['disabled', 'size', 'type', 'status', 'testId'],
    emits: ['click'],
    template:
      '<button type="button" :disabled="disabled" :data-testid="testId" @click="$emit(\'click\', $event)"><slot /></button>'
  },
  Popconfirm: {
    props: ['popupVisible'],
    emits: ['ok', 'update:popupVisible'],
    template: '<span><slot /></span>'
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

vi.mock('@/components/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() })
}))

vi.mock('@/stores/ui/project', () => ({
  useProjectStore: () => ({ openDirectory: vi.fn() })
}))

vi.mock('@jiaorong/open-platform/renderer/useRefreshOnReactivate', () => ({
  useRefreshOnReactivate: vi.fn()
}))

const app: OpenPlatformAppCard = {
  id: 'test-app',
  name: 'Test app',
  description: 'Test app',
  iconSrc: '',
  version: '1.0.0',
  publishedVersion: '1.0.0',
  installStatus: 'installed',
  openable: false,
  provider: 'Test provider',
  dir: '/tmp/test-app',
  serverStatus: 'published',
  serverUpdatedAt: '',
  serverAuth: {
    orgs: [],
    orgNames: 'a'.repeat(205),
    userIds: [],
    phones: []
  },
  serverProvider: 'Test provider'
}

const fields: AppManifestFormFields = {
  id: 'test-app',
  name: 'Test app',
  version: '1.0.1',
  entry: 'web-ui/index.html',
  slot: 'app-center',
  source: 'store',
  icon: '',
  description: 'b'.repeat(205),
  spawn: 'node node/main.js'
}

const appMocks = vi.hoisted(() => ({
  publish: vi.fn(),
  pickZip: vi.fn(),
  peekZip: vi.fn()
}))

vi.mock('@jiaorong/open-platform/renderer/useOpenPlatformApps', () => ({
  useOpenPlatformApps: () => ({
    apps: ref([app]),
    lastError: ref(null),
    isBusy: ref(false),
    isServerListLoading: ref(false),
    refresh: vi.fn(),
    requestRefresh: vi.fn(),
    serverError: ref(''),
    create: vi.fn(),
    remove: vi.fn(),
    publish: appMocks.publish,
    pickZip: appMocks.pickZip,
    peekZip: appMocks.peekZip,
    open: vi.fn(),
    unpublish: vi.fn()
  })
}))

function mountAppsPane() {
  return mount(AppsPane, {
    props: {
      api: {} as OpenPlatformClient,
      capabilities: {} as OpenPlatformAppCapabilities
    }
  })
}

async function openPublishDialog(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-testid="open-platform-app-publish-test-app"]').trigger('click')
  await flushPromises()
}

describe('open platform app publish dialog', () => {
  beforeEach(() => {
    appMocks.publish.mockReset()
    appMocks.pickZip.mockReset()
    appMocks.peekZip.mockReset()
    appMocks.pickZip.mockResolvedValue('/tmp/test-app.zip')
    appMocks.peekZip.mockResolvedValue(fields)
  })

  it('restores the normalized version when a later edit would otherwise leave stale DOM text', async () => {
    const wrapper = mountAppsPane()
    await openPublishDialog(wrapper)
    const input = wrapper.get('input[placeholder="1.0.0"]')

    await input.setValue('12.34.23')
    await input.setValue('12.34.2')
    await input.setValue('12.345.2')

    expect((input.element as HTMLInputElement).value).toBe('12.34.2')
    wrapper.unmount()
  })

  it('limits the description and visible organizations to 200 characters', async () => {
    const wrapper = mountAppsPane()
    await openPublishDialog(wrapper)

    const description = wrapper.get('textarea.open-platform-pane__desc-input')
    const organizations = wrapper.get('textarea.open-platform-pane__auth-input')
    expect(description.attributes('maxlength')).toBe('200')
    expect(organizations.attributes('maxlength')).toBe('200')
    expect((organizations.element as HTMLTextAreaElement).value).toHaveLength(200)

    const chooseZip = wrapper
      .findAll('button')
      .find((button) => button.text() === 'routes.devCenterPublishZipPick')
    expect(chooseZip).toBeTruthy()
    await chooseZip?.trigger('click')
    await flushPromises()

    expect((description.element as HTMLTextAreaElement).value).toBe('b'.repeat(200))
    /** 回填后「后台进程」也要跟着 zip 内 app.json 更新。 */
    const spawnInput = wrapper.get('input[placeholder="node node/server.js"]')
    expect((spawnInput.element as HTMLInputElement).value).toBe('node node/main.js')
    await description.setValue('c'.repeat(201))
    expect((description.element as HTMLTextAreaElement).value).toBe('c'.repeat(200))
    await organizations.setValue('d'.repeat(201))
    expect((organizations.element as HTMLTextAreaElement).value).toBe('d'.repeat(200))
    wrapper.unmount()
  })

  it('shows the zip read error instead of silently clearing the form', async () => {
    appMocks.peekZip.mockRejectedValue(new Error('zip 包里没有 app.json'))
    const wrapper = mountAppsPane()
    await openPublishDialog(wrapper)

    const chooseZip = wrapper
      .findAll('button')
      .find((button) => button.text() === 'routes.devCenterPublishZipPick')
    expect(chooseZip).toBeTruthy()
    await chooseZip?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('zip 包里没有 app.json')
    wrapper.unmount()
  })
})
