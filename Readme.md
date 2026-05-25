## 如何设置开发环境



- `yarn setup`填充每个应用程序部分所需的`.env`文件（从仓库的根目录）。
  - 在开始下一步之前，先填写这些信息`server/.env.development`，不然代码无法正常执行。
- `yarn dev:server` 在本地启动服务器（从仓库的根目录）。
- `yarn dev:frontend` 在本地启动前端（从仓库的根目录）。
- `yarn dev:collector` 然后运行文档收集器（从仓库的根目录）。