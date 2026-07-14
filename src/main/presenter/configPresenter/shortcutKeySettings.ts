export const CommandKey = 'CommandOrControl'

const ShiftKey = 'Shift'
const AltKey = 'Alt'

// Register tab number shortcut keys (1-8) -> Fixed CommandKey+1 ~ CommandKey+8 to switch tabs
// Below are regular shortcut key definitions
export const rendererShortcutKey = {
  NewConversation: `${CommandKey}+N`,
  QuickSearch: `${CommandKey}+P`,
  ToggleSidebar: `${CommandKey}+B`,
  ToggleWorkspace: `${CommandKey}+J`,
  NewWindow: `${CommandKey}+${ShiftKey}+N`,
  CloseWindow: `${CommandKey}+W`,
  ZoomIn: `${CommandKey}+=`,
  ZoomOut: `${CommandKey}+-`,
  ZoomResume: `${CommandKey}+0`,
  GoSettings: `${CommandKey}+,`,
  CleanChatHistory: `${CommandKey}+L`,
  DeleteConversation: `${CommandKey}+D`
}

// System-level shortcut keys
export const systemShortcutKey = {
  ShowHideWindow: `${CommandKey}+O`,
  // Electron accelerator 用 Alt 表示 macOS Option，对应 CommandOrControl+Option+A。
  Screenshot: `${CommandKey}+${AltKey}+A`,
  Quit: `${CommandKey}+Q`
}

export const defaultShortcutKey = {
  ...rendererShortcutKey,
  ...systemShortcutKey
}

export type ShortcutKey = keyof typeof defaultShortcutKey

export type ShortcutKeySetting = Record<ShortcutKey, string>
