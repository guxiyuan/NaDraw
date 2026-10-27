#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <shellapi.h>
#include <shobjidl.h>
#include <shlobj.h>
#include <WebView2.h>
#include <atomic>
#include <filesystem>
#include <fstream>
#include <functional>
#include <string>
#include <vector>

namespace fs = std::filesystem;

constexpr wchar_t kWindowClass[] = L"NaDrawNativeWindow";
constexpr wchar_t kWindowTitle[] = L"NaDraw";
constexpr wchar_t kVersion[] = L"1.0.25";
constexpr int kIconId = 101;

HWND g_window = nullptr;
ICoreWebView2Controller* g_controller = nullptr;
ICoreWebView2* g_webview = nullptr;
std::wstring g_executableDirectory;
std::wstring g_startupProject;
bool g_bridgeReady = false;
bool g_startupProjectSent = false;
bool g_smokeTest = false;
std::wstring g_smokeDirectory;
constexpr UINT kBridgeMessage = WM_APP + 1;

std::wstring Utf8ToWide(const std::string& value) {
  if (value.empty()) return {};
  const int length = MultiByteToWideChar(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0);
  std::wstring result(length, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), result.data(), length);
  return result;
}

std::string WideToUtf8(const std::wstring& value) {
  if (value.empty()) return {};
  const int length = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  std::string result(length, '\0');
  WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), result.data(), length, nullptr, nullptr);
  return result;
}

std::wstring JsonEscape(const std::wstring& value) {
  std::wstring output;
  output.reserve(value.size() + 16);
  for (wchar_t character : value) {
    switch (character) {
      case L'\\': output += L"\\\\"; break;
      case L'\"': output += L"\\\""; break;
      case L'\n': output += L"\\n"; break;
      case L'\r': output += L"\\r"; break;
      case L'\t': output += L"\\t"; break;
      default: output += character; break;
    }
  }
  return output;
}

std::vector<std::string> SplitNull(const std::string& value) {
  std::vector<std::string> parts;
  size_t start = 0;
  while (start <= value.size()) {
    const size_t end = value.find('\0', start);
    if (end == std::string::npos) { parts.push_back(value.substr(start)); break; }
    parts.push_back(value.substr(start, end - start));
    start = end + 1;
  }
  return parts;
}

std::string DecodeBase64(const std::wstring& encoded) {
  static const std::wstring alphabet = L"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string output;
  unsigned int value = 0;
  int bits = -8;
  for (wchar_t character : encoded) {
    if (character == L'=') break;
    const size_t position = alphabet.find(character);
    if (position == std::wstring::npos) continue;
    value = (value << 6) | static_cast<unsigned int>(position);
    bits += 6;
    if (bits >= 0) {
      output.push_back(static_cast<char>((value >> bits) & 0xFF));
      bits -= 8;
    }
  }
  return output;
}

std::string ReadUtf8File(const std::wstring& path) {
  std::ifstream input(fs::path(path), std::ios::binary);
  if (!input) return {};
  std::string contents((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
  if (contents.size() >= 3 && static_cast<unsigned char>(contents[0]) == 0xEF && static_cast<unsigned char>(contents[1]) == 0xBB && static_cast<unsigned char>(contents[2]) == 0xBF) contents.erase(0, 3);
  return contents;
}

bool WriteBytes(const std::wstring& path, const std::string& bytes) {
  std::ofstream output(fs::path(path), std::ios::binary | std::ios::trunc);
  if (!output) return false;
  output.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
  return output.good();
}

std::wstring FileNameOnly(const std::wstring& path) {
  return fs::path(path).filename().wstring();
}

bool HasProjectExtension(const std::wstring& path) {
  std::wstring extension = fs::path(path).extension().wstring();
  for (wchar_t& character : extension) character = static_cast<wchar_t>(towlower(character));
  return extension == L".nad" || extension == L".chd";
}

std::wstring ShowSaveDialog(const std::wstring& title, const std::wstring& suggestedName, const std::vector<COMDLG_FILTERSPEC>& filters, const wchar_t* defaultExtension, UINT* selectedType = nullptr) {
  if (g_smokeTest) {
    if (selectedType) *selectedType = 1;
    return (fs::path(g_smokeDirectory) / suggestedName).wstring();
  }
  IFileSaveDialog* dialog = nullptr;
  if (FAILED(CoCreateInstance(CLSID_FileSaveDialog, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&dialog)))) return {};
  dialog->SetTitle(title.c_str());
  dialog->SetFileName(suggestedName.c_str());
  dialog->SetFileTypes(static_cast<UINT>(filters.size()), filters.data());
  dialog->SetDefaultExtension(defaultExtension);
  if (dialog->Show(g_window) != S_OK) { dialog->Release(); return {}; }
  if (selectedType) dialog->GetFileTypeIndex(selectedType);
  IShellItem* item = nullptr;
  std::wstring path;
  if (SUCCEEDED(dialog->GetResult(&item))) {
    PWSTR rawPath = nullptr;
    if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &rawPath))) { path = rawPath; CoTaskMemFree(rawPath); }
    item->Release();
  }
  dialog->Release();
  return path;
}

