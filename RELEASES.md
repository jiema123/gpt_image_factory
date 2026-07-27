# 下载 / Releases

当前正式版本：[v0.5.7](https://github.com/jiema123/gpt_image_factory/releases/tag/v0.5.7)

## 版本说明

当前版本：`v0.5.7`。这是标准 App 更新链路热修版本，补齐 macOS / Windows 标准包的版本识别、signed manifest 下载入口和 WebUI 更新弹窗文案。新用户建议下载标准包：macOS 使用 DMG，Windows 使用独立 App ZIP；老用户和调试用户仍可下载 portable zip 继续沿用同目录 `data/` 工作流。

本版重点：0.5.7 补齐标准 App 更新检查链路。macOS / Windows 标准 App 不再被 WebUI 误判成“源码运行”；检查更新会校验 signed `latest.json` 中的标准包下载信息，发现新版时直接提供对应 DMG / App ZIP 下载入口。portable 包的静默自替换更新器保持原逻辑不变。

本版详情：

### 升级必读

- 已安装 `0.5.6` 标准 App 的用户需要先从 Release 页面手动下载 `0.5.7` 标准包覆盖安装；升级到 `0.5.7` 后，后续“检查更新”会直接给出对应新版 DMG / App ZIP 下载入口。
- `v0.5.4` 及更早 portable 用户首次升级到 `0.5.5` 或更新版本时，建议手动下载完整标准包或完整 portable 包；旧 updater 只保证升级 WebUI/依赖，不保证安装新的小兔子启动器、标准 `.app` / `.exe` 入口和迁移助手。
- 新用户建议优先下载标准包。标准包把用户数据写入系统应用数据目录；portable 包继续把数据写在同级 `data/`，用于老用户过渡、调试和临时工作流。
- 标准包检查更新会校验 signed `latest.json` 并直达新版 DMG / App ZIP 下载；未签名 `.app` 和 Windows ZIP 的静默自替换更新器延后，避免扩大文件替换风险。
- macOS 标准 DMG 和 portable zip 都暂未签名、未 notarize，首次启动可能需要右键或 Control-click 选择 Open。

### 标准 App 更新修复

- 启动器会把标准 App 的真实资源目录传给 WebUI，`/api/app-version` 会读取包内 `app-version.txt`，运行方式显示为“标准 App”，不再回退成“源码运行”。
- `latest.json` 新增 `standard_platforms` 和 `standard_signature`，分别声明 macOS Apple Silicon DMG、macOS Intel DMG 和 Windows x64 标准 App ZIP；旧 portable 字段和签名保持兼容。
- 标准 App 检查更新时会校验标准包签名数据，发现新版后写入 `standard_download_url`，WebUI 版本弹窗展示“下载新版”入口，而不是不可用的 portable 更新器按钮。
- 标准包仍不在运行中的 `.app` / `.exe` 内静默替换自身；下载完成后退出当前 App，再用新版 DMG / App ZIP 覆盖安装。

### portable 过渡包与自动更新

- 继续保留三种 portable zip：Windows x64、macOS Apple Silicon、macOS Intel；portable 数据仍保存在包内同级 `data/`。
- portable 包包含 `Start iLab GPT CONJURE.exe` / `Start iLab GPT CONJURE.app` 启动器，旧的 `Start WebUI Portable` 脚本继续保留作为终端调试入口。
- `latest.json` 同时声明 portable 三平台 zip 和标准包下载信息；portable 自动更新使用 Ed25519 签名校验、SHA256 校验、`.backup/` 备份和更新后重启，标准 App 检查更新会直达新版 DMG / App ZIP 下载但不静默自覆盖。
- 更新器只替换一键包目录内由程序管理的文件，保留本地 `data/`，并在执行前显示所选资产和 manifest SHA256。

### 结构维护与发布工作流

- 补充 manifest 生成、标准 App 版本接口、启动器更新选择、WebUI 更新弹窗和公开导出的回归测试。
- 公开 README、SECURITY、RELEASES 和 Release workflow 文案同步说明：`latest.json` 同时服务 portable 自动更新和标准 App 安装包下载。

### 发布工作流

- Release workflow 同时构建并上传 macOS Apple Silicon DMG、macOS Intel DMG、Windows 标准 App ZIP、Windows x64 portable、macOS Apple Silicon portable、macOS Intel portable、所有 `.sha256.txt` 和 signed `latest.json`。
- `latest.json` 同时服务 portable 自动更新和标准 App 下载新版安装包；标准 App 仍不做静默自覆盖。

## 推荐下载

| 平台 | 推荐给 | 下载 | SHA256 |
| --- | --- | --- | --- |
| macOS Apple Silicon | 新用户，M1/M2/M3/M4 | [GPT-IMAGE-FACTORY-macos-arm64-0.5.7.dmg](https://github.com/jiema123/gpt_image_factory/releases/download/v0.5.7/GPT-IMAGE-FACTORY-macos-arm64-0.5.7.dmg) | [sha256](https://github.com/jiema123/gpt_image_factory/releases/download/v0.5.7/GPT-IMAGE-FACTORY-macos-arm64-0.5.7.dmg.sha256.txt) |
| macOS Intel | 新用户，Intel x64 | [GPT-IMAGE-FACTORY-macos-x64-0.5.7.dmg](https://github.com/jiema123/gpt_image_factory/releases/download/v0.5.7/GPT-IMAGE-FACTORY-macos-x64-0.5.7.dmg) | [sha256](https://github.com/jiema123/gpt_image_factory/releases/download/v0.5.7/GPT-IMAGE-FACTORY-macos-x64-0.5.7.dmg.sha256.txt) |
| Windows x64 | 新用户，Windows 10/11 x64 | [GPT-IMAGE-FACTORY-windows-x64_0.5.7.zip](https://github.com/jiema123/gpt_image_factory/releases/download/v0.5.7/GPT-IMAGE-FACTORY-windows-x64_0.5.7.zip) | [sha256](https://github.com/jiema123/gpt_image_factory/releases/download/v0.5.7/GPT-IMAGE-FACTORY-windows-x64_0.5.7.zip.sha256.txt) |

标准包数据目录：

- macOS：`~/Library/Application Support/iLab GPT CONJURE/`
- Windows：`%APPDATA%\iLab GPT CONJURE\`

标准包的“检查更新”会校验 signed `latest.json` 并直达新版 DMG / App ZIP 下载。目前不对标准 `.app` 或 Windows 标准 ZIP 执行静默自动自替换。

## 免安装一键包

| 平台 | 适用设备 | 下载 | SHA256 |
| --- | --- | --- | --- |
| Windows x64 | Windows 10/11 x64 | [gpt-image-factory_windows_portable_x64_0.5.7.zip](https://github.com/jiema123/gpt_image_factory/releases/download/v0.5.7/gpt-image-factory_windows_portable_x64_0.5.7.zip) | [sha256](https://github.com/jiema123/gpt_image_factory/releases/download/v0.5.7/gpt-image-factory_windows_portable_x64_0.5.7.zip.sha256.txt) |
| macOS Apple Silicon | M1/M2/M3/M4 | [gpt-image-factory_macos_portable_arm64_0.5.7.zip](https://github.com/jiema123/gpt_image_factory/releases/download/v0.5.7/gpt-image-factory_macos_portable_arm64_0.5.7.zip) | [sha256](https://github.com/jiema123/gpt_image_factory/releases/download/v0.5.7/gpt-image-factory_macos_portable_arm64_0.5.7.zip.sha256.txt) |
| macOS Intel | Intel x64 | [gpt-image-factory_macos_portable_x64_0.5.7.zip](https://github.com/jiema123/gpt_image_factory/releases/download/v0.5.7/gpt-image-factory_macos_portable_x64_0.5.7.zip) | [sha256](https://github.com/jiema123/gpt_image_factory/releases/download/v0.5.7/gpt-image-factory_macos_portable_x64_0.5.7.zip.sha256.txt) |

portable 自动更新 manifest：

- [latest.json](https://github.com/jiema123/gpt_image_factory/releases/download/v0.5.7/latest.json)

使用方式：

1. 下载对应平台的 zip。
2. 解压到普通用户目录，不要放在系统保护目录。
3. Windows 双击 `Start iLab GPT CONJURE.exe`；macOS 双击
   `Start iLab GPT CONJURE.app`。旧的 `Start WebUI Portable.bat` /
   `Start WebUI Portable.command` 仍保留，用于终端调试。
4. 如果浏览器没有自动打开，访问 `http://127.0.0.1:8787/`。

一键包启动器不会后台自动访问 GitHub。更新已经解压的一键包时，可在托盘 / 菜单栏
菜单选择检查更新，并在发现新版本后确认 `安装更新`；也可以退出启动器后手动运行
Windows 的 `Update WebUI Portable.bat` 或 macOS 的 `Update WebUI Portable.command`。
更新脚本会读取带签名的 `latest.json`
manifest，先用启动器内置公钥校验 Ed25519 签名，再下载当前平台对应的最新
GitHub Release 资产，执行前显示所选资产和 manifest SHA256，校验下载 zip 的
SHA256，只替换一键包目录内由程序管理的文件，保留本地 `data/`，并把被替换文件备份到 `.backup/`。

macOS 标准 DMG 和 portable zip 都暂未签名、未 notarize。如果 macOS
拦截启动，可以右键或 Control-click App，选择 Open，并在系统安全提示中再次确认。
portable zip 也可以对解压目录执行：

```bash
xattr -dr com.apple.quarantine /path/to/gpt-image-factory_macos_portable_arm64
# 或：
xattr -dr com.apple.quarantine /path/to/gpt-image-factory_macos_portable_x64
```

一键包内的 `data/` 目录会保存本地设置、公用图库、输入图、输出图、任务数据库和日志。
不要把这些本地数据、API key 或 OAuth 文件提交到 Git。
