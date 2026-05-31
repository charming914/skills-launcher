# AnythingLLM 使用的本地模型

这个文件夹被专门用于本地缓存和存储可以在 CPU 上运行的本地模型。

目前，AnythingLLM 将此文件夹用于应用程序的以下部分：

## 嵌入 (Embedding)
当您偏好的嵌入引擎为 `native` 时，我们将使用由 [Xenova 在 HuggingFace.co](https://huggingface.co/Xenova/all-MiniLM-L6-v2) 构建的 ONNX **all-MiniLM-L6-v2** 模型。该模型是流行的 [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) 的量化和 WASM 版本，它生成 384 维度的向量。

如果您使用的是 `native` 嵌入引擎，那么如果您的向量数据库参数可直接编辑（仅限 Pinecone），则应将其配置为接受 384 维模型。

## 音频/视频转录
AnythingLLM 允许您上传各种格式的音频和视频作为源文档。在所有情况下，音轨都将由 [Xenova 在 HuggingFace.co](https://huggingface.co/Xenova/whisper-small) 构建的本地运行的 ONNX 模型 **whisper-small** 进行转录。该模型是 OpenAI Whisper 模型的较小版本。由于模型在 CPU 上本地运行，较大的文件将导致更长的转录时间。

一旦完成转录，您就可以像其他任何文件一样，将这些转录内容嵌入到您的工作区中！

**我们同时也支持其他外部模型/转录提供商。**
- [通过 API key 使用 OpenAI Whisper 接口](https://openai.com/research/whisper)

## 文本生成（选择 LLM 模型）
> [!IMPORTANT]
> 使用本地运行的 LLM 模型处于**实验性**阶段，可能会出现意外行为、崩溃或完全无法运行。
> 为了在生产环境中使用本地 LLM 模型，我们建议使用专门构建的推理服务器，如 [LocalAI](https://localai.io) 或 [LMStudio](https://lmstudio.ai)。

> [!TIP]
> 我们建议**至少**使用 4-bit 或 5-bit 的量化 LLM 模型。较低量化的模型往往只能输出无法辨认的乱码。

如果您想使用兼容 Llama 的本地 LLM 模型进行聊天，可以从这个 [HuggingFace 搜索过滤器](https://huggingface.co/models?pipeline_tag=text-generation&library=gguf&other=text-generation-inference&sort=trending)中选择任何模型。

**要求**
- 模型必须采用最新的 `GGUF` 格式
- 模型应兼容最新的 `llama.cpp`
- 您应具备足够的 RAM（内存）来运行该模型。具体要求取决于模型大小。

### 我应该把 GGUF 模型放在哪里？
> [!IMPORTANT]
> 如果在 Docker 中运行，您应该通过挂载存储卷将容器目录映射到宿主机，这样您就可以直接更新存储文件，而无需重新下载或重新构建您的 Docker 容器。[请参阅推荐的 Docker 配置](../../../README.md#recommended-usage-with-docker-easy)

> [!NOTE]
> `/server/storage/models/downloaded` 是您的模型文件应该存放的默认路径。
> 如果您更改了 STORAGE_DIR 环境变量，您的存储目录可能会有所不同。

您想在 UI 中作为 LLM 可选模型的所有本地模型，都应放置在 `server/storage/models/downloaded` 文件夹中。UI 中只会允许选择 `.gguf` 格式的文件。