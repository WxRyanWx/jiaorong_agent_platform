import { createStartupClient } from '@api/StartupClient'
import { useAgentStore } from '@/stores/ui/agent'
import { useSessionStore } from '@/stores/ui/session'
import { useProjectStore } from '@/stores/ui/project'

type ShellBootstrap = Awaited<ReturnType<ReturnType<typeof createStartupClient>['getBootstrap']>>

/**
 * 壳层启动数据（agents / session shell / project path）幂等加载。
 * 必须与当前路由解耦：技能/知识库入口可先于 ChatTabView 挂载被点击。
 */
let shellBootstrapPromise: Promise<ShellBootstrap | null> | null = null

export function ensureShellBootstrap(): Promise<ShellBootstrap | null> {
  if (!shellBootstrapPromise) {
    shellBootstrapPromise = loadShellBootstrap().catch((error) => {
      shellBootstrapPromise = null
      throw error
    })
  }
  return shellBootstrapPromise
}

async function loadShellBootstrap(): Promise<ShellBootstrap | null> {
  const agentStore = useAgentStore()
  const sessionStore = useSessionStore()
  const projectStore = useProjectStore()

  try {
    const startupClient = createStartupClient()
    const bootstrap = await startupClient.getBootstrap()
    console.info(
      `[Startup][Renderer] shell.bootstrap.ready run=${bootstrap.startupRunId} agents=${bootstrap.agents.length} activeSession=${bootstrap.activeSessionId ?? 'none'}`
    )

    await sessionStore.applyBootstrapShell({
      activeSessionId: bootstrap.activeSessionId,
      activeSession: bootstrap.activeSession ?? null
    })
    agentStore.applyBootstrapAgents(bootstrap.agents)
    projectStore.applyBootstrapDefaultProjectPath(
      bootstrap.defaultProjectPath,
      bootstrap.defaultChatWorkspacePath ?? null
    )

    // 完整列表后台刷新；侧栏先用 bootstrap 里的内置 deepchat 显示
    void agentStore.fetchAgents()

    return bootstrap
  } catch (error) {
    console.warn('[Startup][Renderer] shell.bootstrap failed, falling back to fetchAgents:', error)
    await Promise.allSettled([agentStore.fetchAgents(), projectStore.loadDefaultProjectPath()])
    return null
  }
}
