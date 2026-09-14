# macOS ARM64 DMG 打包文档

本文档说明如何在 Apple Silicon Mac 上将 OpenCode Desktop 打包为 ARM64 DMG。

适用设备：

- M1、M2、M3、M4、M5 等 Apple Silicon Mac
- macOS 13 及以上版本
- 本地开发验证和正式签名发布

最终产物：

```text
packages/desktop/dist/opencode-desktop-mac-arm64.dmg
```

## 一、构建链路

桌面端位于：

```text
packages/desktop
```

桌面端的构建分为两步：

1. `bun run build`
   - 执行 `scripts/prebuild.ts`
   - 复制对应 channel 的图标和 metadata
   - 编译 `packages/opencode` 的 Node 服务
   - 开发 channel 下载对应架构的 CLI
   - 使用 `electron-vite` 编译 Electron 主进程、Preload 和 Renderer
2. `electron-builder --mac --arm64`
   - 将 `out/`、资源文件、Native 模块打包为 macOS App
   - 生成 DMG 和 ZIP

相关配置：

```text
packages/desktop/package.json
packages/desktop/electron-builder.config.ts
packages/desktop/scripts/prebuild.ts
packages/desktop/scripts/utils.ts
```

Electron Builder 配置默认生成：

```text
dmg
zip
```

产物命名规则是：

```text
opencode-desktop-${os}-${arch}.${ext}
```

因此 ARM64 DMG 的名称是：

```text
opencode-desktop-mac-arm64.dmg
```

## 二、环境要求

### 2.1 检查机器架构

```bash
uname -m
```

Apple Silicon Mac 应输出：

```text
arm64
```

如果输出 `x86_64`，当前终端运行在 Intel/Rosetta 环境中。建议使用原生 ARM64 Terminal，并确认 Homebrew、Bun 和 Node 都是 ARM64 版本。

### 2.2 安装 Xcode Command Line Tools

原生依赖，例如 `tree-sitter`、`node-pty`，需要本地编译工具：

```bash
xcode-select --install
```

如果已经安装，系统会提示无需重复安装。

检查编译器：

```bash
xcode-select -p
clang --version
```

### 2.3 安装 Homebrew

如果尚未安装 Homebrew，请从官方地址安装。Apple Silicon 的默认路径应为：

```text
/opt/homebrew
```

确认：

```bash
which brew
brew --prefix
```

### 2.4 安装 Node.js

仓库 CI 使用 Node 24。建议本地也使用 Node 24，尤其是需要编译 `tree-sitter-powershell` 等原生依赖时：

```bash
nvm install 24
nvm use 24
nvm alias default 24
```

检查：

```bash
node --version
node -p "process.arch"
```

建议结果：

```text
v24.x.x
arm64
```

如果没有 `nvm`，可以使用 Homebrew 安装 Node，或使用其他 Node 版本管理工具。关键是 Node 运行时应为 24.x，并且架构为 arm64。

### 2.5 安装 Bun

仓库根目录声明的 Bun 版本是：

```json
"packageManager": "bun@1.3.14"
```

建议使用 Bun 1.3.14。

安装：

```bash
curl -fsSL https://bun.sh/install | bash -s -- bun-v1.3.14
```

安装脚本通常将 Bun 放在：

```text
~/.bun/bin/bun
```

如果 `which bun` 仍然指向 Homebrew 的旧版本，例如：

```text
/opt/homebrew/bin/bun
```

将 `~/.bun/bin` 放到 PATH 前面：

```bash
export PATH="$HOME/.bun/bin:$PATH"
hash -r
```

永久配置：

```bash
printf '\nexport PATH="$HOME/.bun/bin:$PATH"\n' >> ~/.zshrc
source ~/.zshrc
```

检查：

```bash
which bun
bun --version
node --version
```

`bun update --version` 和 `bun add 1.3.14` 不是切换 Bun 版本的命令，不要使用这两个命令安装 Bun。

### 2.6 Python

`node-gyp` 需要 Python。确认：

```bash
which python3
python3 --version
```

如果系统中有多个 Python，可以在安装依赖时显式指定：

```bash
npm_config_python="$(which python3)" bun install
```

## 三、获取代码和安装依赖

进入仓库根目录：

```bash
cd /path/to/opencode
```

确认当前目录是项目根目录：

```bash
test -f package.json
test -f bun.lock
test -d packages/desktop
```

安装依赖：

```bash
bun install
```

安装过程中会编译原生依赖。如果之前安装失败，清理 `node_modules` 后重试，但不要删除 `bun.lock`：

```bash
rm -rf node_modules
bun install
```

## 四、本地开发 channel 打包

开发验证建议使用 `dev` channel：

- App 名称为 `OpenCode Dev`
- Bundle ID 为 `ai.opencode.desktop.dev`
- 会将开发 CLI 下载到桌面资源中
- 不需要正式发布仓库

### 4.1 编译桌面端资源

必须从 `packages/desktop` 目录执行：

```bash
cd /path/to/opencode/packages/desktop

OPENCODE_CHANNEL=dev bun run build
```

