#include "../src/native/common/update-common.h"
#include <iostream>
namespace u=nadraw_update;
void Check(bool condition,const char* name){if(!condition)throw std::runtime_error(name);std::cout<<"PASS "<<name<<"\n";}
template<class F> void Reject(F action,const char* name){bool rejected=false;try{action();}catch(...){rejected=true;}Check(rejected,name);}
int wmain(int count,wchar_t** arguments){
 try{
  Check(u::Version(L"1.0.25")>u::Version(L"1.0.2")&&u::Version(L"1.0.25")>u::Version(L"1.0.9"),"numeric 1.0.25 version order");
  Check(u::Version(L"1.0.25")>u::Version(L"1.0.0m9-T2"),"normal version upgrade");
  Check(u::Version(L"1.0.25m1-T1")>u::Version(L"1.0.25m1"),"information and emergency suffix");
  Check(u::Version(L"1.0.25m1")>u::Version(L"1.0.25-T1"),"information revision order");
  Reject([]{u::Version(L"1.0.25.exe");},"invalid version rejected");
  Reject([]{u::Version(L"99999999999999999999.0.0");},"version overflow rejected");
  u::ValidateUpdateUrl(u::kManifestUrl);
  u::ValidateUpdateUrl(L"http://atlas1020.vxni.ink/nadraw/releases/NaDraw-Setup-1.0.25.exe");
  Check(std::wstring(u::kManifestUrl).rfind(L"http://",0)==0,"configured HTTP update endpoint accepted");
  u::ValidateUpdateUrl(L"https://example.com/a.exe");
  Reject([]{u::ValidateUpdateUrl(L"http://example.com/a.exe");},"unconfigured HTTP host rejected");
  Reject([]{u::ValidateUpdateUrl(L"http://atlas1020.vxni.ink.evil.example/nadraw/latest.json");},"lookalike HTTP host rejected");
  Reject([]{u::ValidateUpdateUrl(L"http://atlas1020.vxni.ink:8080/nadraw/latest.json");},"unconfigured HTTP port rejected");
  Reject([]{u::ValidateUpdateUrl(L"http://atlas1020.vxni.ink/other/file.exe");},"unconfigured HTTP path rejected");
  Reject([]{u::ValidateUpdateUrl(L"http://atlas1020.vxni.ink/nadraw/releases/../other.exe");},"HTTP path traversal rejected");
  Reject([]{u::ValidateUpdateUrl(L"http://127.0.0.1/nadraw/latest.json");},"loopback HTTP rejected in production policy");
  Reject([]{u::ValidateUpdateUrl(L"https://user:secret@example.com/a.exe");},"URL credentials rejected");
  Reject([]{u::ValidateUpdateUrl(L"ftp://atlas1020.vxni.ink/nadraw/latest.json");},"other URL schemes rejected");
  Reject([]{u::Parse("{\"a\":\"1\",\"a\":\"2\"}");},"duplicate JSON fields rejected");
  Reject([]{u::Parse("{\"a\":\"1\",}");},"invalid JSON rejected");
  const u::Object fields{{L"notes",L"中文 σ δ Δ\n更新"},{L"version",L"1.0.25"}};
  Check(u::Parse(u::Json(fields))==fields,"Unicode release notes round trip");
  Check(u::Hex(u::Hash("abc"))==L"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad","SHA256 known vector");
  if(count!=4)throw std::runtime_error("expected manifest package fixtures");
  const auto envelope=u::Read(arguments[1]);const auto manifest=u::VerifyManifest(envelope);u::VerifyPackage(manifest,arguments[2]);
  Check(manifest.version==L"1.0.25","signed release and real installer accepted");
  Check(manifest.url.rfind(L"http://atlas1020.vxni.ink/nadraw/releases/",0)==0,"signed installer URL uses configured HTTP source");
  auto outer=u::Parse(envelope);outer[L"payload"][10]=outer[L"payload"][10]==L'A'?L'B':L'A';
  Reject([&]{u::VerifyManifest(u::Json(outer));},"tampered release rejected");
  outer=u::Parse(envelope);outer[L"signature"][5]=outer[L"signature"][5]==L'A'?L'B':L'A';
  Reject([&]{u::VerifyManifest(u::Json(outer));},"wrong signature rejected");
  const std::filesystem::path fixtures=arguments[3];
  for(const auto& name:{L"http.json",L"wrong-arch.json",L"wrong-app.json",L"oversize.json"})Reject([&]{u::VerifyManifest(u::Read(fixtures/name));},u::Utf8(name).c_str());
  Reject([&]{u::VerifyPackage(manifest,fixtures/L"corrupt.exe");},"modified package rejected");
  Check(u::InstalledVersion(arguments[2])==manifest.version,"installer resource version matches release");
  std::cout<<"UPDATE_SECURITY_TESTS_PASSED\n";return 0;
 }catch(const std::exception& error){std::cerr<<"FAIL "<<error.what()<<"\n";return 1;}
}
