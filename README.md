# 说明
- 针对`英文`翻译成`简体中文`进行优化。
  - 匹配译文避免字幕翻译错行
  - 统一对人名的翻译
  - 对过度合并的部分进行拆分
  - 可能存在未成功处理部分，匹配失败部分搜索***，拆分失败部分搜索超长行
- 开启`APP_DEBUG`将以`Unicode`格式输出，可使用`TimeM`对标记字幕进行校正。

# 使用方法
- 将`config.example.json`重命名为`config.json`，并按下面说明填写。
- 将字幕文件放入`src`文件夹中
- 运行`npm install`安装依赖
- 运行`node index.js`开始翻译
- 翻译完成后，在`res`文件夹中找到已翻译的文件。

# 配置`config.json`
- OpenAI API（二选一，优先生效）
  - 填写`OPENAI_API_KEY` [获取](https://platform.openai.com/account/api-keys)
- ChatGPT HOST（二选一）
  - 填写`CHATGPT_HOST` [HTTP服务](https://github.com/zhile-io/pandora/blob/master/doc/wiki.md#http%E6%9C%8D%E5%8A%A1%E6%96%87%E6%A1%A3)
- API HOST（可选）
  - 填写`OPENAI_API_HOST`，默认使用`https://api.openai.com/v1`
- 代理（可选）
  - 填写`SOCKS_PROXY_HOST`和`SOCKS_PROXY_PORT`
- 语言
  - 填写`TARGET_LANGUAGE`

## 配置文件示例
```json
{
  "CHATGPT_HOST": "http://127.0.0.1:8008",
  "OPENAI_API_KEY": "ak-xxxxxxxxxx",
  "OPENAI_API_HOST": "https://api.aios.chat/v1",
  "TARGET_LANGUAGE": "Simplified Chinese",
  "SOCKS_PROXY_HOST": "127.0.0.1",
  "SOCKS_PROXY_PORT": "7890"
}
```

# TODO
- [ ] 对话体拆分匹配
- [ ] 字幕漏译后置重试
- [ ] 人名漏译后置检查

# 参考
- [gnehs/subtitle-translator](https://github.com/gnehs/subtitle-translator)
- [mzbac/chatgpt-plus-api-client](https://github.com/mzbac/chatgpt-plus-api-client)
- [zhile-io/pandora](https://github.com/zhile-io/pandora)