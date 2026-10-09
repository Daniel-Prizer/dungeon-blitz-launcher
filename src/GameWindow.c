#define WIN32_LEAN_AND_MEAN
#define NAPI_VERSION 3
#include <windows.h>
#include <commctrl.h>
#include <node_api.h>
#include <stdint.h>
#include <string.h>

// Runs in the trusted legacy main process, on its window thread. Never hooks
// another process, forwards input, or changes the system cursor/taskbar.
static HWND game;
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

static LRESULT CALLBACK game_proc(HWND hwnd, UINT message, WPARAM w, LPARAM l,
                                 UINT_PTR id, DWORD_PTR data) {
  if (message == WM_NCHITTEST) {
    RECT rect;
    POINT point = {(short)LOWORD(l), (short)HIWORD(l)};
    if (GetWindowRect(hwnd, &rect) && PtInRect(&rect, point)) return HTCLIENT;
  }
  if (message == WM_SYSCOMMAND && ((w & 0xFFF0) == SC_MOVE || (w & 0xFFF0) == SC_SIZE)) return 0;
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
  napi_get_boolean_ptr(env, true, &result);
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
  napi_value function;
  if (napi_add_env_cleanup_hook_ptr(env, cleanup, NULL) != napi_ok ||
      napi_create_function_ptr(env, "attach", NAPI_AUTO_LENGTH, attach, NULL, &function) != napi_ok ||
      napi_set_named_property_ptr(env, exports, "attach", function) != napi_ok)
    return fail(env, "Could not initialize game input boundary.");
  return exports;
}
