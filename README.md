# 说明
- 当前针对`英文`翻译成`简体中文`进行优化。
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
- ChatGPT PLUS（二选一）
  - 填写`CHATGPT_AUTH_TOKEN`和`CHATGPT_COOKIES` [说明](https://github.com/mzbac/chatgpt-plus-api-client#getting-chatgpt_cookies-from-cookies)
- 代理
  - 填写`SOCKS_PROXY_HOST`和`SOCKS_PROXY_PORT`
- 语言
  - 填写`TARGET_LANGUAGE`

## 示例
```json
{
  "OPENAI_API_KEY": "sk-xxxxxxxxxx",
  "CHATGPT_AUTH_TOKEN": "Bearer xxxxxxxxxx",
  "CHATGPT_COOKIES": "_puid=user-xxxxxxxxxx",
  "TARGET_LANGUAGE": "Simplified Chinese",
  "SOCKS_PROXY_HOST": "127.0.0.1",
  "SOCKS_PROXY_PORT": "7890"
}
```

# 参考
- [gnehs/subtitle-translator](https://github.com/gnehs/subtitle-translator)
- [mzbac/chatgpt-plus-api-client](https://github.com/mzbac/chatgpt-plus-api-client)