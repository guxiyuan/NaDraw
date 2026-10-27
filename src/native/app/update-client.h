#pragma once
#include "../common/update-common.h"
#include <thread>
#include <atomic>

namespace nadraw_client {
namespace update=nadraw_update;
struct Result {std::wstring state,message,version,notes;bool manual=false;};
inline constexpr UINT kResultMessage=WM_APP+20;
inline std::thread worker;
inline std::atomic<bool> busy=false;
inline std::wstring readyVersion;
inline bool closing=false;

inline fs::path CacheDirectory(){return update::DataDirectory()/L"Updates";}
inline std::wstring DescribeError(const std::string& error){
  if(error.find("signature")!=std::string::npos)return L"更新描述的发布签名无效，请联系开发者";
  if(error.find("package")!=std::string::npos)return L"更新包校验失败，下次检查时将重新下载";
  if(error.find("JSON")!=std::string::npos||error.find("map::at")!=std::string::npos||error.find("release")!=std::string::npos)return L"服务器返回的更新信息无效，请联系开发者";
  if(error.find("timeout")!=std::string::npos)return L"网络连接超时，请稍后重试";
  if(error.find("write")!=std::string::npos)return L"无法保存更新文件，请检查磁盘空间和目录权限";
  if(std::any_of(error.begin(),error.end(),[](unsigned char c){return c>=128;}))return update::Wide(error);
  return L"检查或下载未完成，请检查网络后重试";
}
inline void Status(const std::wstring& state,const std::wstring& message,const std::wstring& version=L""){
  PostJson(L"{\"event\":\"update-state\",\"state\":\""+update::Escape(state)+L"\",\"message\":\""+update::Escape(message)+L"\",\"version\":\""+update::Escape(version)+L"\"}");
}
inline void Start(bool manual){
  if(!update::kOfficialBuild){Status(L"disabled",L"源码构建不接入官方自动更新，请从源码重新编译");return;}
  if(busy.exchange(true)){if(manual)MessageBoxW(g_window,L"正在检查或下载更新，请稍候。",L"NaDraw 更新",MB_OK);return;}
  if(worker.joinable())worker.join();
  if(!manual&&!update::AutoEnabled()){busy=false;return;}
  Status(L"checking",L"正在检查更新…");
  worker=std::thread([manual](){
    auto result=new Result;result->manual=manual;
    try{
      std::string envelope;
      const auto pending=CacheDirectory()/L"pending.json";
      bool cached=false;
      if(fs::exists(pending)){
        try{envelope=update::Read(pending);const auto manifest=update::VerifyManifest(envelope);update::VerifyPackage(manifest,CacheDirectory()/L"package.exe");cached=update::Version(manifest.version)>update::Version(update::kVersion);}catch(...){envelope.clear();}
      }
      if(!cached)envelope=update::Download(update::kManifestUrl,128*1024);
      const auto manifest=update::VerifyManifest(envelope);
      if(update::Version(manifest.version)<=update::Version(update::kVersion)){
        result->state=L"current";result->message=L"当前已是最新版本（"+std::wstring(update::kVersion)+L"）";
      }else{
        const auto cache=CacheDirectory();fs::create_directories(cache);
        if(!cached){
          auto progress=new Result{L"downloading",L"发现 "+manifest.version+L"，正在后台下载…",manifest.version,L"",false};if(!PostMessageW(g_window,kResultMessage,0,reinterpret_cast<LPARAM>(progress)))delete progress;
          const auto bytes=update::Download(manifest.url,manifest.size);
          const auto partial=cache/L"package.part";update::Write(partial,bytes);update::VerifyPackage(manifest,partial);
          if(!MoveFileExW(partial.c_str(),(cache/L"package.exe").c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("无法保存更新包");
          update::Write(pending,envelope);
        }
        result->state=L"ready";result->message=L"版本 "+manifest.version+L" 已下载，退出程序后自动安装";result->version=manifest.version;result->notes=manifest.notes;
      }
    }catch(const std::exception& error){result->state=L"error";result->message=L"暂时无法更新："+DescribeError(error.what());}
    busy=false;
    if(!PostMessageW(g_window,kResultMessage,0,reinterpret_cast<LPARAM>(result)))delete result;
  });
}
inline void HandleResult(Result* result){
  if(!closing){if(result->state==L"ready")readyVersion=result->version;Status(result->state,result->message,result->version);if(result->manual)MessageBoxW(g_window,(result->message+(result->notes.empty()?L"":L"\n\n"+result->notes)).c_str(),L"NaDraw 更新",result->state==L"error"?MB_OK|MB_ICONINFORMATION:MB_OK);}
  delete result;
}
inline bool LaunchPending(){
  if(!update::kOfficialBuild)return false;
  if(readyVersion.empty())return false;
  try{
    const auto cache=CacheDirectory();const auto manifest=update::VerifyManifest(update::Read(cache/L"pending.json"));update::VerifyPackage(manifest,cache/L"package.exe");if(update::Version(manifest.version)<=update::Version(update::kVersion))return false;
    const auto helper=cache/(L"Apply-"+std::to_wstring(GetCurrentProcessId())+L".exe");
    fs::copy_file(fs::path(g_executableDirectory)/L"NaDrawUpdater.exe",helper,fs::copy_options::overwrite_existing);
    const std::wstring parameters=L"--apply --manifest \""+(cache/L"pending.json").wstring()+L"\" --package \""+(cache/L"package.exe").wstring()+L"\" --install-dir \""+g_executableDirectory+L"\" --parent "+std::to_wstring(GetCurrentProcessId());
    const auto result=ShellExecuteW(g_window,L"open",helper.c_str(),parameters.c_str(),nullptr,SW_HIDE);
    return reinterpret_cast<INT_PTR>(result)>32;
  }catch(...){return false;}
}
inline void CompletionNotification(){
  if(!update::kOfficialBuild)return;
  try{
    const auto marker=update::DataDirectory()/L"update-complete.json";if(!fs::exists(marker))return;
    const auto values=update::Parse(update::Read(marker));if(values.at(L"version")!=update::kVersion)return;
    const std::wstring message=L"NaDraw 已成功更新至 "+std::wstring(update::kVersion)+L"\n\n"+values.at(L"notes");MessageBoxW(g_window,message.c_str(),L"NaDraw 更新完成",MB_OK|MB_ICONINFORMATION);
    std::error_code error;fs::remove(marker,error);
  }catch(...){}
}
inline void Shutdown(){closing=true;if(worker.joinable())worker.join();}
}
