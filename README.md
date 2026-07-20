# Product Prompt Vault

个人图片案例与提示词收藏站。基于 `unknowlei/nanobanana-website` fork 改造，第一版尽量保持简单：

- 图片上传到 Catbox
- 提示词、标签、分区数据保存在 `public/data.json`
- Vercel 部署
- 管理员密码控制新增、编辑、删除和同步
- 免费 `.vercel.app` 域名即可使用

## Catbox userhash 怎么找

1. 登录 <https://catbox.moe/>
2. 打开 <https://catbox.moe/tools.php>
3. 在页面里找 `userhash` / `User Hash` / API 相关区域
4. 复制那串字符串
5. 不要写进前端代码；部署时放到 Vercel 环境变量 `CATBOX_USERHASH`

`userhash` 可以理解成“把图片上传到你 Catbox 账户下的钥匙”。

## Vercel 环境变量

在 Vercel 项目设置里添加：

```env
ADMIN_PASSWORD=你自己的管理员密码
ADMIN_SESSION_SECRET=随便生成一串长随机字符
CATBOX_USERHASH=你的 Catbox userhash
GITHUB_TOKEN=你的 GitHub fine-grained token
GITHUB_REPO=yz0851/nanobanana-website
GITHUB_BRANCH=main
GITHUB_FILE_PATH=public/data.json
```

其中 `GITHUB_TOKEN` 只需要能更新这个仓库的 `public/data.json`。

## 本地运行

```bash
npm install
npm run dev
```

## 使用方式

1. 打开网站
2. 点击“管理员登录”
3. 输入 `ADMIN_PASSWORD`
4. 点击“新增案例”
5. 可点击上传图片，也可复制图片后直接 `Ctrl+V`
6. 图片会上传到 Catbox，并把链接写进案例
7. 保存案例后，点击“同步到 GitHub”

注意：保存案例只是保存到当前页面状态；点“同步到 GitHub”后才会写回 `public/data.json`。
