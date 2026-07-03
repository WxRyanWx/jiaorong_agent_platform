---
name: infographic-syntax-creator
description: "生成AntV信息图语法输出。当被要求将用户内容转换为信息图DSL（模板选择、数据结构、主题）或输出“信息图<template>”纯语法时使用。"
metadata:
  displayName: 信息图表语法创建者
---

# Infographic Syntax Creator

## Overview

Generate AntV Infographic syntax output from user content, following the rules in `references/prompt.md`.

## Workflow

1. Read `references/prompt.md` for syntax rules, templates, and output constraints.
2. Extract the user's key structure: title, desc, items, hierarchy, metrics; infer missing pieces if needed.
3. Select a template that matches the structure (sequence/list/compare/hierarchy/chart).
4. Compose the syntax using `references/prompt.md` as the formatting baseline.
5. Preserve hard constraints in every output:
   - Output is a single `infographic` markdown code block; no extra text.
   - First line is `infographic <template-name>`.

- Use two-space indentation; key/value pairs are `key value`; arrays use `-`.
- Compare templates (`compare-*`) must have exactly two root nodes with children.
