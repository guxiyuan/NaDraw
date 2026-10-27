#define _WIN32_WINNT 0x0A00
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <commctrl.h>
#include <compressapi.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <urlmon.h>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>
#include <stdexcept>
#include <cstdint>
#include <algorithm>
#include <cstring>
#ifndef NADRAW_OFFICIAL_BUILD
#define NADRAW_OFFICIAL_BUILD 0
#endif

namespace fs = std::filesystem;
constexpr wchar_t kVersion[] = L"1.0.25";
constexpr wchar_t kClass[] = L"NaDrawSetupWindow";
constexpr wchar_t kUninstallKey[] = L"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NaDraw";
constexpr UINT kBeginInstall = WM_APP + 1;
constexpr int kInstall = 1001, kBrowse = 1002, kCancel = 1003, kPath = 1004, kDesktop = 1005, kLaunch = 1006;
HINSTANCE g_instance;
HWND g_window, g_path, g_desktop, g_launch, g_primary, g_cancel, g_status;
HFONT g_font, g_titleFont;
bool g_complete = false, g_uninstall = false, g_silent = false;
bool g_testInstall = false, g_update = false;
unsigned g_testFailAfter = 0;
std::wstring g_destination, g_executablePath;

struct Entry { fs::path relative; std::vector<unsigned char> bytes; };

std::wstring Widen(const std::string& text) {
  int size = MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0);
  std::wstring result(size, 0);
  MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), result.data(), size);
  return result;
}

std::wstring KnownFolder(REFKNOWNFOLDERID id) {
  PWSTR raw = nullptr;
  if (FAILED(SHGetKnownFolderPath(id, KF_FLAG_CREATE, nullptr, &raw))) throw std::runtime_error("folder");
  std::wstring result = raw;
  CoTaskMemFree(raw);
  return result;
}

uint32_t Read32(const std::vector<unsigned char>& bytes, size_t& offset) {
  if (offset + 4 > bytes.size()) throw std::runtime_error("archive");
  uint32_t value = 0;
  for (unsigned index = 0; index < 4; ++index) value |= static_cast<uint32_t>(bytes[offset++]) << (8 * index);
  return value;
}

std::vector<Entry> ReadPayload() {
  HRSRC resource = FindResourceW(g_instance, MAKEINTRESOURCEW(201), RT_RCDATA);
  if (!resource) throw std::runtime_error("missing payload");
  const DWORD size = SizeofResource(g_instance, resource);
  const auto* data = static_cast<const unsigned char*>(LockResource(LoadResource(g_instance, resource)));
  if (size < 8 || memcmp(data, "NAD1", 4) != 0) throw std::runtime_error("invalid payload");
  uint32_t originalSize = 0;
  memcpy(&originalSize, data + 4, 4);
  if (originalSize > 100 * 1024 * 1024) throw std::runtime_error("payload too big");
  std::vector<unsigned char> bytes(originalSize);
  DECOMPRESSOR_HANDLE decompressor = nullptr;
  if (!CreateDecompressor(COMPRESS_ALGORITHM_XPRESS_HUFF, nullptr, &decompressor)) throw std::runtime_error("decompressor");
  SIZE_T written = 0;
  const BOOL success = Decompress(decompressor, const_cast<unsigned char*>(data + 8), size - 8, bytes.data(), bytes.size(), &written);
  CloseDecompressor(decompressor);
  if (!success || written != bytes.size()) throw std::runtime_error("corrupt payload");
  std::vector<Entry> entries;
  size_t offset = 0;
  while (offset < bytes.size()) {
    const uint32_t nameSize = Read32(bytes, offset), dataSize = Read32(bytes, offset);
    if (!nameSize) break;
    if (offset + nameSize + dataSize > bytes.size()) throw std::runtime_error("archive bounds");
    const fs::path relative(Widen(std::string(reinterpret_cast<const char*>(bytes.data() + offset), nameSize)));
    if (relative.is_absolute() || relative.has_root_path() || relative.wstring().find(L':') != std::wstring::npos) throw std::runtime_error("archive path");
    for (const auto& segment : relative) if (segment == L"..") throw std::runtime_error("archive path");
    offset += nameSize;
    Entry entry{relative, std::vector<unsigned char>(bytes.begin() + offset, bytes.begin() + offset + dataSize)};
    offset += dataSize;
    entries.push_back(std::move(entry));
  }
  return entries;
}