`bun run build` 会自动触发 `prebuild`。不需要手动再执行 `prebuild`。

### 4.2 打包 ARM64 DMG

本地没有 Apple Developer 签名证书时，关闭证书自动发现：

```bash
OPENCODE_CHANNEL=dev \
CSC_IDENTITY_AUTO_DISCOVERY=false \
bunx electron-builder \
  --mac \
  --arm64 \
  --publish never \
  --config electron-builder.config.ts
```

也可以使用桌面端已有脚本：

```bash
OPENCODE_CHANNEL=dev \
CSC_IDENTITY_AUTO_DISCOVERY=false \
bun run package:mac -- --arm64 --publish never
```

注意：`package:mac` 只负责 Electron Builder 打包，不替代前面的 `bun run build`。推荐始终先执行 `build`。

### 4.3 一次执行完整流程

从仓库根目录执行：

```bash
cd /path/to/opencode

OPENCODE_CHANNEL=dev bun run --cwd packages/desktop build

cd packages/desktop
OPENCODE_CHANNEL=dev \
CSC_IDENTITY_AUTO_DISCOVERY=false \
bunx electron-builder \
  --mac \
  --arm64 \
  --publish never \
  --config electron-builder.config.ts
```

## 五、正式 channel 打包

正式 channel 有两种：

| Channel | App 名称 | Bundle ID |
| --- | --- | --- |
| `dev` | OpenCode Dev | `ai.opencode.desktop.dev` |
| `beta` | OpenCode Beta | `ai.opencode.desktop.beta` |
| `prod` | OpenCode | `ai.opencode.desktop` |

正式 channel 的构建命令：

```bash
cd /path/to/opencode/packages/desktop

OPENCODE_CHANNEL=prod bun run build

OPENCODE_CHANNEL=prod \
bunx electron-builder \
  --mac \
  --arm64 \
  --publish never \
  --config electron-builder.config.ts
```

`beta` 只需要将 channel 改为 `beta`：

```bash
OPENCODE_CHANNEL=beta bun run build
OPENCODE_CHANNEL=beta bun run package:mac -- --arm64 --publish never
```

正式 channel 不会像 `dev` channel 一样额外下载 `opencode-cli` 到资源目录。正式版本通常使用发布流程准备好的资源。

## 六、签名和公证

当前 `electron-builder.config.ts` 的 macOS 配置包含：

```ts
mac: {
  hardenedRuntime: true,
  gatekeeperAssess: false,
  entitlements: "resources/entitlements.plist",
  entitlementsInherit: "resources/entitlements.plist",
  notarize: true,
  target: ["dmg", "zip"],
}
```

DMG 还配置了：

```ts
dmg: {
  sign: true,
}
```

### 6.1 本地未签名验证

本地没有 Apple Developer 证书时使用：

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false
```

完整命令：

```bash
OPENCODE_CHANNEL=dev \
CSC_IDENTITY_AUTO_DISCOVERY=false \
bun run package:mac -- --arm64 --publish never
```

该构建用于本机功能验证，不适合直接分发给其他用户。macOS 可能显示开发者无法验证或 App 已损坏等安全提示。

### 6.2 正式签名和公证所需凭据

正式发布需要：

- Apple Developer Program 账号
- Developer ID Application 证书
- Developer ID Installer 证书或对应 DMG 签名环境
- Apple App Store Connect API Key
- API Key ID
- API Issuer ID

本地环境通常需要设置：

```bash
export APPLE_API_KEY=/absolute/path/to/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

如果证书没有自动发现，可以根据 electron-builder 的证书配置方式设置 `CSC_LINK`、`CSC_KEY_PASSWORD`，或将证书导入当前用户钥匙串。

不要把 `.p8`、`.p12`、证书密码或 API Issuer 信息提交到 Git 仓库。

### 6.3 CI 的正式构建方式

仓库 CI 的 ARM64 macOS 参数是：

```yaml
host: macos-26
platform_flag: --mac --arm64
bun_install_flags: --os=darwin --cpu=arm64
```

CI 会：

1. 使用 ARM64 macOS runner
2. 使用 `bun install --os=darwin --cpu=arm64`
3. 导入 Apple 代码签名证书
4. 创建 Apple API Key 文件
5. 执行桌面端 prepare/build
6. 执行 `electron-builder --mac --arm64 --publish never`

正式发布应优先使用仓库既有 CI，而不是在个人电脑上复制生产凭据。

## 七、产物检查

查看产物：

```bash
ls -lh packages/desktop/dist/
```

预期至少包含：

```text
opencode-desktop-mac-arm64.dmg
opencode-desktop-mac-arm64.zip
```

检查解包目录中的 App：

```bash
find packages/desktop/dist -maxdepth 2 -name "*.app" -type d -print
```

检查主程序架构：

```bash
file packages/desktop/dist/mac-arm64/*.app/Contents/MacOS/*
```

正确结果应包含：

```text
Mach-O 64-bit executable arm64
```

检查 App 签名：

```bash
codesign --verify --deep --strict --verbose=2 packages/desktop/dist/mac-arm64/*.app
```