std::wstring ShowOpenDialog() {
  if (g_smokeTest) return (fs::path(g_smokeDirectory) / L"原生测试.nad").wstring();
  IFileOpenDialog* dialog = nullptr;
  if (FAILED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&dialog)))) return {};
  const COMDLG_FILTERSPEC filters[] = {{L"NaDraw 工程 (*.nad)", L"*.nad"}, {L"旧版工程 (*.chd)", L"*.chd"}, {L"所有支持的工程", L"*.nad;*.chd"}};
  dialog->SetTitle(L"打开 NaDraw 工程");
  dialog->SetFileTypes(3, filters);
  if (dialog->Show(g_window) != S_OK) { dialog->Release(); return {}; }
  IShellItem* item = nullptr;
  std::wstring path;
  if (SUCCEEDED(dialog->GetResult(&item))) {
    PWSTR rawPath = nullptr;
    if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &rawPath))) { path = rawPath; CoTaskMemFree(rawPath); }
    item->Release();
  }
  dialog->Release();
  return path;
}

void PostJson(const std::wstring& json) {
  if (g_webview) g_webview->PostWebMessageAsJson(json.c_str());
}

void SendResponse(unsigned long long id, const std::wstring& resultJson) {
  PostJson(L"{\"id\":" + std::to_wstring(id) + L",\"ok\":true,\"result\":" + resultJson + L"}");
}

void SendError(unsigned long long id, const std::wstring& message) {
  PostJson(L"{\"id\":" + std::to_wstring(id) + L",\"ok\":false,\"error\":\"" + JsonEscape(message) + L"\"}");
}

std::wstring ProjectResult(const std::wstring& path, const std::string& data) {
  return L"{\"canceled\":false,\"filePath\":\"" + JsonEscape(path) + L"\",\"projectText\":\"" + JsonEscape(Utf8ToWide(data)) + L"\"}";
}

void SendStartupProject() {
  if (!g_bridgeReady || g_startupProjectSent || g_startupProject.empty()) return;
  const std::string contents = ReadUtf8File(g_startupProject);
  if (contents.empty()) return;
  PostJson(L"{\"event\":\"open-project\",\"result\":" + ProjectResult(g_startupProject, contents) + L"}");
  g_startupProjectSent = true;
}

#include "update-client.h"
bool g_closePending = false;
constexpr UINT kCloseAccepted = WM_APP + 21;

