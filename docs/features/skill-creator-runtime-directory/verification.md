# skill-creator 修改说明

## 修改目的

对话的工作目录可能是任意项目目录，例如：

```text
/Users/yanxia1/projects/20k/
```

修改后，通过 `skill-creator` 创建的技能统一写入 JiaorongChat 实际使用的 skills 目录，
不再跟随当前对话的工作目录。

当前默认 skills 目录为：

```text
/Users/yanxia1/.jiaorongchat/skills
```

## 修改的代码

### 1. 修改 skill-creator 的创建命令

文件：

```text
resources/skills/skill-creator/SKILL.md
```

原命令：

```text
scripts/init_skill.py <skill-name> --path <output-directory>
```

改为：

```text
python "${SKILL_ROOT}/scripts/init_skill.py" <skill-name> --path "${SKILLS_DIR}"
```

`${SKILL_ROOT}` 由客户端替换为 `skill-creator` 的实际安装目录。

`${SKILLS_DIR}` 由客户端替换为当前配置的 skills 根目录。

在当前机器上，实际执行的命令类似：

```text
python "/Users/yanxia1/.jiaorongchat/skills/skill-creator/scripts/init_skill.py" \
  <skill-name> \
  --path "/Users/yanxia1/.jiaorongchat/skills"
```

生成的技能目录为：

```text
/Users/yanxia1/.jiaorongchat/skills/<skill-name>/
```

### 2. 禁止使用工作目录创建技能

文件：

```text
resources/skills/skill-creator/SKILL.md
```

新增了以下规则：

- 创建技能时必须使用 `${SKILLS_DIR}`。
- 不能使用 `.`、`./skills` 或其他相对路径。
- 不能使用当前对话的项目目录。
- 不能在 skill 中写死某个用户的绝对路径。

### 3. init_skill.py 拒绝相对路径

文件：

```text
resources/skills/skill-creator/scripts/init_skill.py
```

新增 `resolve_output_root()`：

```python
def resolve_output_root(path):
    output_root = Path(path).expanduser()
    if not output_root.is_absolute():
        raise ValueError(
            "Output path must be absolute. Use the runtime ${SKILLS_DIR} value; "
            "do not use '.', the current workspace, or another relative path."
        )
    return output_root.resolve()
```

以下命令会直接报错：

```text
init_skill.py test-skill --path .
init_skill.py test-skill --path ./skills
init_skill.py test-skill --path skills
```

这样可以防止技能被创建到：

```text
/Users/yanxia1/projects/20k/test-skill
```

### 4. 增加技能名校验

文件：

```text
resources/skills/skill-creator/scripts/init_skill.py
```

新增校验规则：

```python
SKILL_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SKILL_NAME_MAX_LENGTH = 64
```

技能名要求：

- 只能使用小写字母、数字和连字符。
- 不能超过 64 个字符。
- 技能名与技能目录名保持一致。

合法名称：

```text
document-reader
data-analysis
skill-123
```

非法名称：

```text
DocumentReader
data_analysis
文档读取
```

### 5. 保留中文展示名

文件：

```text
resources/skills/skill-creator/SKILL.md
```

内部名保持为：

```yaml
name: skill-creator
```

中文展示名保持为：

```yaml
metadata:
  displayName: 技能创建
```

同时将正文标题改为：

```markdown
# 技能创建
```

`skill-creator` 用于程序内部识别，“技能创建”用于页面和 `/` 菜单展示。

### 6. 重新安装本机 skill-creator

项目中的新版本已复制到：

```text
/Users/yanxia1/.jiaorongchat/skills/skill-creator
```

旧版本备份在：

```text
/Users/yanxia1/.jiaorongchat/skills/skill-creator.backup-codex-20260716
```

## 实现的功能

1. 对话工作目录不再影响技能安装目录。
2. 新技能统一创建在 `${SKILLS_DIR}` 下。
3. 每个技能都生成为 `${SKILLS_DIR}` 下的独立子目录。
4. 防止因使用相对路径将技能写入当前项目。
5. 新生成的合法 `SKILL.md` 可被 `SkillPresenter` 的目录监听自动发现。
6. 技能被发现后会更新 `skillsStore`，随后出现在 `/` 呼出列表中。

## 已做的检查

- 使用临时绝对目录创建测试技能，创建成功。
- 使用 `.` 作为输出目录，脚本正确拒绝。
- `valid-skill` 名称校验通过。
- `Invalid_Name` 名称校验失败。
- Python 语法检查通过。
- `skill-creator` 结构校验通过。
- 项目文件与本机已安装文件比对一致。
- `git diff --check` 通过。