void SetRegistry(const std::wstring& key, const std::wstring& name, const std::wstring& value) {
  HKEY handle;
  if (RegCreateKeyExW(HKEY_CURRENT_USER, key.c_str(), 0, nullptr, 0, KEY_SET_VALUE, nullptr, &handle, nullptr) != ERROR_SUCCESS) throw std::runtime_error("registry");
  const auto result = RegSetValueExW(handle, name.empty() ? nullptr : name.c_str(), 0, REG_SZ, reinterpret_cast<const BYTE*>(value.c_str()), static_cast<DWORD>((value.size() + 1) * sizeof(wchar_t)));
  RegCloseKey(handle);
  if (result != ERROR_SUCCESS) throw std::runtime_error("registry value");
}

std::wstring RegistryValue(const std::wstring& key, const wchar_t* name) {
  wchar_t buffer[32768]{};
  DWORD size = sizeof(buffer);
  if (RegGetValueW(HKEY_CURRENT_USER, key.c_str(), name, RRF_RT_REG_SZ, nullptr, buffer, &size) == ERROR_SUCCESS) return buffer;
  return {};
}

void Shortcut(const fs::path& linkPath, const fs::path& target, const wchar_t* arguments = L"") {
  IShellLinkW* link = nullptr;
  if (FAILED(CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&link)))) throw std::runtime_error("shortcut");
  link->SetPath(target.c_str());
  link->SetArguments(arguments);
  link->SetWorkingDirectory(target.parent_path().c_str());
  link->SetDescription(L"NaDraw 化学结构编辑器");
  link->SetIconLocation(target.c_str(), 0);
  IPersistFile* persist = nullptr;
  if (SUCCEEDED(link->QueryInterface(IID_PPV_ARGS(&persist)))) {
    const HRESULT result = persist->Save(linkPath.c_str(), TRUE);
    persist->Release(); link->Release();
    if (FAILED(result)) throw std::runtime_error("shortcut save");
  } else { link->Release(); throw std::runtime_error("shortcut persist"); }
}

bool RuntimeAvailable(const fs::path& loader) {
  HMODULE module = LoadLibraryW(loader.c_str());
  if (!module) return false;
  using GetVersion = HRESULT (STDAPICALLTYPE*)(PCWSTR, LPWSTR*);
  const auto getVersion = reinterpret_cast<GetVersion>(GetProcAddress(module, "GetAvailableCoreWebView2BrowserVersionString"));
  LPWSTR version = nullptr;
  const bool available = getVersion && SUCCEEDED(getVersion(nullptr, &version)) && version;
  if (version) CoTaskMemFree(version);
  FreeLibrary(module);
  return available;
}

bool EnsureRuntime(const fs::path& loader) {
  if (RuntimeAvailable(loader)) return true;
  if (!g_silent && MessageBoxW(g_window, L"本机缺少 Microsoft WebView2 运行时。是否从 Microsoft 下载并安装？\n\n需要联网，完成后即可离线使用 NaDraw。", L"NaDraw 安装", MB_YESNO | MB_ICONQUESTION) != IDYES) return false;
  SetWindowTextW(g_status, L"正在下载 Microsoft WebView2 运行时…");
  const fs::path bootstrapper = fs::temp_directory_path() / (L"NaDraw-WebView2-" + std::to_wstring(GetCurrentProcessId()) + L".exe");
  if (FAILED(URLDownloadToFileW(nullptr, L"https://go.microsoft.com/fwlink/p/?LinkId=2124703", bootstrapper.c_str(), 0, nullptr))) return false;
  SHELLEXECUTEINFOW execute{sizeof(execute)};
  execute.fMask = SEE_MASK_NOCLOSEPROCESS;
  execute.lpFile = bootstrapper.c_str();
  execute.lpParameters = L"/silent /install";
  execute.nShow = SW_HIDE;
  if (!ShellExecuteExW(&execute)) return false;
  WaitForSingleObject(execute.hProcess, INFINITE);
  CloseHandle(execute.hProcess);
  std::error_code error;
  fs::remove(bootstrapper, error);
  return RuntimeAvailable(loader);
}

