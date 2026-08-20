# 内置 Provider 密钥不进明文源码

## 目标

`jiaorong` 内置 apiKey 在仓库源码里不以 `sk-` 明文出现。运行时主进程解开后再交给现有 Provider 流程。密封脚本与解开逻辑放在 `src/jiaorong_src`。

## 验收

1. `src/main/provider/defaults.ts` 不含 `sk-` 明文密钥。
2. 新安装仍能用内置 Jiaorong Provider 调兼容接口。
3. 其它 Provider 空密钥、用户自填密钥不受影响。

## 非目标

- 不防安装包 asar 拆包：解开函数会打进主进程包，拆开后密文和解开代码在一起。
- 不改已写入本地库的旧明文密钥。
- 不改白名单号码。
