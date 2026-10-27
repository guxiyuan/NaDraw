# 从源码编译

## 环境

Windows 10/11 x64、Windows PowerShell 5.1 或 PowerShell 7。已验证的构建依赖是 LLVM-MinGW 20261020 UCRT x64 和 Microsoft.Web.WebView2 SDK 1.0.4314.35。构建不需要 Electron、Node.js、npm 或 Visual Studio。

运行程序需要 Microsoft Edge WebView2 Runtime。Windows 已有该运行时即可离线运行；安装向导会在缺失时提示从 Microsoft 下载。依赖来源和许可证见 [第三方说明](../THIRD_PARTY_NOTICES.md)。

## 1. 获取依赖

在项目根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-dependencies.ps1
```

脚本仅从 `scripts/dependencies.json` 中的官方 GitHub / NuGet 地址下载固定版本，并检查 SHA-256。默认存储在 `%LOCALAPPDATA%\NaDrawBuildTools`。编译工具归档约 190 MB，SDK 约 10 MB；已有匹配文件会复用。

也可手动下载并解压到你选择的位置。LLVM 的 `bin` 必须包含 `clang++.exe` 和 `windres.exe`；SDK 根目录必须包含 `build/native/include/WebView2.h` 和 `build/native/x64/WebView2Loader.dll`。

## 2. 普通编译

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1
```

普通构建不读取、不生成官方私钥，也不签发官方更新清单。输出如下：

- `build/community/app/NaDraw.exe`：可直接启动的程序，须保留同目录中的 web、licenses 和 Loader DLL。
- `build/community/app/BUILD-INFO.json`：版本、构建类型和官方更新能力标记。
- `dist/community/NaDraw-Setup-<版本>-community.exe`：中文安装向导。
- `dist/community/SHA256.txt`：安装包校验值。

此构建显示 Source 标识，官方更新按钮不可用，不会在后台请求或应用官方更新。绘图、项目文件和图片导出可以使用。修改和分发仍须遵守非商业许可。

自定义依赖路径：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1 -ToolchainBin "C:\NaDrawTools\llvm\bin" -WebViewSdk "C:\NaDrawTools\webview2"
```

`setup-dependencies.ps1 -ToolsDirectory "C:\NaDrawTools"` 可改变下载目录；之后按脚本输出的 TOOLCHAIN_BIN 与 WEBVIEW2_SDK 传给构建参数。

## 3. 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1
```

测试安装到项目 `build/test-*` 中的隔离目录，不向正式安装写入注册表或快捷方式。检查绘图算法、双键三态、价态不变、保存重开、选取/吸附、中文读写、JPG/SVG、许可证随包安装，以及旧轨道占位。最后卸载隔离安装，结果写入 `dist/community/verification.json`。

测试官方或自定义输出安装包时可指定 `-InstallerPath` 和 `-ReportPath`。官方更新的签名、下载、回滚和旧版本升级测试另见 [RELEASING.md](RELEASING.md)，它需要维护者的签名权限和旧版基线，不是普通编译的前置条件。

## 4. 制作源码包

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-source.ps1
```

结果在 `dist/NaDraw-Source-<版本>-noncommercial.zip`。采用白名单，仅打包源代码、素材、文档、许可和脚本；不打包 build、dist、服务器运行目录、用户工程或私钥。归档路径统一为正斜杠，并生成 SHA-256 文件。

脚本不会自动创建 GitHub 仓库或上传任何文件。

## 常见问题

- 找不到工具链：先运行依赖准备脚本，或传入真实的 `-ToolchainBin`。
- 找不到 WebView2 SDK：传入 SDK 根目录，不是 include 目录。
- 要求签名私钥：检查是否误加 `-OfficialRelease`；普通源码编译不需要它。
- VERSION 不匹配：版本出现在 Windows 资源和应用常量中，不能只改 VERSION；需按发布文档同步修改。
- 运行时缺少 Loader：请运行完整 `app` 目录或安装包，不能单独复制 NaDraw.exe。
- 编译期间文件被占用：关闭从 `build/community/app` 启动的程序，再重新编译。

当前验证的是同版本依赖能够重新构建并通过功能测试，不承诺每次生成的二进制逐字节相同。
