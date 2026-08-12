# session-list-load-more-cursor

## Goal

侧栏历史会话触底能继续加载，不因 cursor IPC 失败卡在第一页。

## Problem

`sessionStore.loadNextPage` 把 Pinia 里的 `nextCursor`（Vue Proxy）经 `listLightweight` 传给 IPC，structured clone 失败；首屏 `cursor: null` 正常，故只看到约 30 条。

## Acceptance

- `listLightweight` 的 cursor 一律 plain clone 再进 IPC。
- 本地 44 条会话可经滚动加载齐全。

## Non-goals

- 改分页大小或分组算法。