bool ValidDestination(const std::wstring& value) {
  if (value.empty()) return false;
  const fs::path path = fs::path(value).lexically_normal();
  return path.is_absolute() && path != path.root_path() && path.filename().wstring().size() > 1 && path.wstring().find(L'"') == std::wstring::npos;
}

void RegisterInstallation(const fs::path& root) {
  if (g_testInstall) return;
  if (g_update) { SetRegistry(kUninstallKey, L"DisplayVersion", kVersion); return; }
  const fs::path executable = root / L"NaDraw.exe";
  const fs::path programs = fs::path(KnownFolder(FOLDERID_Programs)) / L"NaDraw";
  fs::create_directories(programs);
  Shortcut(programs / L"NaDraw.lnk", executable);
  Shortcut(programs / L"卸载 NaDraw.lnk", root / L"Uninstall.exe", L"--uninstall");
  if (g_silent || SendMessageW(g_desktop, BM_GETCHECK, 0, 0) == BST_CHECKED) Shortcut(fs::path(KnownFolder(FOLDERID_Desktop)) / L"NaDraw.lnk", executable);
  SetRegistry(L"Software\\Classes\\.nad", L"", L"NaDraw.Project");
  SetRegistry(L"Software\\Classes\\NaDraw.Project", L"", L"NaDraw 工程");
  SetRegistry(L"Software\\Classes\\NaDraw.Project\\DefaultIcon", L"", L"\"" + executable.wstring() + L"\",0");
  SetRegistry(L"Software\\Classes\\NaDraw.Project\\shell\\open\\command", L"", L"\"" + executable.wstring() + L"\" \"%1\"");
  SetRegistry(kUninstallKey, L"DisplayName", L"NaDraw");
  SetRegistry(kUninstallKey, L"DisplayVersion", kVersion);
  SetRegistry(kUninstallKey, L"Publisher", L"NaDraw");
  SetRegistry(kUninstallKey, L"InstallLocation", root.wstring());
  SetRegistry(kUninstallKey, L"DisplayIcon", executable.wstring());
  SetRegistry(kUninstallKey, L"UninstallString", L"\"" + (root / L"Uninstall.exe").wstring() + L"\" --uninstall");
  SetRegistry(kUninstallKey, L"QuietUninstallString", L"\"" + (root / L"Uninstall.exe").wstring() + L"\" --uninstall --silent");
  SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
}

void RemoveStaging(const fs::path& root, const fs::path& staging) {
  if (staging.parent_path() != root || staging.filename().wstring().rfind(L".nadraw-install-", 0) != 0) return;
  std::error_code error;
  fs::remove_all(staging, error);
}

