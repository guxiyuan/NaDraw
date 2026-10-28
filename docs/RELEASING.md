# 官方发布与源码公开

## 本次整理的状态

当前 VERSION 为 1.0.28，正式构建包含此前整理的轨道移除、非商业许可和构建分离。源码仓库为 https://github.com/guxiyuan/NaDraw 。本地构建不会自动修改线上文件或公开仓库；此前的 1.0.25 安装包和服务器归档保留原样。后续正式发布须使用新的版本号，相同版本不会被已安装客户端作为更新接受。

## 首次公开 GitHub

1. 先阅读 LICENSE 和 LICENSE.zh-CN.md，确认使用“源码公开、非商业使用”描述，保留第三方许可。
2. 执行普通构建、安装/绘图测试和源码打包脚本。
3. 解压源码包，检查 README、src、scripts、tests、docs、.github 与许可证。不要上传整个工作目录中的 build 或 dist；.gitignore 是补充保护，不是凭据检查的替代。
4. 建立 GitHub 仓库，上传这些源码文件，确认内容后设为公开。本项目仓库为 https://github.com/guxiyuan/NaDraw 。
5. 为正式安装包对应的源码提交建立版本标签，再创建 Release，附安装包、校验文件和更新内容。整理中的源码快照不应冒充已发布旧包的精确源码。
6. 网站提供下载、源码、教程、反馈和自愿支持入口。爱发电主页为 https://afdian.com/a/fecl3 ，赞助自愿。

## 修改正式版本

目前版本仍有显式常量，须一起更新：

- VERSION、release-notes.txt。
- `src/native/common/update-common.h` 中的版本与下载 User-Agent。
- `src/native/app/main.cpp` 的版本回复及测试预期。
- `src/native/app/app.rc`、app.manifest。
- `src/native/installer/setup.cpp`、setup.rc、setup.manifest。
- `src/web/index.html` 中的显示版本。
- 更新回归测试中的安装包 URL、版本和旧版基线预期。

更新 CHANGELOG，确认正式标签对应本次实际构建的源代码，而不是功能不同的旧快照。

## 构建与签名

普通源码编译只需要工具链和 SDK。维护者的官方构建需额外显式运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1 -OfficialRelease
```

默认私钥位置为 `%LOCALAPPDATA%\NaDrawBuildTools\signing\NaDraw-update-private.xml`，也可通过 `-SigningKeyPath` 指定本机其他位置。私钥不在项目内。构建先验证它与公开头文件完全匹配，再生成正式安装包、签名清单和完整服务器包。

签名时只公开清单 payload、signature 和公钥；不公开任何私钥因子。源码中的 prepare-signing 与 publish-update 脚本公开完整流程。没有私钥的使用者可编译普通版本，但不能给既有官方客户端签发可信更新。

只想验证官方代码路径而不生成正式服务器文件时：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1 -OfficialRelease -SkipPublish -OutputDirectory build/validation-official
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1 -InstallerPath build/validation-official/NaDraw-Setup-1.0.28.exe -ReportPath dist/preparation/official-functions.json
```

以上版本名随 VERSION 改动。`-SkipPublish` 不自动签发清单，也不覆盖 dist 中既有正式包。

## 更新回归测试

`test-update.ps1` 验证清单签名、篡改、错误架构、损坏包、HTTP 下载限制、文件占用、替换失败回滚、拒绝降级、保留工程和真实旧版本升级。需原签名私钥和已验证的旧版安装基线；因此它是维护者测试，不是公众编译的必需步骤。Python 3 仅用于临时本机 HTTP 服务，监听 127.0.0.1，测试结束关闭。

可用 InstallerPath、HelperPath、ManifestPath、ServerRoot、ReportPath、SigningKeyPath 参数指向独立的验证目录，避免覆盖正式发布目录。`NADRAW_UPDATE_NETWORK_TESTS` 只允许本机测试程序访问回环地址，不用于实际应用编译。

## 服务器上传

构建成功后完整包在 `dist/NaDraw-Server-Full-<版本>.zip`。上传到网站 wwwroot，并解压到当前目录，得到 `nadraw/latest.json` 和 `nadraw/releases/NaDraw-Setup-<版本>.exe`。源码包与服务器包是两种用途，不要互相替代。

更新入口为 `http://atlas1020.vxni.ink/nadraw/latest.json`。先确保新安装包能下载，再替换清单；不要编辑已签名的 latest.json。HTTP 不提供传输加密，客户端仍严格检查 RSA 签名、大小、散列和版本，不跟随重定向。此目录不需要数据库。

普通构建、测试、打包均不会自动上传服务器或 GitHub。
