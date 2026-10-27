#pragma once
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#endif
#include <windows.h>
#include <winhttp.h>
#include <bcrypt.h>
#include <shellapi.h>
#include <shlobj.h>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>
#include <map>
#include <array>
#include <algorithm>
#include <chrono>
#include <stdexcept>
#include "update-public-key.h"
#ifndef NADRAW_OFFICIAL_BUILD
#define NADRAW_OFFICIAL_BUILD 0
#endif

namespace nadraw_update {
namespace fs = std::filesystem;
inline constexpr wchar_t kVersion[] = L"1.0.25";
inline constexpr bool kOfficialBuild = NADRAW_OFFICIAL_BUILD != 0;
inline constexpr wchar_t kManifestUrl[] = L"http://atlas1020.vxni.ink/nadraw/latest.json";
inline fs::path dataDirectoryOverride;

inline std::wstring Wide(const std::string& text) {
  const int size=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),nullptr,0);
  if(size<=0&&!text.empty())throw std::runtime_error("UTF-8");
  std::wstring result(size,0);if(size)MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),result.data(),size);return result;
}
inline std::string Utf8(const std::wstring& text) {
  const int size=WideCharToMultiByte(CP_UTF8,0,text.data(),static_cast<int>(text.size()),nullptr,0,nullptr,nullptr);
  std::string result(size,0);if(size)WideCharToMultiByte(CP_UTF8,0,text.data(),static_cast<int>(text.size()),result.data(),size,nullptr,nullptr);return result;
}
inline std::string Read(const fs::path& path) {
  std::ifstream input(path,std::ios::binary);if(!input)throw std::runtime_error("read file");return {std::istreambuf_iterator<char>(input),{}};
}
inline void Write(const fs::path& path,const std::string& bytes) {
  fs::create_directories(path.parent_path());std::ofstream output(path,std::ios::binary|std::ios::trunc);output.write(bytes.data(),static_cast<std::streamsize>(bytes.size()));if(!output)throw std::runtime_error("write file");
}
inline fs::path DataDirectory() {
  if(!dataDirectoryOverride.empty()){fs::create_directories(dataDirectoryOverride);return dataDirectoryOverride;}
  PWSTR raw=nullptr;if(FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData,KF_FLAG_CREATE,nullptr,&raw)))throw std::runtime_error("data directory");fs::path result=fs::path(raw)/L"NaDraw";CoTaskMemFree(raw);fs::create_directories(result);return result;
}
inline std::wstring Escape(const std::wstring& text) {
  std::wstring result;for(auto c:text){if(c==L'"')result+=L"\\\"";else if(c==L'\\')result+=L"\\\\";else if(c==L'\n')result+=L"\\n";else if(c==L'\r')result+=L"\\r";else if(c==L'\t')result+=L"\\t";else if(c<32)result+=L" ";else result+=c;}return result;
}
using Object=std::map<std::wstring,std::wstring>;
inline Object Parse(const std::string& bytes) {
  const auto text=Wide(bytes);size_t i=0;
  auto spaces=[&](){while(i<text.size()&&iswspace(text[i]))++i;};
  auto string=[&](){std::wstring value;if(i>=text.size()||text[i++]!=L'"')throw std::runtime_error("JSON string");bool closed=false;while(i<text.size()){wchar_t c=text[i++];if(c==L'"'){closed=true;break;}if(c<32)throw std::runtime_error("JSON control");if(c==L'\\'){if(i>=text.size())throw std::runtime_error("JSON escape");c=text[i++];switch(c){case L'"':case L'\\':case L'/':break;case L'n':c=L'\n';break;case L'r':c=L'\r';break;case L't':c=L'\t';break;case L'b':c=L'\b';break;case L'f':c=L'\f';break;case L'u':{if(i+4>text.size())throw std::runtime_error("JSON unicode");unsigned code=0;for(int n=0;n<4;++n){auto hex=text[i++];code<<=4;if(hex>=L'0'&&hex<=L'9')code+=hex-L'0';else if(hex>=L'a'&&hex<=L'f')code+=hex-L'a'+10;else if(hex>=L'A'&&hex<=L'F')code+=hex-L'A'+10;else throw std::runtime_error("JSON unicode");}c=static_cast<wchar_t>(code);break;}default:throw std::runtime_error("JSON escape");}}value+=c;}if(!closed)throw std::runtime_error("JSON termination");return value;};
  spaces();if(i>=text.size()||text[i++]!=L'{')throw std::runtime_error("JSON object");Object values;spaces();if(i<text.size()&&text[i]==L'}'){++i;spaces();if(i!=text.size())throw std::runtime_error("JSON trailing");return values;}
  while(i<text.size()){spaces();auto key=string();spaces();if(i>=text.size()||text[i++]!=L':')throw std::runtime_error("JSON separator");spaces();auto value=string();if(!values.emplace(key,value).second)throw std::runtime_error("duplicate field");spaces();if(i>=text.size())throw std::runtime_error("JSON end");if(text[i++]==L'}'){spaces();if(i!=text.size())throw std::runtime_error("JSON trailing");return values;}if(text[i-1]!=L',')throw std::runtime_error("JSON comma");}
  throw std::runtime_error("JSON incomplete");
}
inline std::string Json(const Object& values) {
  std::wstring result=L"{";bool first=true;for(const auto& [key,value]:values){if(!first)result+=L",";first=false;result+=L"\""+Escape(key)+L"\":\""+Escape(value)+L"\"";}return Utf8(result+L"}");
}
inline std::vector<unsigned char> Base64(const std::wstring& text) {
  const std::wstring alphabet=L"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";std::vector<unsigned char> result;if(text.empty()||text.size()%4)throw std::runtime_error("base64 size");unsigned value=0;int bits=-8;bool padded=false;for(size_t i=0;i<text.size();++i){auto c=text[i];if(c==L'='){padded=true;if(i<text.size()-2)throw std::runtime_error("base64 padding");continue;}if(padded)throw std::runtime_error("base64 trailing");auto n=alphabet.find(c);if(n==std::wstring::npos)throw std::runtime_error("base64 character");value=(value<<6)|static_cast<unsigned>(n);bits+=6;if(bits>=0){result.push_back(static_cast<unsigned char>(value>>bits));bits-=8;}}return result;
}
inline std::vector<unsigned char> Hash(const std::string& bytes) {
  BCRYPT_ALG_HANDLE algorithm=nullptr;BCRYPT_HASH_HANDLE hash=nullptr;std::vector<unsigned char> digest(32);if(BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0)throw std::runtime_error("hash provider");NTSTATUS status=BCryptCreateHash(algorithm,&hash,nullptr,0,nullptr,0,0);if(status>=0)status=BCryptHashData(hash,reinterpret_cast<PUCHAR>(const_cast<char*>(bytes.data())),static_cast<ULONG>(bytes.size()),0);if(status>=0)status=BCryptFinishHash(hash,digest.data(),32,0);if(hash)BCryptDestroyHash(hash);BCryptCloseAlgorithmProvider(algorithm,0);if(status<0)throw std::runtime_error("hash failure");return digest;
}
inline std::wstring Hex(const std::vector<unsigned char>& bytes) {
  constexpr wchar_t digits[]=L"0123456789abcdef";std::wstring result;for(auto byte:bytes){result+=digits[byte>>4];result+=digits[byte&15];}return result;
}
inline std::array<unsigned long long,5> Version(const std::wstring& version) {
  std::array<unsigned long long,5> result{};size_t i=0;
  auto number=[&](){size_t start=i;unsigned long long value=0;while(i<version.size()&&version[i]>=L'0'&&version[i]<=L'9'){value=value*10+version[i++]-L'0';if(value>1000000000)throw std::runtime_error("version range");}if(i==start)throw std::runtime_error("version number");return value;};
  for(int part=0;part<3;++part){result[part]=number();if(part<2&&(i>=version.size()||version[i++]!=L'.'))throw std::runtime_error("version separator");}
  if(i<version.size()&&version[i]==L'm'){++i;result[3]=number();}if(i<version.size()&&version[i]==L'-'){++i;if(i>=version.size()||(version[i]!=L'T'&&version[i]!=L'Y'))throw std::runtime_error("version suffix");++i;result[4]=number();}if(i!=version.size())throw std::runtime_error("version trailing");return result;
}
inline void ValidateUpdateUrl(const std::wstring& url) {
  if((url.rfind(L"https://",0)!=0&&url.rfind(L"http://",0)!=0)||url.find_first_of(L"\r\n#")!=std::wstring::npos)throw std::runtime_error("invalid update URL");
  URL_COMPONENTS parts{sizeof(parts)};parts.dwHostNameLength=parts.dwUserNameLength=parts.dwPasswordLength=parts.dwUrlPathLength=parts.dwExtraInfoLength=static_cast<DWORD>(-1);
  if(!WinHttpCrackUrl(url.c_str(),0,0,&parts)||(parts.nScheme!=INTERNET_SCHEME_HTTPS&&parts.nScheme!=INTERNET_SCHEME_HTTP)||!parts.dwHostNameLength||parts.dwUserNameLength||parts.dwPasswordLength)throw std::runtime_error("invalid update URL");
  if(parts.nScheme==INTERNET_SCHEME_HTTP){
    std::wstring host(parts.lpszHostName,parts.dwHostNameLength);
    std::transform(host.begin(),host.end(),host.begin(),[](wchar_t c){return c>=L'A'&&c<=L'Z'?c-L'A'+L'a':c;});
#ifdef NADRAW_UPDATE_NETWORK_TESTS
    if(host==L"127.0.0.1")return;
#endif
    const std::wstring path=parts.dwUrlPathLength?std::wstring(parts.lpszUrlPath,parts.dwUrlPathLength):L"/";
    const bool updatePath=path==L"/nadraw/latest.json"||path.rfind(L"/nadraw/releases/",0)==0;
    if(host!=L"atlas1020.vxni.ink"||parts.nPort!=INTERNET_DEFAULT_HTTP_PORT||!updatePath||path.find(L"..")!=std::wstring::npos||path.find(L'%')!=std::wstring::npos)throw std::runtime_error("HTTP update address is not configured");
  }
}
struct Manifest {std::wstring version,url,sha256,notes;size_t size=0;};
inline Manifest VerifyManifest(const std::string& envelope) {
  if(envelope.size()>128*1024)throw std::runtime_error("manifest size");const auto outer=Parse(envelope);const auto bytes=Base64(outer.at(L"payload")),signature=Base64(outer.at(L"signature"));const std::string payload(bytes.begin(),bytes.end());const auto digest=Hash(payload);
  BCRYPT_ALG_HANDLE algorithm=nullptr;BCRYPT_KEY_HANDLE key=nullptr;if(BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_RSA_ALGORITHM,nullptr,0)<0)throw std::runtime_error("signature provider");
  NTSTATUS status=BCryptImportKeyPair(algorithm,nullptr,BCRYPT_RSAPUBLIC_BLOB,&key,const_cast<PUCHAR>(kNaDrawUpdatePublicKey),sizeof(kNaDrawUpdatePublicKey),0);BCRYPT_PKCS1_PADDING_INFO padding{BCRYPT_SHA256_ALGORITHM};if(status>=0)status=BCryptVerifySignature(key,&padding,const_cast<PUCHAR>(digest.data()),static_cast<ULONG>(digest.size()),const_cast<PUCHAR>(signature.data()),static_cast<ULONG>(signature.size()),BCRYPT_PAD_PKCS1);if(key)BCryptDestroyKey(key);BCryptCloseAlgorithmProvider(algorithm,0);if(status<0)throw std::runtime_error("invalid release signature");
  const auto fields=Parse(payload);if(fields.at(L"app")!=L"NaDraw"||fields.at(L"arch")!=L"win-x64")throw std::runtime_error("release target");Manifest manifest{fields.at(L"version"),fields.at(L"url"),fields.at(L"sha256"),fields.at(L"notes")};Version(manifest.version);ValidateUpdateUrl(manifest.url);if(manifest.sha256.size()!=64||!std::all_of(manifest.sha256.begin(),manifest.sha256.end(),[](wchar_t c){return(c>=L'0'&&c<=L'9')||(c>=L'a'&&c<=L'f');}))throw std::runtime_error("release hash");const auto& sizeText=fields.at(L"size");if(sizeText.empty()||!std::all_of(sizeText.begin(),sizeText.end(),iswdigit))throw std::runtime_error("release size");manifest.size=std::stoull(sizeText);if(!manifest.size||manifest.size>64*1024*1024)throw std::runtime_error("release size limit");return manifest;
}
inline void VerifyPackage(const Manifest& manifest,const fs::path& package) {
  if(fs::file_size(package)!=manifest.size)throw std::runtime_error("package size mismatch");if(Hex(Hash(Read(package)))!=manifest.sha256)throw std::runtime_error("package hash mismatch");
}
struct Internet {HINTERNET handle=nullptr;explicit Internet(HINTERNET value):handle(value){if(!handle)throw std::runtime_error("network initialization");}~Internet(){if(handle)WinHttpCloseHandle(handle);}operator HINTERNET()const{return handle;}Internet(const Internet&)=delete;};
inline std::string Download(const std::wstring& url,size_t limit) {
  ValidateUpdateUrl(url);URL_COMPONENTS parts{sizeof(parts)};parts.dwHostNameLength=parts.dwUrlPathLength=parts.dwExtraInfoLength=static_cast<DWORD>(-1);if(!WinHttpCrackUrl(url.c_str(),0,0,&parts))throw std::runtime_error("URL");
  const std::wstring host(parts.lpszHostName,parts.dwHostNameLength);
  const std::wstring path=(parts.dwUrlPathLength?std::wstring(parts.lpszUrlPath,parts.dwUrlPathLength):L"/")+(parts.dwExtraInfoLength?std::wstring(parts.lpszExtraInfo,parts.dwExtraInfoLength):L"");
  Internet session(WinHttpOpen(L"NaDraw/1.0.25",WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0));WinHttpSetTimeouts(session,8000,8000,15000,15000);DWORD protocols=WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2;WinHttpSetOption(session,WINHTTP_OPTION_SECURE_PROTOCOLS,&protocols,sizeof(protocols));Internet connection(WinHttpConnect(session,host.c_str(),parts.nPort,0));
  const DWORD flags=WINHTTP_FLAG_REFRESH|(parts.nScheme==INTERNET_SCHEME_HTTPS?WINHTTP_FLAG_SECURE:0);
  Internet request(WinHttpOpenRequest(connection,L"GET",path.c_str(),nullptr,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,flags));DWORD policy=WINHTTP_OPTION_REDIRECT_POLICY_NEVER;WinHttpSetOption(request,WINHTTP_OPTION_REDIRECT_POLICY,&policy,sizeof(policy));
  if(!WinHttpSendRequest(request,L"Cache-Control: no-cache\r\n",static_cast<DWORD>(-1),WINHTTP_NO_REQUEST_DATA,0,0,0)||!WinHttpReceiveResponse(request,nullptr))throw std::runtime_error("连接失败，请检查网络或更新服务器地址");DWORD status=0,size=sizeof(status);if(!WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&status,&size,nullptr)||status!=200)throw std::runtime_error("更新服务器暂不可用（HTTP "+std::to_string(status)+")");
  std::string bytes;std::array<char,32768> buffer{};auto started=std::chrono::steady_clock::now();while(true){DWORD count=0;if(!WinHttpReadData(request,buffer.data(),static_cast<DWORD>(buffer.size()),&count))throw std::runtime_error("下载中断");if(!count)break;if(bytes.size()+count>limit)throw std::runtime_error("download limit");bytes.append(buffer.data(),count);if(std::chrono::steady_clock::now()-started>std::chrono::minutes(3))throw std::runtime_error("download timeout");}return bytes;
}
inline bool AutoEnabled() {if(!kOfficialBuild)return false;const auto settings=DataDirectory()/L"settings.ini";return GetPrivateProfileIntW(L"Updates",L"Automatic",1,settings.c_str())!=0;}
inline void SetAuto(bool enabled) {if(!kOfficialBuild)return;const auto settings=DataDirectory()/L"settings.ini";if(!WritePrivateProfileStringW(L"Updates",L"Automatic",enabled?L"1":L"0",settings.c_str()))throw std::runtime_error("settings");}
inline std::wstring InstalledVersion(const fs::path& executable) {
  DWORD ignored=0;const DWORD size=GetFileVersionInfoSizeW(executable.c_str(),&ignored);if(!size)throw std::runtime_error("installed version");std::vector<unsigned char> bytes(size);if(!GetFileVersionInfoW(executable.c_str(),0,size,bytes.data()))throw std::runtime_error("file version");
  struct Translation {WORD language,codepage;};Translation* translations=nullptr;UINT length=0;
  if(VerQueryValueW(bytes.data(),L"\\VarFileInfo\\Translation",reinterpret_cast<void**>(&translations),&length)){
    for(UINT i=0;i<length/sizeof(Translation);++i){wchar_t query[100]{};swprintf(query,100,L"\\StringFileInfo\\%04x%04x\\ProductVersion",translations[i].language,translations[i].codepage);wchar_t* value=nullptr;UINT characters=0;if(VerQueryValueW(bytes.data(),query,reinterpret_cast<void**>(&value),&characters)&&value&&characters>1){std::wstring version(value);Version(version);return version;}}
  }
  VS_FIXEDFILEINFO* info=nullptr;if(!VerQueryValueW(bytes.data(),L"\\",reinterpret_cast<void**>(&info),&length)||!info)throw std::runtime_error("version info");return std::to_wstring(HIWORD(info->dwProductVersionMS))+L"."+std::to_wstring(LOWORD(info->dwProductVersionMS))+L"."+std::to_wstring(HIWORD(info->dwProductVersionLS));
}
}
