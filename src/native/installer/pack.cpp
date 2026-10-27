#define _WIN32_WINNT 0x0A00
#include <windows.h>
#include <compressapi.h>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>
#include <string>
#include <cstdint>

namespace fs = std::filesystem;
void Append32(std::vector<unsigned char>& bytes, uint32_t value) {
  for (int index = 0; index < 4; ++index) bytes.push_back(static_cast<unsigned char>((value >> (index * 8)) & 255));
}
std::string Utf8(const std::wstring& value) {
  int size = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  std::string output(size, 0);
  WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), output.data(), size, nullptr, nullptr);
  return output;
}
int wmain(int count, wchar_t** arguments) {
  if (count != 3) return 1;
  const fs::path root = fs::absolute(arguments[1]);
  std::vector<unsigned char> archive;
  for (const auto& entry : fs::recursive_directory_iterator(root)) {
    if (!entry.is_regular_file()) continue;
    const auto relative = Utf8(fs::relative(entry.path(), root).generic_wstring());
    std::ifstream stream(entry.path(), std::ios::binary);
    std::vector<unsigned char> contents((std::istreambuf_iterator<char>(stream)), {});
    Append32(archive, static_cast<uint32_t>(relative.size()));
    Append32(archive, static_cast<uint32_t>(contents.size()));
    archive.insert(archive.end(), relative.begin(), relative.end());
    archive.insert(archive.end(), contents.begin(), contents.end());
  }
  Append32(archive, 0);
  Append32(archive, 0);
  COMPRESSOR_HANDLE compressor = nullptr;
  if (!CreateCompressor(COMPRESS_ALGORITHM_XPRESS_HUFF, nullptr, &compressor)) return 2;
  SIZE_T compressedSize = 0;
  Compress(compressor, archive.data(), archive.size(), nullptr, 0, &compressedSize);
  std::vector<unsigned char> compressed(compressedSize);
  if (!Compress(compressor, archive.data(), archive.size(), compressed.data(), compressed.size(), &compressedSize)) return 3;
  CloseCompressor(compressor);
  std::ofstream output(fs::path(arguments[2]), std::ios::binary | std::ios::trunc);
  const uint32_t originalSize = static_cast<uint32_t>(archive.size());
  output.write("NAD1", 4);
  output.write(reinterpret_cast<const char*>(&originalSize), 4);
  output.write(reinterpret_cast<const char*>(compressed.data()), compressedSize);
  std::cout << "Payload: " << archive.size() << " -> " << compressedSize << " bytes\n";
  return output.good() ? 0 : 4;
}
