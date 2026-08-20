import * as fs from 'node:fs'
import path from 'node:path'
import {
  CLI_COMMAND_DEFINITIONS,
  cliCommandKey,
  getAgentCliCommandContract
} from '@shared/contracts/cliCommands'
import {
  LOCAL_CONTROL_AGENT_TOKEN_ENV,
  LOCAL_CONTROL_E2E_USER_DATA_DIR_ENV,
  LOCAL_CONTROL_USER_DATA_DIR_ENV,
  type LocalControlScope
} from '@shared/contracts/localControl'
import type { CommandPermissionService } from '@/tool/permission/commandPermissionService'
import {
  parseAgentCliProgrammaticExecInvocation,
  type AgentCliTokenAuthority,
  type ArmedAgentCliProgrammaticToken
} from './agentTokenAuthority'
import { getCliSurfaceEntry } from './surface'
import type { ResolvedCommandShell } from '@shared/commandShell'

const AGENT_CLI_BASE_COMMANDS = new Set(['deepchat', 'jiaorong'])
const AGENT_CLI_COMMAND_PATTERN =
  /^(?:deepchat|jiaorong)\s+([a-z][a-z0-9-]*)\s+([a-z][a-z0-9-]*)(?:\s|$)/
const AGENT_CLI_COMMAND_TOKEN_TTL_MS = 5 * 60_000

function referencesAgentToken(command: string, commandShell: ResolvedCommandShell): boolean {
  return commandShell.dialect === 'posix'
    ? command.includes(LOCAL_CONTROL_AGENT_TOKEN_ENV)
    : command.toUpperCase().includes(LOCAL_CONTROL_AGENT_TOKEN_ENV)
}

export type AgentCommandEnvironment = Readonly<{
  variables: Readonly<Record<string, string>>
  prependPath: readonly string[]
  preserveCommand: boolean
}>

export type AgentCliCommandAccessOptions = Readonly<{
  tokenAuthority: Pick<AgentCliTokenAuthority, 'issue'>
  commandPermission: Pick<CommandPermissionService, 'extractBaseCommand' | 'hasShellControlSyntax'>
  resolveCliDirectory(): string | null
  resolveUserDataDirectory?: () => string | null
}>

type AgentCliCommandCapability = Readonly<{
  scopes: readonly LocalControlScope[]
}>

function createAgentCliCommandRegistry(): ReadonlyMap<string, AgentCliCommandCapability> {
  const registry = new Map<string, AgentCliCommandCapability>()
  for (const definition of CLI_COMMAND_DEFINITIONS) {
    const contract = getAgentCliCommandContract(definition)
    if (!contract) continue
    const surface = getCliSurfaceEntry(contract.name)
    if (!surface || !surface.callers.includes('agent') || surface.scopes.length === 0) {
      throw new Error(
        `Agent CLI command is not backed by an Agent-accessible surface: ${definition.domain} ${definition.verb}`
      )
    }
    registry.set(cliCommandKey(definition.domain, definition.verb), { scopes: surface.scopes })
  }
  return registry
}

const AGENT_CLI_COMMANDS = createAgentCliCommandRegistry()

function isAgentCliBaseCommand(baseCommand: string): boolean {
  return AGENT_CLI_BASE_COMMANDS.has(baseCommand)
}

function unprivilegedAgentEnvironment(preserveCommand = false): AgentCommandEnvironment {
  return {
    variables: { [LOCAL_CONTROL_AGENT_TOKEN_ENV]: '' },
    prependPath: [],
    preserveCommand
  }
}

function localAgentEnvironment(cliDirectory: string | null): AgentCommandEnvironment {
  return {
    variables: { [LOCAL_CONTROL_AGENT_TOKEN_ENV]: '' },
    prependPath: cliDirectory ? [cliDirectory] : [],
    preserveCommand: true
  }
}

export function resolveBundledCliDirectory(
  input: Readonly<{
    appPath: string
    resourcesPath: string
    isPackaged: boolean
    platform?: NodeJS.Platform
    isFile?: (filePath: string) => boolean
  }>
): string | null {
  const platform = input.platform ?? process.platform
  const directory = input.isPackaged
    ? path.join(input.resourcesPath, 'app.asar.unpacked', 'cli')
    : path.join(input.appPath, 'out', 'cli')
  const launcher = path.join(directory, platform === 'win32' ? 'deepchat.cmd' : 'deepchat')
  if (input.isFile) return input.isFile(launcher) ? directory : null
  try {
    return fs.statSync(launcher).isFile() ? directory : null
  } catch {
    return null
  }
}