void Install() {
  if (!ValidDestination(g_destination)) throw std::runtime_error("invalid destination");
  const fs::path root = fs::absolute(g_destination).lexically_normal();
  if (g_update && (!fs::exists(root / L"NaDraw.exe") ||
      (g_testInstall ? !fs::exists(root / L"NaDraw.test-install") : RegistryValue(kUninstallKey, L"InstallLocation") != root.wstring()))) throw std::runtime_error("update location");
  const std::wstring mutexName=L"Local\\NaDraw-Installer";
  HANDLE mutex=CreateMutexW(nullptr, TRUE, mutexName.c_str());
  if (!mutex) throw std::runtime_error("installer lock");
  if (GetLastError()==ERROR_ALREADY_EXISTS) { CloseHandle(mutex); throw std::runtime_error("another installer is running"); }
  struct Lock {HANDLE value;~Lock(){ReleaseMutex(value);CloseHandle(value);}} lock{mutex};
  fs::create_directories(root);
  const fs::path staging=root/(L".nadraw-install-"+std::to_wstring(GetCurrentProcessId()));
  if (fs::exists(staging)) throw std::runtime_error("staging already exists");
  struct Change {fs::path relative;bool hadOriginal;};
  std::vector<Change> changes;
  try {
    auto entries=ReadPayload();
    for (const auto& entry:entries) {
      const auto output=staging/L"new"/entry.relative;
      fs::create_directories(output.parent_path());
      std::ofstream stream(output,std::ios::binary|std::ios::trunc);
      stream.write(reinterpret_cast<const char*>(entry.bytes.data()),static_cast<std::streamsize>(entry.bytes.size()));
      if(!stream)throw std::runtime_error("stage write failed");
    }
    if(!EnsureRuntime(staging/L"new"/L"WebView2Loader.dll"))throw std::runtime_error("runtime missing");
    fs::copy_file(g_executablePath,staging/L"new"/L"Uninstall.exe");
    entries.push_back({L"Uninstall.exe",{}});
    if(g_testInstall){std::ofstream(staging/L"new"/L"NaDraw.test-install")<<"1.0.25";entries.push_back({L"NaDraw.test-install",{}});}
    for(const auto& entry:entries){
      const auto target=root/entry.relative;
      for(auto parent=target.parent_path();parent!=root.root_path();parent=parent.parent_path()){
        const DWORD attributes=GetFileAttributesW(parent.c_str());
        if(attributes!=INVALID_FILE_ATTRIBUTES&&(attributes&FILE_ATTRIBUTE_REPARSE_POINT))throw std::runtime_error("redirected installation path");
        if(parent==root)break;
      }
      if(fs::exists(target)){
        HANDLE file=CreateFileW(target.c_str(),GENERIC_READ|DELETE,0,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);
        if(file==INVALID_HANDLE_VALUE)throw std::runtime_error("file in use");
        CloseHandle(file);
      }
    }
    for(const auto& entry:entries){
      const auto target=root/entry.relative,backup=staging/L"old"/entry.relative;
      fs::create_directories(target.parent_path());
      const bool exists=fs::exists(target);
      if(exists){fs::create_directories(backup.parent_path());if(!MoveFileExW(target.c_str(),backup.c_str(),MOVEFILE_WRITE_THROUGH))throw std::runtime_error("backup failed");}
      changes.push_back({entry.relative,exists});
      if(!MoveFileExW((staging/L"new"/entry.relative).c_str(),target.c_str(),MOVEFILE_WRITE_THROUGH))throw std::runtime_error("replacement failed");
      if(g_testInstall&&g_testFailAfter&&changes.size()==g_testFailAfter)throw std::runtime_error("simulated replacement failure");
    }
    // Retire only these known packaged reference images; preserve unknown user files.
    for(const auto& relative:{fs::path(L"web/assets/orbital-atlas.png"),fs::path(L"web/assets/arrow-atlas.png")}){
      const auto target=root/relative,backup=staging/L"old"/relative;
      if(fs::exists(target)){
        fs::create_directories(backup.parent_path());
        if(!MoveFileExW(target.c_str(),backup.c_str(),MOVEFILE_WRITE_THROUGH))throw std::runtime_error("obsolete asset in use");
        changes.push_back({relative,true});
      }
    }
    RegisterInstallation(root);
  }catch(...){
    bool restored=true;
    for(auto change=changes.rbegin();change!=changes.rend();++change){
      const auto target=root/change->relative,backup=staging/L"old"/change->relative;
      if(change->hadOriginal){if(!MoveFileExW(backup.c_str(),target.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))restored=false;}
      else{std::error_code error;fs::remove(target,error);if(error)restored=false;}
    }
    if(restored)RemoveStaging(root,staging);
    throw;
  }
  RemoveStaging(root,staging);
}

