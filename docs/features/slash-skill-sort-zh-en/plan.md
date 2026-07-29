# Plan

1. `@jiaorong/utils/slashSuggestionSort.ts`：`compareSlashSuggestionLabels`
2. 宿主 `sortSlashSuggestionItems` 同类内调用该比较器
3. 单测：中文优先、拼音序、英文序
4. 修复 `applyPreferredDisplayName`：勿因 Markdown 标题等于市场名而跳过写入 `metadata.displayName`
