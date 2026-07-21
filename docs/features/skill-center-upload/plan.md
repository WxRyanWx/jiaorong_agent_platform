# Skill Center Upload — format compatibility

## 原始包格式（`skills 2` 扫描，89 个 zip）

| 类型 | 数量 | 特征 |
|------|------|------|
| A 标准 YAML | 64 | 合法 `name` + `description` |
| B YAML name 非法 | 13 | 中文 / 空格 / 大写 `name` |
| C/E YAML 缺字段 | 2 | 无 name 或无 description（可用 title/summary） |
| F 粗体字段 | 1 | `**name:**` / `**description:**` |
| G 延迟 frontmatter | 1 | 标题后再 `---` + name/description（如 pricing） |
| H 裸 YAML | 2 | 无 `---` 的 `name:`/`slug:` |
| I 纯正文 | 6 | 仅 `#` 标题 + 段落 |

## 策略

上传时在私有仓 `ensureSkillMarkdown` 统一转成标准 YAML；**不改用户源文件**。
zip 安装会保留包内其它文件，仅替换 SKILL.md。
