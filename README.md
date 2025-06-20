# 酷狗签到

GitHub Actions 实现 `酷狗概念VIP` 自动签到
每天领取总计 `两天酷狗概念VIP`

支持手机号登录(一个手机号绑定多个账号无法登录,见 [多账号登录问题](https://github.com/MakcRe/KuGouMusicApi/issues/51))和二维码登录(推荐)

账号密码登录要验证，太垃圾

> 注意：登录可能会过期，若签到失败可以尝试重新登录

## 免责声明

> 1. 本项目仅供学习使用，请尊重版权，请勿利用此项目从事商业行为及非法用途!
> 2. 使用本项目的过程中可能会产生版权数据。对于这些版权数据，本项目不拥有它们的所有权。为了避免侵权，使用者务必在 24 小时内清除使用本项目的过程中所产
>    生的版权数据。
> 3. 由于使用本项目产生的包括由于本协议或由于使用或无法使用本项目而引起的任何性质的任何直接、间接、特殊、偶然或结果性损害（包括但不限于因商誉损失、停
>    工、计算机故障或故障引起的损害赔偿，或任何及所有其他商业损害或损失）由使用者负责。
> 4. **禁止在违反当地法律法规的情况下使用本项目。** 对于使用者在明知或不知当地法律法规不允许的情况下使用本项目所造成的任何违法违规行为由使用者承担，本
>    项目不承担由此造成的任何直接、间接、特殊、偶然或结果性责任。
> 5. 音乐平台不易，请尊重版权，支持正版。
> 6. 本项目仅用于对技术可行性的探索及研究，不接受任何商业（包括但不限于广告等）合作及捐赠。
> 7. 如果官方音乐平台觉得本项目不妥，可联系本项目更改或移除。

## 使用说明

两种登录方式任选其一

1. Fork 这个仓库

1. 二维码登录：在 `Actions` 运行 `qrcode` 获取key和二维码链接，把key添加到 Secret `KEY` （什么？不知道 Secret在哪？[点我](#Secret)），复制二维码链接到浏览器打开，用酷狗概念版扫描并确认登录

1. 手机号登录：添加你的 `手机号` 到 Secret `PHONE`，运行 Actions `sent` 获取验证码，添加收到的 `验证码` 到 Secret `CODE`

1. 在 Actions 运行 `login` 成功后复制 `token` 和 `userid`

1. 添加 `token` 和 `userid` 到 Secret `TOKEN` `USERID`

1. 启用 Actions `run` 和 `listen`, 每天北京时间 00:01 自动签到

API源代码来自 [MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) ~~图省事直接搬来~~

## Secret

1. 步骤一
   ![步骤一](./imgs/步骤一.jpg)
1. 步骤二
   ![步骤二](./imgs/步骤二.jpg)
1. 步骤三
   ![步骤三](./imgs/步骤三.jpg)
1. 步骤四
   ![步骤四](./imgs/步骤四.jpg)