void HandleBridgeMessage(const std::wstring& message) {
  const size_t first = message.find(L'|');
  const size_t second = first == std::wstring::npos ? std::wstring::npos : message.find(L'|', first + 1);
  if (first == std::wstring::npos || second == std::wstring::npos) return;
  unsigned long long id = 0;
  try { id = std::stoull(message.substr(0, first)); } catch (...) { return; }
  const std::wstring action = message.substr(first + 1, second - first - 1);
  const std::string payload = DecodeBase64(message.substr(second + 1));

  if (action == L"get-update-settings") {
    SendResponse(id, std::wstring(L"{\"enabled\":")+(nadraw_update::AutoEnabled()?L"true":L"false")+L",\"available\":"+(nadraw_update::kOfficialBuild?L"true":L"false")+L",\"version\":\"1.0.25\"}");
    return;
  }
  if (action == L"set-auto-updates") {
    nadraw_update::SetAuto(payload == "1");
    SendResponse(id, std::wstring(L"{\"enabled\":")+(nadraw_update::AutoEnabled()?L"true":L"false")+L",\"available\":"+(nadraw_update::kOfficialBuild?L"true":L"false")+L"}");
    return;
  }
  if (action == L"check-updates") {
    nadraw_client::Start(true);SendResponse(id,L"{\"checking\":true}");return;
  }

  if (g_smokeTest && action == L"smoke-result") {
    WriteBytes((fs::path(g_smokeDirectory) / L"report.json").wstring(), payload);
    SendResponse(id, L"null");
    SetTimer(g_window, 1, 300, nullptr);
    return;
  }

  if (action == L"bridge-ready") {
    g_bridgeReady = true;
    SendResponse(id, L"null");
    SendStartupProject();
    if (!g_smokeTest && nadraw_update::kOfficialBuild) { SetTimer(g_window, 2, 2000, nullptr); SetTimer(g_window, 3, 800, nullptr); SetTimer(g_window, 4, 4*60*60*1000, nullptr); }
    return;
  }

  if (action == L"save-project") {
    const auto parts = SplitNull(payload);
    if (parts.size() < 2) { SendError(id, L"工程数据格式错误"); return; }
    std::wstring suggested = Utf8ToWide(parts[0]);
    if (fs::path(suggested).extension() != L".nad") suggested = fs::path(suggested).replace_extension(L".nad").wstring();
    const std::vector<COMDLG_FILTERSPEC> filters = {{L"NaDraw 工程 (*.nad)", L"*.nad"}};
    const std::wstring path = ShowSaveDialog(L"保存 NaDraw 工程", suggested, filters, L"nad");
    if (path.empty()) { SendResponse(id, L"{\"canceled\":true}"); return; }
    if (!WriteBytes(path, parts[1])) { SendError(id, L"无法写入工程文件"); return; }
    SendResponse(id, L"{\"canceled\":false,\"filePath\":\"" + JsonEscape(path) + L"\"}");
    return;
  }

  if (action == L"open-project") {
    const std::wstring path = ShowOpenDialog();
    if (path.empty()) { SendResponse(id, L"{\"canceled\":true}"); return; }
    const std::string contents = ReadUtf8File(path);
    if (contents.empty()) { SendError(id, L"无法读取工程文件"); return; }
    SendResponse(id, ProjectResult(path, contents));
    return;
  }

  if (action == L"export-image") {
    const auto parts = SplitNull(payload);
    if (parts.size() < 4) { SendError(id, L"导出数据格式错误"); return; }
    std::string format = parts[0];
    std::wstring suggested = Utf8ToWide(parts[1]);
    UINT selectedType = format == "svg" ? 2 : 1;
    std::vector<COMDLG_FILTERSPEC> filters;
    if (format == "svg") filters = {{L"SVG 矢量图 (*.svg)", L"*.svg"}};
    else if (format == "jpeg") filters = {{L"JPG 图片 (*.jpg)", L"*.jpg"}};
    else filters = {{L"JPG 图片 (*.jpg)", L"*.jpg"}, {L"SVG 矢量图 (*.svg)", L"*.svg"}};
    const wchar_t* defaultExtension = format == "svg" ? L"svg" : L"jpg";
    std::wstring path = ShowSaveDialog(L"导出图片", suggested, filters, defaultExtension, &selectedType);
    if (path.empty()) { SendResponse(id, L"{\"canceled\":true}"); return; }
    const bool useSvg = format == "svg" || (format == "choose" && selectedType == 2);
    path = fs::path(path).replace_extension(useSvg ? L".svg" : L".jpg").wstring();
    bool written = false;
    if (useSvg) written = WriteBytes(path, parts[3]);
    else {
      const size_t comma = parts[2].find(',');
      const std::wstring encoded = Utf8ToWide(comma == std::string::npos ? parts[2] : parts[2].substr(comma + 1));
      written = WriteBytes(path, DecodeBase64(encoded));
    }
    if (!written) { SendError(id, L"无法写入导出文件"); return; }
    SendResponse(id, L"{\"canceled\":false,\"filePath\":\"" + JsonEscape(path) + L"\",\"format\":\"" + std::wstring(useSvg ? L"svg" : L"jpeg") + L"\"}");
    return;
  }

  SendError(id, L"未知操作");
}