查看签名详情：

```bash
codesign --display --verbose=4 packages/desktop/dist/mac-arm64/*.app
```

如果使用了公证，检查 Gatekeeper：

```bash
spctl --assess --type execute --verbose packages/desktop/dist/mac-arm64/*.app
```

检查 DMG：

```bash
hdiutil imageinfo packages/desktop/dist/opencode-desktop-mac-arm64.dmg
```

挂载并测试：

```bash
hdiutil attach packages/desktop/dist/opencode-desktop-mac-arm64.dmg
```

查看挂载卷：

```bash
ls /Volumes
```

测试完成后卸载。卷名可能因 channel 不同而变化：

```bash
hdiutil detach "/Volumes/OpenCode Dev"
```

如果卷名不同，使用 `ls /Volumes` 输出的实际名称。

## 八、常见错误

### 8.1 `Please specify 'version' in the package.json`

错误示例：

```text
Please specify 'version' in the package.json
appPackageFile=.../opencode/package.json
```

原因是从仓库根目录直接运行了 Electron Builder，读取了根目录 `package.json`。根目录 package 没有桌面 App 所需的 `version`。

错误方式：

```bash
bunx electron-builder --mac --arm64 --config packages/desktop/electron-builder.config.ts
```

正确方式：

```bash
cd packages/desktop
bunx electron-builder --mac --arm64 --publish never --config electron-builder.config.ts
```

### 8.2 `author is missed in the package.json`

这通常也说明 Electron Builder 读取了根目录 package。进入 `packages/desktop` 后重试。桌面端 package 已配置 author：

```json
{
  "name": "OpenCode",
  "email": "hello@opencode.ai"
}
```

### 8.3 `webidl.util.markAsUncloneable is not a function`

常见于 Node 20 与当前 `node-gyp`/`undici` 组合不兼容，安装原生依赖时可能发生：

```text
TypeError: webidl.util.markAsUncloneable is not a function
```

处理顺序：

1. 切换 Node 24
2. 使用仓库声明的 Bun 版本 1.3.14
3. 删除失败的 `node_modules`
4. 保留 `bun.lock` 并重新安装

```bash
nvm install 24
nvm use 24
export PATH="$HOME/.bun/bin:$PATH"
rm -rf node_modules
bun install
```

### 8.4 `bun --version` 仍然是旧版本

检查：

```bash
which bun
~/.bun/bin/bun --version
```

如果 `which bun` 输出 `/opt/homebrew/bin/bun`，说明 Homebrew Bun 排在 PATH 前面：

```bash
export PATH="$HOME/.bun/bin:$PATH"
hash -r
which bun
bun --version
```

### 8.5 `node-gyp rebuild` 失败

确认以下工具：

```bash
node --version
node -p "process.arch"
python3 --version
xcode-select -p
clang --version
```

然后重装依赖：

```bash
rm -rf node_modules
npm_config_python="$(which python3)" bun install
```

### 8.6 没有签名证书

本地验证时使用：

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false
```

如果仍然尝试签名或公证，确认没有设置旧的证书环境变量：

```bash
env | grep -E '^(CSC|APPLE|NOTARIZE)'
```

正式分发不能只关闭签名，需要配置 Developer ID 和 Apple 公证凭据。

### 8.7 找不到 `mac-arm64` 或 App

确认已经先完成编译：

```bash
OPENCODE_CHANNEL=dev bun run build
```

再执行打包：

```bash
OPENCODE_CHANNEL=dev bun run package:mac -- --arm64 --publish never
```

如果只运行 `electron-builder` 而没有先运行桌面端 build，可能缺少 `out/` 或 `packages/opencode/dist/node` 资源。

## 九、推荐的最短流程

首次构建：

```bash
cd /path/to/opencode

nvm use 24
export PATH="$HOME/.bun/bin:$PATH"

bun install

cd packages/desktop
OPENCODE_CHANNEL=dev bun run build
OPENCODE_CHANNEL=dev \
CSC_IDENTITY_AUTO_DISCOVERY=false \
bun run package:mac -- --arm64 --publish never
```

输出：

```text
packages/desktop/dist/opencode-desktop-mac-arm64.dmg
```

## 十、构建前检查清单

- [ ] `uname -m` 输出 `arm64`
- [ ] Node 为 24.x
- [ ] `node -p "process.arch"` 输出 `arm64`
- [ ] Bun 为 1.3.14，或至少 PATH 使用了预期 Bun
- [ ] Xcode Command Line Tools 已安装
- [ ] Python 3 可用
- [ ] 当前 shell 位于仓库目录或明确使用 `--cwd`
- [ ] 已执行 `bun install`
- [ ] 已执行 `bun run build`
- [ ] Electron Builder 在 `packages/desktop` 目录运行
- [ ] ARM64 使用 `--mac --arm64`
- [ ] 本地无证书时使用 `CSC_IDENTITY_AUTO_DISCOVERY=false`
- [ ] 正式发布时已配置签名和公证凭据
- [ ] 已使用 `file`、`codesign`、`spctl` 验证产物
