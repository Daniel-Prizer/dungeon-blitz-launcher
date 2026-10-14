#define WIN32_LEAN_AND_MEAN
#define NAPI_VERSION 3
#include <windows.h>
#include <commctrl.h>
#include <node_api.h>
#include <stdint.h>
#include <string.h>

// Runs in the trusted legacy main process, on its window thread. Never hooks
// another process, forwards input, or changes system cursor definitions/taskbar.
static HWND game;
static HCURSOR crosshair;
static bool cursor_eligible = true, dry_run;
static DWORD owner_thread;
static const UINT_PTR subclass_id = 0xDB17;
#define DECLARE(name) static __typeof__(&name) name##_ptr
DECLARE(napi_get_cb_info);
DECLARE(napi_get_buffer_info);
DECLARE(napi_throw_error);
DECLARE(napi_get_boolean);
DECLARE(napi_create_function);
DECLARE(napi_set_named_property);
DECLARE(napi_add_env_cleanup_hook);
DECLARE(napi_get_value_uint32);
DECLARE(napi_get_value_bool);
DECLARE(napi_create_buffer_copy);

static bool foreground_game(void) {
  HWND active = GetForegroundWindow();
  return game && IsWindowVisible(game) && (active == game || IsChild(game, active));
}
static bool apply_cursor(void) {
  if (!crosshair || !cursor_eligible || !foreground_game()) return false;
  if (!dry_run) SetCursor(crosshair);
  return true;
}

static LRESULT CALLBACK game_proc(HWND hwnd, UINT message, WPARAM w, LPARAM l,
                                 UINT_PTR id, DWORD_PTR data) {
  if (message == WM_NCHITTEST) {
    RECT rect;
    POINT point = {(short)LOWORD(l), (short)HIWORD(l)};
    if (GetWindowRect(hwnd, &rect) && PtInRect(&rect, point)) return HTCLIENT;
  }
  if (message == WM_SYSCOMMAND && ((w & 0xFFF0) == SC_MOVE || (w & 0xFFF0) == SC_SIZE)) return 0;
  if (message == WM_SETCURSOR && LOWORD(l) == HTCLIENT && apply_cursor()) return TRUE;
  if (message == WM_NCDESTROY) {
    RemoveWindowSubclass(hwnd, game_proc, id);
    if (game == hwnd) game = NULL;
  }
  return DefSubclassProc(hwnd, message, w, l);
}

static void cleanup(void *data) {
  if (owner_thread != GetCurrentThreadId()) return;
  if (game && IsWindow(game)) RemoveWindowSubclass(game, game_proc, subclass_id);
  game = NULL;
  if (crosshair) { DestroyCursor(crosshair); crosshair = NULL; }
}

static napi_value fail(napi_env env, const char *message) {
  napi_throw_error_ptr(env, NULL, message);
  return NULL;
}

static napi_value attach(napi_env env, napi_callback_info info) {
  size_t count = 1, length = 0;
  napi_value argument, result;
  void *bytes;
  if (napi_get_cb_info_ptr(env, info, &count, &argument, NULL, NULL) != napi_ok || count != 1 ||
      napi_get_buffer_info_ptr(env, argument, &bytes, &length) != napi_ok || length != sizeof(HWND))
    return fail(env, "Expected one native game window handle.");
  HWND hwnd;
  memcpy(&hwnd, bytes, sizeof(hwnd));
  DWORD pid = 0, thread = GetWindowThreadProcessId(hwnd, &pid);
  if (!IsWindow(hwnd) || pid != GetCurrentProcessId() || thread != GetCurrentThreadId() || (game && game != hwnd))
    return fail(env, "Only this game process's own window thread may attach.");
  if (!game && !SetWindowSubclass(hwnd, game_proc, subclass_id, 0))
    return fail(env, "Could not install game input boundary.");
  game = hwnd;
  owner_thread = thread;
  wchar_t flag[2];
  dry_run = GetEnvironmentVariableW(L"BLITZ_HOST_TEST", flag, 2) == 1 && flag[0] == L'1';
  napi_get_boolean_ptr(env, true, &result);
  return result;
}