template <typename Interface> const IID& InterfaceId();
template <> const IID& InterfaceId<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>() { return IID_ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler; }
template <> const IID& InterfaceId<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>() { return IID_ICoreWebView2CreateCoreWebView2ControllerCompletedHandler; }
template <> const IID& InterfaceId<ICoreWebView2WebMessageReceivedEventHandler>() { return IID_ICoreWebView2WebMessageReceivedEventHandler; }
template <> const IID& InterfaceId<ICoreWebView2NavigationCompletedEventHandler>() { return IID_ICoreWebView2NavigationCompletedEventHandler; }
template <> const IID& InterfaceId<ICoreWebView2NavigationStartingEventHandler>() { return IID_ICoreWebView2NavigationStartingEventHandler; }
template <> const IID& InterfaceId<ICoreWebView2ExecuteScriptCompletedHandler>() { return IID_ICoreWebView2ExecuteScriptCompletedHandler; }

template <typename Interface, typename... Arguments>
class Callback final : public Interface {
 public:
  explicit Callback(std::function<HRESULT(Arguments...)> function) : function_(std::move(function)) {}
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** object) override {
    if (!object) return E_POINTER;
    if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, InterfaceId<Interface>())) {
      *object = static_cast<Interface*>(this);
      AddRef();
      return S_OK;
    }
    *object = nullptr;
    return E_NOINTERFACE;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return ++references_; }
  ULONG STDMETHODCALLTYPE Release() override {
    const ULONG remaining = --references_;
    if (!remaining) delete this;
    return remaining;
  }
  HRESULT STDMETHODCALLTYPE Invoke(Arguments... arguments) override { return function_(arguments...); }
 private:
  std::atomic<ULONG> references_{1};
  std::function<HRESULT(Arguments...)> function_;
};

void ResizeWebView() {
  if (!g_controller || !g_window) return;
  RECT bounds{};
  GetClientRect(g_window, &bounds);
  g_controller->put_Bounds(bounds);
}