void Uninstall() {
  const fs::path root = fs::path(g_executablePath).parent_path();
  if (!fs::exists(root / L"NaDraw.exe") || (g_testInstall ? !fs::exists(root / L"NaDraw.test-install") : RegistryValue(kUninstallKey, L"InstallLocation") != root.wstring())) throw std::runtime_error("uninstall location");
  const auto entries = ReadPayload();
  std::vector<fs::path> directories;
  std::error_code error;
  for (const auto& entry : entries) {
    fs::remove(root / entry.relative, error);
    if (error) throw std::runtime_error("file in use");
    for (auto parent = (root / entry.relative).parent_path(); parent != root && parent != parent.root_path(); parent = parent.parent_path()) directories.push_back(parent);
  }
  std::sort(directories.begin(), directories.end(), [](const fs::path& left, const fs::path& right){return left.native().size()>right.native().size();});
  for (const auto& directory : directories) fs::remove(directory, error);
  if (!g_testInstall) {
  fs::remove(fs::path(KnownFolder(FOLDERID_Desktop)) / L"NaDraw.lnk", error);
  const fs::path programs = fs::path(KnownFolder(FOLDERID_Programs)) / L"NaDraw";
  fs::remove(programs / L"NaDraw.lnk", error);
  fs::remove(programs / L"卸载 NaDraw.lnk", error);
  fs::remove(programs, error);
  if (RegistryValue(L"Software\\Classes\\.nad", nullptr) == L"NaDraw.Project") RegDeleteTreeW(HKEY_CURRENT_USER, L"Software\\Classes\\.nad");
  RegDeleteTreeW(HKEY_CURRENT_USER, L"Software\\Classes\\NaDraw.Project");
  RegDeleteTreeW(HKEY_CURRENT_USER, kUninstallKey);
  SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
  } else fs::remove(root / L"NaDraw.test-install", error);
  const fs::path cleanup = fs::temp_directory_path() / (L"NaDraw-cleanup-" + std::to_wstring(GetCurrentProcessId()) + L".exe");
  fs::copy_file(g_executablePath, cleanup, fs::copy_options::overwrite_existing);
  const std::wstring parameters = L"--cleanup-uninstaller \"" + g_executablePath + L"\" --waitpid " + std::to_wstring(GetCurrentProcessId());
  ShellExecuteW(nullptr, L"open", cleanup.c_str(), parameters.c_str(), nullptr, SW_HIDE);
}

HWND Control(const wchar_t* type, const wchar_t* text, DWORD style, int x, int y, int width, int height, int id = 0) {
  const HWND control = CreateWindowExW(type == std::wstring(L"EDIT") ? WS_EX_CLIENTEDGE : 0, type, text, WS_CHILD | WS_VISIBLE | style, x, y, width, height, g_window, reinterpret_cast<HMENU>(static_cast<INT_PTR>(id)), g_instance, nullptr);
  SendMessageW(control, WM_SETFONT, reinterpret_cast<WPARAM>(g_font), TRUE);
  return control;
}

void Browse() {
  IFileOpenDialog* dialog = nullptr;
  if (FAILED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&dialog)))) return;
  dialog->SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM);
  dialog->SetTitle(L"选择 NaDraw 安装位置");
  if (dialog->Show(g_window) == S_OK) {
    IShellItem* item = nullptr;
    if (SUCCEEDED(dialog->GetResult(&item))) {
      PWSTR path = nullptr;
      if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &path))) {
        fs::path selected(path);
        if (selected.filename() != L"NaDraw") selected /= L"NaDraw";
        SetWindowTextW(g_path, selected.c_str());
        CoTaskMemFree(path);
      }
      item->Release();
    }
  }
  dialog->Release();
}

void BeginInstall() {
  wchar_t path[32768]{};
  GetWindowTextW(g_path, path, 32768);
  g_destination = path;
  EnableWindow(g_primary, FALSE); EnableWindow(g_cancel, FALSE); EnableWindow(g_path, FALSE);
  SetWindowTextW(g_status, L"正在安装，请稍候…");
  UpdateWindow(g_window);
  try {
    Install();
    g_complete = true;
    ShowWindow(g_launch, SW_SHOW);
    SetWindowTextW(g_status, L"NaDraw 1.0.25 已安装完成，可以开始绘图。\n以后可从桌面或开始菜单打开。工程文件使用 .nad 格式。");
    SetWindowTextW(g_primary, L"完成");
  } catch (...) {
    MessageBoxW(g_window, L"安装未完成。请确认安装目录可以写入，并关闭正在运行的 NaDraw。\n如果提示缺少 WebView2，请连接网络后重试。", L"NaDraw 安装", MB_ICONERROR);
    SetWindowTextW(g_status, L"安装未完成。检查目录、权限或运行时后可重试。");
    EnableWindow(g_cancel, TRUE); EnableWindow(g_path, TRUE);
  }
  EnableWindow(g_primary, TRUE);
}