static napi_value configure_cursor(napi_env env, napi_callback_info info) {
  size_t count = 2, length = 0;
  napi_value args[2], result;
  void *bytes; uint32_t size = 0;
  if (!game || owner_thread != GetCurrentThreadId() ||
      napi_get_cb_info_ptr(env, info, &count, args, NULL, NULL) != napi_ok || count != 2 ||
      napi_get_buffer_info_ptr(env, args[0], &bytes, &length) != napi_ok ||
      napi_get_value_uint32_ptr(env, args[1], &size) != napi_ok ||
      (size == 0 ? length != 0 : (size < 9 || size > 145 || !(size & 1) || length != size * size * 4)))
    return fail(env, "Invalid bounded game cursor artwork.");
  HCURSOR next = NULL;
  if (size) {
    BITMAPINFO bitmap; memset(&bitmap, 0, sizeof(bitmap));
    bitmap.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bitmap.bmiHeader.biWidth = size; bitmap.bmiHeader.biHeight = -(LONG)size;
    bitmap.bmiHeader.biPlanes = 1; bitmap.bmiHeader.biBitCount = 32;
    bitmap.bmiHeader.biCompression = BI_RGB;
    void *target;
    HBITMAP color = CreateDIBSection(NULL, &bitmap, DIB_RGB_COLORS, &target, NULL, 0);
    unsigned char mask_bits[20 * 145]; memset(mask_bits, 255, sizeof(mask_bits));
    uint32_t stride = ((size + 15) / 16) * 2;
    const unsigned char *source = bytes;
    for (uint32_t y = 0; y < size; y++) for (uint32_t x = 0; x < size; x++)
      if (source[(y * size + x) * 4 + 3]) mask_bits[y * stride + x / 8] &= ~(128 >> (x % 8));
    HBITMAP mask = CreateBitmap(size, size, 1, 1, mask_bits);
    if (color && mask) {
      unsigned char *dest = target;
      for (uint32_t i = 0; i < size * size; i++) {
        dest[4*i] = source[4*i+2]; dest[4*i+1] = source[4*i+1];
        dest[4*i+2] = source[4*i]; dest[4*i+3] = source[4*i+3];
      }
      ICONINFO icon = {0}; icon.fIcon = FALSE; icon.xHotspot = icon.yHotspot = size / 2;
      icon.hbmColor = color; icon.hbmMask = mask;
      next = CreateIconIndirect(&icon);
    }
    if (color) DeleteObject(color); if (mask) DeleteObject(mask);
    if (!next) return fail(env, "Could not create game crosshair.");
  }
  HCURSOR old = crosshair; crosshair = next;
  // SetCursor is transient and belongs to this game's foreground window only.
  // Tests create/read cursor artwork but never change the shared OS pointer.
  if (!dry_run && foreground_game() && GetCursor() == old && old)
    SetCursor(next ? next : LoadCursor(NULL, IDC_ARROW));
  if (old) DestroyCursor(old);
  napi_get_boolean_ptr(env, true, &result); return result;
}

static napi_value cursor_type(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value arg, result; bool allowed;
  if (owner_thread != GetCurrentThreadId() ||
      napi_get_cb_info_ptr(env, info, &count, &arg, NULL, NULL) != napi_ok || count != 1 ||
      napi_get_value_bool_ptr(env, arg, &allowed) != napi_ok)
    return fail(env, "Expected a game cursor policy.");
  cursor_eligible = allowed;
  napi_get_boolean_ptr(env, apply_cursor(), &result); return result;
}

