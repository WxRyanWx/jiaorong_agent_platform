# jiaorong 四项缺陷修复

## 目标

1. 文件夹上传规范化时保留附属文件  
2. 拦截器业务错误不再误清登录  
3. 技能开关 localStorage 与 config 启动对齐  
4. Windows `toFileUrl` 可读本地路径  

## 约束

- 只改 `src/jiaorong_src`（及对应单测）  
- 不改开源宿主  
- 尽量不改变正常成功路径交互  

## 非目标

- 扫码 iframe env、详情直链等其它扫描项  
