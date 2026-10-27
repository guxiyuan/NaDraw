#ifndef UNICODE
#define UNICODE
#endif
#include "../common/update-common.h"
#include <iostream>

namespace update=nadraw_update;
namespace fs=std::filesystem;

int WINAPI wWinMain(HINSTANCE,HINSTANCE,PWSTR,int){
  CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
  std::wstring manifestPath,packagePath,installDirectory,currentVersion;
  bool apply=false,test=false;DWORD parentId=0;
  int count=0;auto arguments=CommandLineToArgvW(GetCommandLineW(),&count);
  for(int i=1;i<count;++i){const std::wstring argument=arguments[i];if(argument==L"--apply")apply=true;else if(argument==L"--test")test=true;else if(argument==L"--manifest"&&i+1<count)manifestPath=arguments[++i];else if(argument==L"--package"&&i+1<count)packagePath=arguments[++i];else if(argument==L"--install-dir"&&i+1<count)installDirectory=arguments[++i];else if(argument==L"--current"&&i+1<count)currentVersion=arguments[++i];else if(argument==L"--parent"&&i+1<count)parentId=wcstoul(arguments[++i],nullptr,10);}
  LocalFree(arguments);
  try{
    if(manifestPath.empty()||packagePath.empty())throw std::runtime_error("missing update files");
    const auto envelope=update::Read(manifestPath);const auto manifest=update::VerifyManifest(envelope);update::VerifyPackage(manifest,packagePath);
    if(!apply){if(!currentVersion.empty()&&update::Version(manifest.version)<=update::Version(currentVersion))throw std::runtime_error("release is not newer");CoUninitialize();return 0;}
    const auto directory=fs::absolute(installDirectory).lexically_normal();if(installDirectory.empty()||directory==directory.root_path()||!fs::exists(directory/L"NaDraw.exe"))throw std::runtime_error("invalid installation");
    const auto installedVersion=update::InstalledVersion(directory/L"NaDraw.exe");if(update::Version(manifest.version)<=update::Version(installedVersion))throw std::runtime_error("downgrade rejected");
    if(update::InstalledVersion(packagePath)!=manifest.version)throw std::runtime_error("installer version mismatch");
    if(parentId){HANDLE parent=OpenProcess(SYNCHRONIZE,FALSE,parentId);if(parent){const DWORD wait=WaitForSingleObject(parent,60000);CloseHandle(parent);if(wait!=WAIT_OBJECT_0)throw std::runtime_error("program is still running");}}
    update::VerifyPackage(manifest,packagePath);
    std::wstring parameters=L"--silent --update --dir \""+directory.wstring()+L"\"";if(test)parameters+=L" --test-install";
    SHELLEXECUTEINFOW execute{sizeof(execute)};execute.fMask=SEE_MASK_NOCLOSEPROCESS;execute.lpFile=packagePath.c_str();execute.lpParameters=parameters.c_str();execute.nShow=SW_HIDE;if(!ShellExecuteExW(&execute))throw std::runtime_error("installer could not start");const DWORD wait=WaitForSingleObject(execute.hProcess,180000);DWORD code=1;GetExitCodeProcess(execute.hProcess,&code);CloseHandle(execute.hProcess);if(wait!=WAIT_OBJECT_0||code!=0)throw std::runtime_error("installation did not complete");
    if(update::InstalledVersion(directory/L"NaDraw.exe")!=manifest.version)throw std::runtime_error("installed version did not change");
    const auto marker=test?directory.parent_path()/L"update-complete.json":update::DataDirectory()/L"update-complete.json";
    update::Write(marker,update::Json({{L"version",manifest.version},{L"from",installedVersion},{L"notes",manifest.notes}}));
    std::error_code error;fs::remove(manifestPath,error);fs::remove(packagePath,error);
    CoUninitialize();return 0;
  }catch(const std::exception& error){
    if(apply&&!test){try{update::Write(update::DataDirectory()/L"update-error.json",update::Json({{L"error",update::Wide(error.what())}}));}catch(...){}MessageBoxW(nullptr,L"自动更新未完成。\n请重新打开 NaDraw 后手动检查更新，或下载新版安装包。您的工程文件不会被更新程序删除。",L"NaDraw 更新",MB_OK|MB_ICONINFORMATION);}
    CoUninitialize();return 1;
  }
}
