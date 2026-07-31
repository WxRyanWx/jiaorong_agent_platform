import type { JiaorongTrayItem } from "./types";
import { BUILTIN_PROCESS_MODULES } from "./modules";
import { MenuItemConstructorOptions } from 'electron';
export function listJiaorongTrayItems(): JiaorongTrayItem[] {
  return BUILTIN_PROCESS_MODULES.flatMap((module) => module.trayItems ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export function listJiaorongTrayMenuItems():MenuItemConstructorOptions[] {
  const menuItems: MenuItemConstructorOptions[] = [];
  for (const item of listJiaorongTrayItems())
  {
    menuItems.push({
      label: item.label,
      click: () => {
        console.log("screenshotPush!!!")
        if (item.type === 'function' && item.func)
        {
          console.log("screenshotFunc!!!")
          item.func()
        }
      }
    })
  }
  return menuItems
}