void InitializeWebView() {
  const fs::path loaderPath = fs::path(g_executableDirectory) / L"WebView2Loader.dll";
  HMODULE loader = LoadLibraryW(loaderPath.c_str());
  if (!loader) {
    MessageBoxW(g_window, L"缺少 WebView2Loader.dll，程序无法启动。", L"NaDraw", MB_ICONERROR);
    return;
  }
  using CreateEnvironment = HRESULT (STDAPICALLTYPE*)(PCWSTR, PCWSTR, ICoreWebView2EnvironmentOptions*, ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*);
  auto createEnvironment = reinterpret_cast<CreateEnvironment>(GetProcAddress(loader, "CreateCoreWebView2EnvironmentWithOptions"));
  if (!createEnvironment) {
    MessageBoxW(g_window, L"WebView2 加载器无效。", L"NaDraw", MB_ICONERROR);
    return;
  }
  PWSTR localAppData = nullptr;
  SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE, nullptr, &localAppData);
  const fs::path userData = g_smokeTest ? fs::path(g_smokeDirectory)/L"WebView2" : fs::path(localAppData ? localAppData : L".") / L"NaDraw" / L"WebView2";
  if (localAppData) CoTaskMemFree(localAppData);
  fs::create_directories(userData);

  auto* environmentHandler = new Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler, HRESULT, ICoreWebView2Environment*>(
    [](HRESULT result, ICoreWebView2Environment* environment) -> HRESULT {
      if (FAILED(result) || !environment) {
        MessageBoxW(g_window, L"未找到 Microsoft Edge WebView2 Runtime。请先安装或更新 Microsoft Edge。", L"NaDraw", MB_ICONERROR);
        return result;
      }
      auto* controllerHandler = new Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler, HRESULT, ICoreWebView2Controller*>(
        [](HRESULT controllerResult, ICoreWebView2Controller* controller) -> HRESULT {
          if (FAILED(controllerResult) || !controller) return controllerResult;
          g_controller = controller;
          g_controller->AddRef();
          g_controller->get_CoreWebView2(&g_webview);
          ResizeWebView();

          ICoreWebView2Settings* settings = nullptr;
          if (SUCCEEDED(g_webview->get_Settings(&settings)) && settings) {
            settings->put_AreDevToolsEnabled(FALSE);
            settings->put_IsStatusBarEnabled(FALSE);
            settings->put_AreDefaultContextMenusEnabled(FALSE);
            settings->Release();
          }

          ICoreWebView2_3* webview3 = nullptr;
          if (SUCCEEDED(g_webview->QueryInterface(IID_ICoreWebView2_3, reinterpret_cast<void**>(&webview3))) && webview3) {
            const fs::path webDirectory = fs::path(g_executableDirectory) / L"web";
            webview3->SetVirtualHostNameToFolderMapping(L"app.nadraw.local", webDirectory.c_str(), COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW);
            webview3->Release();
          }

          EventRegistrationToken messageToken{};
          auto* messageHandler = new Callback<ICoreWebView2WebMessageReceivedEventHandler, ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs*>(
            [](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* arguments) -> HRESULT {
              LPWSTR source = nullptr;
              if (FAILED(arguments->get_Source(&source)) || !source) return S_OK;
              const bool local = std::wstring(source).rfind(L"https://app.nadraw.local/", 0) == 0;
              CoTaskMemFree(source);
              if (!local) return S_OK;
              LPWSTR message = nullptr;
              if (SUCCEEDED(arguments->TryGetWebMessageAsString(&message)) && message) {
                PostMessageW(g_window, kBridgeMessage, 0, reinterpret_cast<LPARAM>(new std::wstring(message)));
                CoTaskMemFree(message);
              }
              return S_OK;
            });
          g_webview->add_WebMessageReceived(messageHandler, &messageToken);
          messageHandler->Release();

          EventRegistrationToken navigationToken{};
          auto* navigationHandler = new Callback<ICoreWebView2NavigationCompletedEventHandler, ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs*>(
            [](ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs*) -> HRESULT {
              SendStartupProject();
              if (g_smokeTest) {
                g_webview->ExecuteScript(LR"JS(
                  (async () => {
                    const result = { version: document.querySelector('.title-version b').textContent, core: window.__nadrawSmoke.runCoreChecks() };
                    try {
                      const fixture = window.__nadrawSmoke.prepareDoubleBondVisual();
                      const project = fixture.project;
                      project.decorations.unshift({type:'text',value:'中文 σ δ Δ',x:0,y:0});
                      const saved = await window.nadraw.saveProject({project,suggestedName:'原生测试.nad'});
                      const opened = await window.nadraw.openProject();
                      const svg = await window.nadraw.exportImage({format:'svg',suggestedName:'原生测试.svg',svgText:'<svg xmlns="http://www.w3.org/2000/svg"><text>σ δ</text></svg>',jpegDataUrl:''});
                      const jpg = await window.nadraw.exportImage({format:'jpeg',suggestedName:'原生测试.jpg',jpegDataUrl:document.getElementById('drawing-canvas').toDataURL('image/jpeg'),svgText:''});
                      result.nativeIo = !saved.canceled && opened.project.decorations[0].value === '中文 σ δ Δ' && svg.format === 'svg' && jpg.format === 'jpeg';
                      result.doubleBondFileRoundTrip = opened.project.bonds.filter(bond=>bond.order===2).map(bond=>bond.doubleLayout).join(',') === 'center,left,right';
                      await window.nadraw.exportImage({format:'svg',suggestedName:'double-bond-layouts.svg',svgText:fixture.svg,jpegDataUrl:''});
                      await window.nadraw.exportImage({format:'jpeg',suggestedName:'double-bond-layouts.jpg',svgText:'',jpegDataUrl:fixture.jpeg});
                      const originalSettings=await window.nadraw.getUpdateSettings();
                      try {
                        const changed=await window.nadraw.setAutoUpdates(!originalSettings.enabled);
                        const readBack=await window.nadraw.getUpdateSettings();
                        result.officialBuild=originalSettings.available;
                        result.updateSettings=typeof originalSettings.available==='boolean'&&typeof originalSettings.enabled==='boolean'&&originalSettings.version==='1.0.25'&&
                          (originalSettings.available?changed.enabled===!originalSettings.enabled&&readBack.enabled===changed.enabled:!originalSettings.enabled&&!changed.enabled&&!readBack.enabled);
                      } finally { await window.nadraw.setAutoUpdates(originalSettings.enabled); }
                      result.closeProtection=window.__nadrawSmoke.checkCloseProtection();
                      result.updateMenu=Boolean(document.getElementById('auto-update-toggle')&&document.querySelector('[data-command="check-updates"]'));
                      result.success = result.version === '1.0.25' && Object.values(result.core).every(Boolean) && result.nativeIo && result.doubleBondFileRoundTrip && result.updateSettings && result.closeProtection && result.updateMenu;
                    } catch(error) { result.error=String(error); result.success=false; }
                    const json = JSON.stringify(result);
                    const bytes = new TextEncoder().encode(json);
                    let binary=''; bytes.forEach(byte=>binary+=String.fromCharCode(byte));
                    window.chrome.webview.postMessage('99999|smoke-result|'+btoa(binary));
                  })();
                )JS", nullptr);
              }
              return S_OK;
            });
          g_webview->add_NavigationCompleted(navigationHandler, &navigationToken);
          navigationHandler->Release();

          EventRegistrationToken startingToken{};
          auto* startingHandler = new Callback<ICoreWebView2NavigationStartingEventHandler, ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs*>(
            [](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* arguments) -> HRESULT {
              LPWSTR uri = nullptr;
              if (SUCCEEDED(arguments->get_Uri(&uri)) && uri) {
                if (std::wstring(uri).rfind(L"https://app.nadraw.local/", 0) != 0) arguments->put_Cancel(TRUE);
                CoTaskMemFree(uri);
              }
              return S_OK;
            });
          g_webview->add_NavigationStarting(startingHandler, &startingToken);
          startingHandler->Release();
          g_webview->Navigate(g_smokeTest ? L"https://app.nadraw.local/index.html?smoke=1" : L"https://app.nadraw.local/index.html");
          return S_OK;
        });
      const HRESULT createResult = environment->CreateCoreWebView2Controller(g_window, controllerHandler);
      controllerHandler->Release();
      return createResult;
    });
  const HRESULT result = createEnvironment(nullptr, userData.c_str(), nullptr, environmentHandler);
  environmentHandler->Release();
  if (FAILED(result)) MessageBoxW(g_window, L"WebView2 初始化失败。", L"NaDraw", MB_ICONERROR);
}

