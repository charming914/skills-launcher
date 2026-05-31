# AnythingLLM 存储目录

此文件夹用于在本地或磁盘上存储准备好进行嵌入（embed）的文档、向量缓存的嵌入表示，以及用于磁盘存储的 LanceDB 和本地 SQLite 数据库。

此文件夹应包含以下文件夹：
`documents`
`lancedb`（如果使用了 lancedb）
`vector-cache`
以及一个确切命名为 `anythingllm.db` 的文件。

### 常见问题
服务器日志中出现 **SQLITE_FILE_CANNOT_BE_OPENED** = 数据库文件不存在，可能是因为 node 实例没有正确的权限来将文件写入磁盘。要解决此问题：

- 本地开发
  - 在此目录中创建一个名为 `anythingllm.db` 的空文件即可，无需重启服务器或进行其他操作。如果权限设置正确，这种情况本来就不应该发生，因为服务器会在文件不存在时自动创建它。

- Docker 实例
  - 使用 `docker ps -a` 获取 AnythingLLM 的 Docker 容器 ID。容器必须处于运行状态才能执行接下来的命令。
  - 运行 `docker container exec -u 0 -t <ANYTHINGLLM DOCKER CONTAINER ID> mkdir -p /app/server/storage /app/server/storage/documents /app/server/storage/vector-cache /app/server/storage/lancedb`
  - 运行 `docker container exec -u 0 -t <ANYTHINGLLM DOCKER CONTAINER ID> touch /app/server/storage/anythingllm.db`
  - 运行 `docker container exec -u 0 -t <ANYTHINGLLM DOCKER CONTAINER ID> chown -R anythingllm:anythingllm /app/collector /app/server`

  - 上述命令将在 docker 容器内部创建相应的文件夹，并且只要您不销毁容器和数据卷，这些文件夹就会一直保留。这也将修复 collector 和 server 目录中文件夹及其文件的所有权问题。