// Test-only readback of the actual Win32 cursor bitmap, never a desktop capture.
static napi_value cursor_pixels(napi_env env, napi_callback_info info) {
  if (!dry_run) return fail(env, "Cursor readback is test-only.");
  napi_value result; unsigned char pixels[145 * 145 * 4]; size_t length = 0;
  ICONINFO icon;
  if (crosshair && GetIconInfo(crosshair, &icon)) {
    BITMAP info; memset(&info, 0, sizeof(info)); GetObject(icon.hbmColor, sizeof(info), &info);
    if (info.bmWidth > 0 && info.bmWidth <= 145 && info.bmHeight == info.bmWidth &&
        icon.xHotspot == (DWORD)info.bmWidth / 2 && icon.yHotspot == icon.xHotspot) {
      BITMAPINFO bitmap; memset(&bitmap, 0, sizeof(bitmap));
      bitmap.bmiHeader.biSize = sizeof(BITMAPINFOHEADER); bitmap.bmiHeader.biWidth = info.bmWidth;
      bitmap.bmiHeader.biHeight = -info.bmHeight; bitmap.bmiHeader.biPlanes = 1;
      bitmap.bmiHeader.biBitCount = 32; bitmap.bmiHeader.biCompression = BI_RGB;
      HDC dc = GetDC(NULL);
      if (GetDIBits(dc, icon.hbmColor, 0, info.bmHeight, pixels, &bitmap, DIB_RGB_COLORS))
        length = info.bmWidth * info.bmHeight * 4;
      ReleaseDC(NULL, dc);
    }
    DeleteObject(icon.hbmColor); DeleteObject(icon.hbmMask);
  }
  napi_create_buffer_copy_ptr(env, length, pixels, NULL, &result); return result;
}

static napi_value cursor_active(napi_env env, napi_callback_info info) {
  if (!dry_run) return fail(env, "Cursor readback is test-only.");
  napi_value result;
  napi_get_boolean_ptr(env, crosshair && cursor_eligible && foreground_game(), &result);
  return result;
}
static napi_value cursor_policy(napi_env env, napi_callback_info info) {
  if (!dry_run) return fail(env, "Cursor readback is test-only.");
  napi_value result;
  napi_get_boolean_ptr(env, crosshair && cursor_eligible, &result);
  return result;
}

// Resolve the small stable Node-API surface from the running Electron executable;
// no dependency on a different Node/Electron import library or C++ ABI.
__declspec(dllexport) napi_value napi_register_module_v1(napi_env env, napi_value exports) {
  HMODULE executable = GetModuleHandleW(NULL);
#define LOAD(name) name##_ptr = (__typeof__(&name))GetProcAddress(executable, #name); if (!name##_ptr) return NULL
  LOAD(napi_get_cb_info); LOAD(napi_get_buffer_info); LOAD(napi_throw_error);
  LOAD(napi_get_boolean); LOAD(napi_create_function); LOAD(napi_set_named_property);
  LOAD(napi_add_env_cleanup_hook);
  LOAD(napi_get_value_uint32); LOAD(napi_get_value_bool); LOAD(napi_create_buffer_copy);
  napi_value function;
  if (napi_add_env_cleanup_hook_ptr(env, cleanup, NULL) != napi_ok ||
      napi_create_function_ptr(env, "attach", NAPI_AUTO_LENGTH, attach, NULL, &function) != napi_ok ||
      napi_set_named_property_ptr(env, exports, "attach", function) != napi_ok)
    return fail(env, "Could not initialize game input boundary.");
  const char *names[] = {"crosshair", "cursorType", "cursorPixels", "cursorActive", "cursorPolicy"};
  napi_callback methods[] = {configure_cursor, cursor_type, cursor_pixels, cursor_active, cursor_policy};
  for (int i = 0; i < 5; i++) {
    if (napi_create_function_ptr(env, names[i], NAPI_AUTO_LENGTH, methods[i], NULL, &function) != napi_ok ||
        napi_set_named_property_ptr(env, exports, names[i], function) != napi_ok)
      return fail(env, "Could not initialize game cursor.");
  }
  return exports;
}
