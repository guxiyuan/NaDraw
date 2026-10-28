# NaDraw

用于 Windows 10/11 x64 的化学结构与机理图编辑器。**源码公开，按 PolyForm Noncommercial 1.0.0 许可用于非商业目的。** 不采用 MIT/GPL，不宣称符合 OSI 的开源定义。

> 当前版本为 1.0.28，包含轨道工具移除、非商业源码整理及普通编译与官方签名的分离。此前的 1.0.25 安装包保留原样。详见 [修改记录](CHANGELOG.md)。

## 可以做什么

- 绘制单、双、三键、实楔、空楔、虚楔和 120° 碳链。
- 放置苯环、环丙至环辛、椅式及乙酸乙酯等真实原子/键模板。
- 双键工具点击双键，切换居中等长、一侧短线、另一侧短线，键数保持为二。
- 使用直线、三点曲线及连续折线箭头，选择实线/虚线、全箭头/鱼钩头。
- 添加元素、电荷、点位、括号和可编辑化学文字，插入常用希腊字母及上下角标。
- 使用可分别关闭的固定键长、角度辅助、端点/文本吸附、对齐线、补氢和价态提示。
- 多绘图标签、框选、缩放、旋转、撤销重做、复制剪切粘贴。
- 保存可再次编辑的 `.nad`，兼容导入旧 `.chd` 基础内容，按已有内容边界导出 JPG/SVG。

轨道工具及从参考图裁切的轨道/旧箭头图集已移除。旧轨道对象打开后显示可编辑文字占位，不会因打开而自动改写原文件。

## 使用与许可

源码仓库：[guxiyuan/NaDraw](https://github.com/guxiyuan/NaDraw)。普通使用者可从维护者网站下载正式安装包；[Releases](https://github.com/guxiyuan/NaDraw/releases) 以维护者实际上传的文件为准。程序内的“使用教程”提供图文操作说明。本地打包不会自动发布到网站或 GitHub。

请先阅读 [LICENSE](LICENSE)、[中文用途说明](LICENSE.zh-CN.md) 和 [第三方声明](THIRD_PARTY_NOTICES.md)。允许的非商业使用、学习、修改和分发以许可条款为准；公开源码不代表允许商业使用。教育、公共科研等机构的允许范围按原许可证条款认定。

## 从源码构建

在项目目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-dependencies.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1
```

固定版本的 LLVM-MinGW 和 WebView2 SDK 从上游官方地址取得并校验 SHA-256。构建不需要 Node.js、npm、Electron、Visual Studio 或官方发布私钥。

结果为 `build/community/app/` 和 `dist/community/NaDraw-Setup-<版本>-community.exe`。这是源码构建，显示 Source 标识，不接入官方自动更新。详细路径、自定义参数和常见问题见 [编译说明](docs/BUILDING.md)。

运行使用系统共享的 Microsoft Edge WebView2；安装向导在缺失时可提示下载。Win32 宿主、安装程序和更新器采用 C++；绘图界面与算法采用 HTML/CSS/JavaScript，完整实现均在本包中。

## 源码导览

| 路径 | 内容 |
| --- | --- |
| `src/native/app` | 原生窗口、WebView2、文件对话框及消息桥 |
| `src/native/common` | 版本、签名、散列、HTTP 与设置 |
| `src/native/updater` | 独立更新程序 |
| `src/native/installer` | 安装向导、资源压缩与卸载 |
| `src/web` | 绘图交互、图模型、排版、界面、教程和素材 |
| `scripts` | 依赖、普通/官方构建、测试和源码/服务器打包 |
| `tests` | 更新验证与本机 HTTP 测试源代码 |
| `docs` | 架构、算法、工程格式、编译及发布流程 |
| `src/licenses` | 第三方组件原有许可与声明 |
| `宣传页` | 独立宣传网页、服务器下载和自愿支持入口 |

- [程序结构与算法](docs/ARCHITECTURE.md)
- [.nad 文件格式](docs/FILE_FORMAT.md)
- [官方发布与源码公开流程](docs/RELEASING.md)
- [反馈与贡献](CONTRIBUTING.md)
- [安全与更新信任](SECURITY.md)

官方更新公钥、协议和完整实现公开；发布私钥与服务器凭据不分发。默认构建不读取私钥，维护者必须显式使用 `-OfficialRelease` 才能构建并签名官方包。源码中的公开细节足以独立编译和修改，不需要持有官方身份凭据。

## 制作公开源码包

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-source.ps1
```

结果放在 `dist/NaDraw-Source-<版本>-noncommercial.zip`，附 SHA-256。采用明确白名单，不含构建缓存、历史安装包、服务器运行文件、个人工程或私钥。脚本不会自动上传 GitHub 或服务器。

## 反馈与支持

可通过 [Issues](https://github.com/guxiyuan/NaDraw/issues) 提交 BUG/建议；敏感安全问题请见 SECURITY.md。当前公开反馈邮箱为 ChDraw_feedback@163.com。

软件非商业使用不以赞助为条件。可通过 [爱发电主页](https://afdian.com/a/fecl3) 自愿支持开发，不承诺固定更新频率或逐条实现建议。
