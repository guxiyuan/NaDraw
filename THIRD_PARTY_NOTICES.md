# 第三方组件与素材来源

NaDraw 自身采用 PolyForm Noncommercial 1.0.0。以下组件保留其自身许可证；项目许可证不覆盖这些第三方条款。

| 项目 | 用途 | 随附资料 |
| --- | --- | --- |
| Microsoft WebView2 SDK / Loader | Win32 宿主与系统 WebView2 运行时连接；构建时从 SDK 复制 Loader DLL | `src/licenses/WebView2-LICENSE.txt`、`src/licenses/WebView2-NOTICE.txt`，来自 SDK 包的 LICENSE.txt、NOTICE.txt |
| LLVM-MinGW | C++ 编译工具链及随静态链接引入的运行库 | `src/licenses/LLVM-MinGW-LICENSE.txt`，保留上游的 Apache-2.0 WITH LLVM-exception 等汇总条款 |
| Windows 系统库 | 窗口、文件、压缩、HTTP、密码学等系统 API | 由 Windows 提供，不随源码包分发 Windows 系统库 |
| Microsoft Edge WebView2 Runtime | 显示 HTML/CSS/JavaScript 绘图界面 | 使用机器已安装的运行时；缺失时安装向导可从 Microsoft 获取，不将完整运行时嵌入安装包 |

## 依赖下载

- LLVM-MinGW：<https://github.com/mstorsjo/llvm-mingw/releases/tag/20261020>
- WebView2 SDK：<https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4314.35>
- WebView2 Runtime：<https://developer.microsoft.com/microsoft-edge/webview2/>

构建工具不在源码包内；下载入口与已验证归档 SHA-256 记录在 `scripts/dependencies.json`。分发安装包时，构建脚本会复制所有现有第三方许可与项目许可到 `licenses/`。

## 界面与图片

- `src/web/assets/chem-icons.svg`：项目内的可编辑 SVG 化学工具图标。
- `nadraw-logo.svg`、`nadraw-icon.png`、`nadraw-icon.ico`：NaDraw 项目标识及其导出文件。
- 本次整理移除了从用户参考图裁切的 `orbital-atlas.png` 和已不再使用的 `arrow-atlas.png`，同时移除轨道工具、图片导出路径和样式面板。
- 旧工程中的轨道仅转换成可编辑的“旧版图形（已移除）”文字占位，不保留参考图像。
- 教程中的化学结构示意为项目内的 SVG 线条和文字；不包含 KingDraw 界面截图。

后续新增图片、字体或图标时，应在这里补充来源和适用许可。参考某种功能交互不等于获得其图片、代码或品牌的再分发授权。