LRESULT CALLBACK WindowProcedure(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
  switch (message) {
    case nadraw_client::kResultMessage: nadraw_client::HandleResult(reinterpret_cast<nadraw_client::Result*>(lParam)); return 0;
    case WM_CLOSE: {
      if(g_closePending)return 0;
      if(!g_webview){DestroyWindow(window);return 0;}
      g_closePending=true;
      auto* handler=new Callback<ICoreWebView2ExecuteScriptCompletedHandler,HRESULT,LPCWSTR>([](HRESULT result,LPCWSTR answer)->HRESULT {
        g_closePending=false;
        if(SUCCEEDED(result)&&answer&&std::wstring(answer)==L"true")PostMessageW(g_window,kCloseAccepted,0,0);
        return S_OK;
      });
      const HRESULT result=g_webview->ExecuteScript(L"typeof window.nadrawConfirmClose==='function'?window.nadrawConfirmClose():true",handler);
      handler->Release();if(FAILED(result))g_closePending=false;return 0;
    }
    case kCloseAccepted: nadraw_client::LaunchPending(); DestroyWindow(window); return 0;
    case kBridgeMessage: {
      auto* request = reinterpret_cast<std::wstring*>(lParam);
      try { HandleBridgeMessage(*request); } catch (...) { MessageBoxW(window, L"文件操作失败，请检查路径和权限。", L"NaDraw", MB_ICONERROR); }
      delete request;
      return 0;
    }
    case WM_TIMER:
      if(wParam==1){DestroyWindow(window);return 0;}
      if(wParam==2){KillTimer(window,2);nadraw_client::Start(false);return 0;}
      if(wParam==3){KillTimer(window,3);nadraw_client::CompletionNotification();return 0;}
      if(wParam==4){nadraw_client::Start(false);return 0;}
      return DefWindowProcW(window,message,wParam,lParam);
    case WM_GETMINMAXINFO: {
      auto* information = reinterpret_cast<MINMAXINFO*>(lParam);
      information->ptMinTrackSize = {980, 640};
      return 0;
    }
    case WM_SIZE: ResizeWebView(); return 0;
    case WM_SETFOCUS: if (g_controller) g_controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC); return 0;
    case WM_DESTROY:
      if (g_webview) { g_webview->Release(); g_webview = nullptr; }
      if (g_controller) { g_controller->Close(); g_controller->Release(); g_controller = nullptr; }
      PostQuitMessage(0);
      return 0;
    default: return DefWindowProcW(window, message, wParam, lParam);
  }
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int showCommand) {
  CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  wchar_t executablePath[MAX_PATH]{};
  GetModuleFileNameW(nullptr, executablePath, MAX_PATH);
  g_executableDirectory = fs::path(executablePath).parent_path().wstring();

  int argumentCount = 0;
  PWSTR* arguments = CommandLineToArgvW(GetCommandLineW(), &argumentCount);
  for (int index = 1; index < argumentCount; ++index) {
    if (std::wstring(arguments[index]) == L"--smoke-test") g_smokeTest = true;
    else if (HasProjectExtension(arguments[index])) g_startupProject = arguments[index];
  }
  LocalFree(arguments);
  g_smokeDirectory = (fs::path(g_executableDirectory).parent_path() / L"qa-native").wstring();
  if (g_smokeTest) { fs::create_directories(g_smokeDirectory); nadraw_update::dataDirectoryOverride=fs::path(g_smokeDirectory)/L"Settings"; }

  WNDCLASSEXW windowClass{sizeof(WNDCLASSEXW)};
  windowClass.style = CS_HREDRAW | CS_VREDRAW;
  windowClass.lpfnWndProc = WindowProcedure;
  windowClass.hInstance = instance;
  windowClass.hIcon = LoadIconW(instance, MAKEINTRESOURCEW(kIconId));
  windowClass.hIconSm = windowClass.hIcon;
  windowClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  windowClass.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
  windowClass.lpszClassName = kWindowClass;
  RegisterClassExW(&windowClass);

  g_window = CreateWindowExW(0, kWindowClass, kWindowTitle, WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1440, 900, nullptr, nullptr, instance, nullptr);
  if (!g_window) { CoUninitialize(); return 1; }
  ShowWindow(g_window, g_smokeTest ? SW_HIDE : showCommand);
  UpdateWindow(g_window);
  InitializeWebView();

  MSG message{};
  while (GetMessageW(&message, nullptr, 0, 0) > 0) { TranslateMessage(&message); DispatchMessageW(&message); }
  nadraw_client::Shutdown();
  CoUninitialize();
  return static_cast<int>(message.wParam);
}