LRESULT CALLBACK Procedure(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
  switch (message) {
    case WM_COMMAND:
      if (LOWORD(wParam) == kBrowse) Browse();
      else if (LOWORD(wParam) == kCancel) DestroyWindow(window);
      else if (LOWORD(wParam) == kInstall) {
        if (g_complete) {
          if (SendMessageW(g_launch, BM_GETCHECK, 0, 0) == BST_CHECKED) ShellExecuteW(nullptr, L"open", (fs::path(g_destination) / L"NaDraw.exe").c_str(), nullptr, g_destination.c_str(), SW_SHOWNORMAL);
          DestroyWindow(window);
        } else PostMessageW(window, kBeginInstall, 0, 0);
      }
      return 0;
    case kBeginInstall: BeginInstall(); return 0;
    case WM_CTLCOLORSTATIC: {
      SetBkMode(reinterpret_cast<HDC>(wParam), TRANSPARENT);
      return reinterpret_cast<LRESULT>(GetSysColorBrush(COLOR_WINDOW));
    }
    case WM_DESTROY: PostQuitMessage(0); return 0;
    default: return DefWindowProcW(window, message, wParam, lParam);
  }
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int show) {
  g_instance = instance;
  CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  INITCOMMONCONTROLSEX controls{sizeof(controls), ICC_STANDARD_CLASSES}; InitCommonControlsEx(&controls);
  wchar_t module[32768]{}; GetModuleFileNameW(nullptr, module, 32768); g_executablePath = module;
  g_destination = (fs::path(KnownFolder(FOLDERID_LocalAppData)) / L"Programs" / L"NaDraw").wstring();
  const auto previous=RegistryValue(kUninstallKey,L"InstallLocation");
  if(ValidDestination(previous)&&fs::exists(fs::path(previous)/L"NaDraw.exe"))g_destination=previous;
  int count = 0; PWSTR* arguments = CommandLineToArgvW(GetCommandLineW(), &count);
  std::wstring cleanupTarget;
  DWORD cleanupWaitPid = 0;
  for (int index = 1; index < count; ++index) {
    const std::wstring argument = arguments[index];
    if (argument == L"--silent") g_silent = true;
    else if (argument == L"--test-install") g_testInstall = true;
    else if (argument == L"--update") g_update = true;
    else if (argument == L"--test-fail-after" && index + 1 < count) g_testFailAfter = wcstoul(arguments[++index], nullptr, 10);
    else if (argument == L"--uninstall") g_uninstall = true;
    else if (argument == L"--dir" && index + 1 < count) g_destination = arguments[++index];
    else if (argument == L"--cleanup-uninstaller" && index + 1 < count) cleanupTarget = arguments[++index];
    else if (argument == L"--waitpid" && index + 1 < count) cleanupWaitPid = wcstoul(arguments[++index], nullptr, 10);
  }
  LocalFree(arguments);
  if (!cleanupTarget.empty()) {
    const fs::path target = fs::path(cleanupTarget).lexically_normal();
    if (target.is_absolute() && target.filename() == L"Uninstall.exe" && target != fs::path(g_executablePath)) {
      HANDLE process = OpenProcess(SYNCHRONIZE, FALSE, cleanupWaitPid);
      if (process) { WaitForSingleObject(process, 30000); CloseHandle(process); }
      std::error_code error;
      fs::remove(target, error);
      fs::remove(target.parent_path(), error);
    }
    CoUninitialize(); return 0;
  }
  if (g_uninstall) {
    if (!g_silent && MessageBoxW(nullptr, L"确定卸载 NaDraw 吗？\n\n您的 .nad 工程文件和个人数据会保留。", L"卸载 NaDraw", MB_YESNO | MB_ICONQUESTION) != IDYES) { CoUninitialize(); return 0; }
    try { Uninstall(); if (!g_silent) MessageBoxW(nullptr, L"NaDraw 已卸载。您的工程文件和个人数据已保留。", L"NaDraw", MB_OK); }
    catch (...) { if (!g_silent) MessageBoxW(nullptr, L"卸载未完成。请关闭 NaDraw 后重试。", L"NaDraw", MB_ICONERROR); CoUninitialize(); return 1; }
    CoUninitialize(); return 0;
  }
  if (g_silent) {
    try { Install(); } catch (...) { CoUninitialize(); return 1; }
    CoUninitialize(); return 0;
  }
  g_font = CreateFontW(-16,0,0,0,FW_NORMAL,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,L"Microsoft YaHei UI");
  g_titleFont = CreateFontW(-27,0,0,0,FW_SEMIBOLD,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,L"Microsoft YaHei UI");
  WNDCLASSEXW cls{sizeof(cls)}; cls.lpfnWndProc=Procedure; cls.hInstance=instance; cls.hIcon=LoadIconW(instance,MAKEINTRESOURCEW(101)); cls.hIconSm=cls.hIcon; cls.hCursor=LoadCursorW(nullptr,IDC_ARROW); cls.hbrBackground=GetSysColorBrush(COLOR_WINDOW); cls.lpszClassName=kClass; RegisterClassExW(&cls);
  g_window=CreateWindowExW(0,kClass,L"NaDraw 1.0.25 安装向导",WS_OVERLAPPED|WS_CAPTION|WS_SYSMENU|WS_MINIMIZEBOX,CW_USEDEFAULT,CW_USEDEFAULT,700,480,nullptr,nullptr,instance,nullptr);
  HWND icon=Control(L"STATIC",L"",SS_ICON,28,24,48,48); SendMessageW(icon,STM_SETICON,reinterpret_cast<WPARAM>(LoadIconW(instance,MAKEINTRESOURCEW(101))),0);
  HWND title=Control(L"STATIC",L"安装 NaDraw 1.0.25",0,92,23,540,40); SendMessageW(title,WM_SETFONT,reinterpret_cast<WPARAM>(g_titleFont),TRUE);
  Control(L"STATIC",L"化学结构与机理图绘制工具",0,94,64,520,26);
  Control(L"STATIC",L"请选择安装位置，点击“安装”完成设置。\n本程序使用系统 WebView2 运行时，安装后可离线使用。",0,28,120,628,54);
  Control(L"STATIC",L"安装位置",0,28,194,620,24);
  g_path=Control(L"EDIT",g_destination.c_str(),ES_AUTOHSCROLL|WS_TABSTOP,28,224,538,30,kPath);
  Control(L"BUTTON",L"浏览…",WS_TABSTOP,578,224,82,30,kBrowse);
  g_desktop=Control(L"BUTTON",L"创建桌面快捷方式",BS_AUTOCHECKBOX|WS_TABSTOP,28,270,400,28,kDesktop); SendMessageW(g_desktop,BM_SETCHECK,BST_CHECKED,0);
  g_launch=Control(L"BUTTON",L"启动 NaDraw",BS_AUTOCHECKBOX|WS_TABSTOP,28,304,400,28,kLaunch); SendMessageW(g_launch,BM_SETCHECK,BST_CHECKED,0); ShowWindow(g_launch,SW_HIDE);
  g_status=Control(L"STATIC",NADRAW_OFFICIAL_BUILD?L"1.0.25 正式版 · Windows 10/11 64 位":L"1.0.25 源码构建 · 非商业使用 · Windows 10/11 64 位",0,28,339,628,48);
  g_primary=Control(L"BUTTON",L"安装",BS_DEFPUSHBUTTON|WS_TABSTOP,454,397,98,32,kInstall);
  g_cancel=Control(L"BUTTON",L"取消",WS_TABSTOP,564,397,96,32,kCancel);
  ShowWindow(g_window,show); UpdateWindow(g_window);
  MSG message{}; while(GetMessageW(&message,nullptr,0,0)>0){if(!IsDialogMessageW(g_window,&message)){TranslateMessage(&message);DispatchMessageW(&message);}}
  DeleteObject(g_font); DeleteObject(g_titleFont); CoUninitialize(); return 0;
}
