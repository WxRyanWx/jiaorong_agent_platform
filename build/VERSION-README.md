# 版本更新工具使用说明

本目录包含用于管理应用版本信息的工具脚本，用于替代原有的自动更新机制。

## 文件说明

- `version-template.json`: 版本信息模板文件
- `generate-version-files.mjs`: 根据模板生成各平台版本信息文件的脚本
- `update-version.mjs`: 更新版本信息并生成各平台文件的便捷脚本

## 使用方法

### 1. 更新版本信息

使用 `update-version.mjs` 脚本可以快速更新版本信息并生成各平台的版本文件：

```bash
node generate-version-files.mjs  --version=0.0.6 --notes="版本更新说明"  --date="2023-06-15"
```

参数说明：
- `--version`: 新版本号（必填，格式为 X.Y.Z）
- `--notes`: 版本更新说明（可选）
- `--date`: 发布日期（可选，默认为当前日期）

### 2. 生成的文件

脚本会生成以下平台的版本信息文件：

- `winx64.json`: Windows x64 版本
- `winarm.json`: Windows ARM64 版本
- `macx64.json`: macOS x64 版本
- `macarm.json`: macOS ARM64 版本
- `linuxx64.json`: Linux x64 版本
- `linuxarm.json`: Linux ARM64 版本

### 4. 部署文件

生成的文件需要上传到服务器的 `/versions/` 目录下，应用将通过以下 URL 检查更新：

```
https://deepchat.thinkinai.xyz/auth/{platform}.json
```

其中 `{platform}` 是当前运行平台的标识符（如 `winx64`、`macarm` 等）。

## 版本信息格式

版本信息 JSON 文件包含以下字段：

```json
{
  "version": "0.0.5",
  "releaseDate": "2023-06-01",
  "releaseNotes": "版本更新说明",
  "githubUrl": "https://github.com/ThinkInAIXYZ/deepchat/releases/tag/v0.0.5",
  "downloadUrl": "https://deepchat.thinkinai.xyz/#/download"
}
```

- `version`: 版本号，格式为 X.Y.Z
- `releaseDate`: 发布日期
- `releaseNotes`: 版本更新说明（支持 Markdown 格式）
- `githubUrl`: GitHub 发布页面链接
- `downloadUrl`: 下载链接
