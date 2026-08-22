# 酷狗签到

GitHub Actions 实现 `酷狗概念VIP` 自动签到，每天领取总计 `两天酷狗概念VIP`

登录后即可使用，目前提供二维码登录(推荐)和手机号登录(一个手机号绑定多个账号无法登录，见 [多账号登录问题](https://github.com/MakcRe/KuGouMusicApi/issues/51))

## 免责声明

> [!important]
>
> 1. 本项目仅供学习使用，请尊重版权，请勿利用此项目从事商业行为及非法用途!
> 2. 使用本项目的过程中可能会产生版权数据。对于这些版权数据，本项目不拥有它们的所有权。为了避免侵权，使用者务必在 24小时内清除使用本项目的过程中所产生的版权数据。
> 3. 由于使用本项目产生的包括由于本协议或由于使用或无法使用本项目而引起的任何性质的任何直接、间接、特殊、偶然或结果性损害（包括但不限于因商誉损失、停工、计算机故障或故障引起的损害赔偿，或任何及所有其他商业损害或损失）由使用者负责。
> 4. **禁止在违反当地法律法规的情况下使用本项目。** 对于使用者在明知或不知当地法律法规不允许的情况下使用本项目所造成的任何违法违规行为由使用者承担，本项目不承担由此造成的任何直接、间接、特殊、偶然或结果性责任。
> 5. 音乐平台不易，请尊重版权，支持正版。
> 6. 本项目仅用于对技术可行性的探索及研究，不接受任何商业（包括但不限于广告等）合作及捐赠。
> 7. 如果官方音乐平台觉得本项目不妥，可联系本项目更改或移除。

## 使用说明

> [!warning]
> 注意事项
>
> 若登录后听歌领取失败，请到APP 活动中心->天天签到领VIP(这个活动新用户好像没有) 查看当日是否已经领取VIP。

1. Fork 本仓库

1. 创建添加令牌
   - **创建令牌**  
     复制下方官网链接，在浏览器中打开

     ```shell
     https://github.com/settings/personal-access-tokens/new
     ```

   - **登录 GitHub 官网**  
     若登陆后未跳转至token生成页，请再次粘贴链接进行访问
   - **在设置页面配置权限**  
      **Token name 备注**：随意填写
      **Expiration (有效期)**：建议自定义有效期，长期无人维护时不要选择过长
      **Repository access (仓库范围)**：只选择当前 fork 的仓库
      **Repository permissions (仓库权限)**：`Metadata` 保持只读，`Secrets` 设置为读写
      ![精细化个人访问令牌权限](imgs/精细化个人访问令牌权限.png)
   - 滑动到底部，点击绿色的 Generate token 保存按钮
   - 复制生成的字符串，回到本仓库添加到`Secret`，变量名 `PAT`，value 为复制的令牌

1. 登录（两种独立的登录方式，任选其一）

   3.1 二维码登录(推荐)

   运行 Actions `二维码登录`，点击 Run → 在运行摘要页面（Summary）查看二维码图片，使用酷狗音乐 APP 扫码并确认登录即可。

   3.2 手机号登录

   添加手机号到 Secret `PHONE`，运行 Actions `手机号登录`，操作步骤选择「发送验证码」获取验证码，把验证码添加到 Secret `CODE`；再次运行 Actions `手机号登录`，操作步骤选择「登录」即可。

1. 启用 Actions `签到`，每天凌晨北京时间 01:10 自动签到（可在 `签到.yml` 中设置 cron）。安排在凌晨可抢在手动领取之前，避免与 APP 内领取当天青春版 VIP 名额冲突。启用 Actions `仓库保活` 以保证签到可以长期执行。

1. （可选）配置运行结果通知

   在仓库 Settings → Secrets and variables → Actions 中添加对应渠道的 Secret，签到完成后将自动推送结果通知。支持以下渠道（全部可选，配置多个将同时发送）：

   | 通知渠道 | Secret 变量名 | 说明 |
   |---------|-------------|------|
   | 企业微信机器人 | `WECOM_BOT_KEY` | 企业微信群机器人 webhook 的 key |
   | 钉钉机器人 | `DINGTALK_BOT_KEY` | 钉钉机器人 access_token |
   | 钉钉加签 | `DINGTALK_SECRET` | 钉钉机器人加签密钥（可选） |
   | 飞书机器人 | `FEISHU_BOT_KEY` | 飞书自定义机器人 webhook 的 key |
   | 云湖机器人 | `YUNHU_BOT_KEY` | 云湖机器人 webhook 的 key |
   | Server酱 | `SERVERCHAN_SENDKEY` | Server酱 SendKey |
   | PushPlus | `PUSHPLUS_TOKEN` | PushPlus token |
   | PushPlus群组 | `PUSHPLUS_TOPIC` | PushPlus 群组编码（可选） |
   | Telegram | `TG_BOT_TOKEN` | Telegram Bot Token |
   | Telegram | `TG_CHAT_ID` | Telegram 接收消息的 Chat ID |
   | Bark (iOS) | `BARK_KEY` | Bark key 或完整 URL |
   | Bark分组 | `BARK_GROUP` | Bark 消息分组（可选） |
   | Discord | `DISCORD_WEBHOOK` | Discord Webhook 完整 URL |
   | 邮箱 SMTP | `MAIL_HOST` | SMTP 服务器地址（如 `smtp.qq.com`） |
   | 邮箱 SMTP | `MAIL_PORT` | SMTP 端口（默认 465） |
   | 邮箱 SMTP | `MAIL_USER` | 发件邮箱账号 |
   | 邮箱 SMTP | `MAIL_PASS` | 发件邮箱授权码（非登录密码） |
   | 邮箱 SMTP | `MAIL_TO` | 收件邮箱地址 |

   通知内容包含：运行日期、账号数量、成功/失败统计、各账号听歌领取状态、VIP 领取次数、VIP 到期时间、错误信息等。

API源代码来自 [MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) ~~图省事直接搬来~~

## 令牌（Token）机制说明

项目中包含两类令牌：

1. **GitHub Personal Access Token (PAT)**：用于自动将酷狗登录信息写入仓库 Secret `USERINFO`，以及每周日自动刷新酷狗登录 Token。

2. **酷狗登录 Token**：存储在 `USERINFO` Secret 中，用于酷狗 API 身份认证。通过登录获取，每周日自动刷新。

## Secret 位置

1. 步骤一
   ![步骤一](./imgs/步骤一.jpg)
1. 步骤二
   ![步骤二](./imgs/步骤二.jpg)
1. 步骤三
   ![步骤三](./imgs/步骤三.jpg)
1. 步骤四
   ![步骤四](./imgs/步骤四.jpg)

## 致谢

- 感谢 [@MakcRe](https://github.com/MakcRe) 提供 API 源代码
- 感谢 [@itfw](https://github.com/itfw) 提供二维码显示问题的解决方案
- 感谢 [@klaas8](https://github.com/klaas8) 提供自动写入secret的方法
