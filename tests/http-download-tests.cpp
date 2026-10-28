#define NADRAW_UPDATE_NETWORK_TESTS
#include "../src/native/common/update-common.h"
#include <iostream>
namespace u=nadraw_update;
void Check(bool value,const char* name){if(!value)throw std::runtime_error(name);std::cout<<"PASS "<<name<<"\n";}
template<class F> void Reject(F action,const char* name){bool failed=false;try{action();}catch(...){failed=true;}Check(failed,name);}
int wmain(int count,wchar_t** arguments){
 try{
  if(count!=2)throw std::runtime_error("expected loopback test server URL");
  const std::wstring base=arguments[1];
  if(base.rfind(L"http://127.0.0.1:",0)!=0)throw std::runtime_error("test server must be local");
  const auto manifest=u::VerifyManifest(u::Download(base+L"/nadraw/latest.json",128*1024));
  const auto bytes=u::Download(base+L"/nadraw/releases/NaDraw-Setup-1.0.28.exe",manifest.size);
  Check(bytes.size()==manifest.size&&u::Hex(u::Hash(bytes))==manifest.sha256,"HTTP release download with real signature and package hash");
  Reject([&]{u::Download(base+L"/missing",1024);},"HTTP 404 rejected");
  Reject([&]{u::Download(base+L"/redirect",1024);},"HTTP redirects rejected");
  Reject([&]{u::Download(base+L"/nadraw/latest.json",16);},"HTTP response size limit enforced");
  Reject([&]{u::VerifyManifest(u::Download(base+L"/tampered.json",128*1024));},"tampered HTTP release rejected");
  const auto truncated=u::Download(base+L"/truncated.exe",manifest.size);
  Check(truncated.size()!=manifest.size,"truncated HTTP package detected before installation");
  std::cout<<"HTTP_DOWNLOAD_TESTS_PASSED\n";return 0;
 }catch(const std::exception& error){std::cerr<<"FAIL "<<error.what()<<"\n";return 1;}
}
