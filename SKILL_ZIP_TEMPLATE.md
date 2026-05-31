# 标准 Skill 压缩包模板

## 模板位置

- `skill-template/standard-non-mcp-skill`

## 包含的文件

- `SKILL.md`
- `skill.json`
- `plugin.json`
- `handler.js`
- `cover.svg`

此模板与 SKILL Store 当前的本地上传流程相匹配。

## 如何使用

1. 将 `skill-template/standard-non-mcp-skill` 复制到一个新文件夹
2. 替换以下文件中的占位符值：
   - `SKILL.md`
   - `skill.json`
   - `plugin.json`
   - `handler.js`
3. 暂时保持其为非 MCP 格式
4. 压缩该文件夹 (Zip)
5. 在 `/settings/community-hub/skills` 中上传该压缩包

## Windows 单命令打包

使用方法：

```powershell
powershell -ExecutionPolicy Bypass -File .\build-skill-zip.ps1
```

自定义输入/输出：

```powershell
powershell -ExecutionPolicy Bypass -File .\build-skill-zip.ps1 -Source .\my-skill -Output .\skill-template\dist\my-skill.zip
```

## 当前限制

- 上传器目前仅支持非 MCP skills
- `SKILL.md` 是必填项
- `cover.svg` 是可选项，但建议提供
- `plugin.json` 和 `handler.js` 在预览时是可选项，但为了未来的 Agent 导入，建议提供