export class AgentCliCommandAccess {
  constructor(private readonly options: AgentCliCommandAccessOptions) {}

  createProgrammaticEnvironment(
    armed: ArmedAgentCliProgrammaticToken,
    conversationId: string,
    command: string,
    stdin: string | undefined,
    commandShell: ResolvedCommandShell
  ): AgentCommandEnvironment {
    const normalizedConversationId = conversationId.trim()
    let invocation: ReturnType<typeof parseAgentCliProgrammaticExecInvocation>
    try {
      invocation = parseAgentCliProgrammaticExecInvocation({ command, stdin })
    } catch {
      throw new Error('Armed Programmatic CLI environment does not match its exact invocation')
    }
    if (
      !normalizedConversationId ||
      armed.conversationId !== normalizedConversationId ||
      armed.programmaticOperation.operation.sessionId !== normalizedConversationId ||
      invocation.route !== armed.programmaticOperation.route ||
      invocation.canonicalInvocationHash !== armed.programmaticOperation.canonicalInvocationHash ||
      !isAgentCliBaseCommand(this.options.commandPermission.extractBaseCommand(command)) ||
      this.options.commandPermission.hasShellControlSyntax(command, commandShell.dialect) ||
      referencesAgentToken(command, commandShell)
    ) {
      throw new Error('Armed Programmatic CLI environment does not match its exact invocation')
    }
    const cliDirectory = this.options.resolveCliDirectory()
    if (!cliDirectory) {
      throw new Error('Bundled JiaorongAI CLI is unavailable for the Programmatic invocation')
    }
    return {
      variables: this.cliVariables(armed.token),
      prependPath: [cliDirectory],
      preserveCommand: true
    }
  }

  createEnvironment(
    conversationId: string,
    command: string,
    commandShell: ResolvedCommandShell
  ): AgentCommandEnvironment | undefined {
    const normalizedConversationId = conversationId.trim()
    const normalizedCommand = command.trim()
    if (!normalizedConversationId) return undefined
    const baseCommand = this.options.commandPermission.extractBaseCommand(normalizedCommand)
    if (!isAgentCliBaseCommand(baseCommand)) {
      return unprivilegedAgentEnvironment()
    }
    if (normalizedCommand === `${baseCommand} help`) {
      return localAgentEnvironment(this.options.resolveCliDirectory())
    }

    const commandMatch = AGENT_CLI_COMMAND_PATTERN.exec(normalizedCommand)
    if (
      this.options.commandPermission.hasShellControlSyntax(
        normalizedCommand,
        commandShell.dialect
      ) ||
      !commandMatch ||
      referencesAgentToken(normalizedCommand, commandShell)
    ) {
      return unprivilegedAgentEnvironment(true)
    }

    const capability = AGENT_CLI_COMMANDS.get(cliCommandKey(commandMatch[1], commandMatch[2]))
    if (!capability) return unprivilegedAgentEnvironment(true)
    const cliDirectory = this.options.resolveCliDirectory()
    if (!cliDirectory) return unprivilegedAgentEnvironment(true)
    const issued = this.options.tokenAuthority.issue({
      conversationId: normalizedConversationId,
      scopes: capability.scopes,
      ttlMs: AGENT_CLI_COMMAND_TOKEN_TTL_MS,
      maxCalls: 1
    })
    return {
      variables: this.cliVariables(issued.token),
      prependPath: [cliDirectory],
      preserveCommand: true
    }
  }

  private cliVariables(token: string): Record<string, string> {
    const variables: Record<string, string> = {
      [LOCAL_CONTROL_AGENT_TOKEN_ENV]: token
    }
    const userData = this.options.resolveUserDataDirectory?.()?.trim()
    if (!userData) return variables
    variables[LOCAL_CONTROL_USER_DATA_DIR_ENV] = userData
    // Old bundled CLI only honors the E2E discovery key.
    variables[LOCAL_CONTROL_E2E_USER_DATA_DIR_ENV] = userData
    return variables
  }
}
