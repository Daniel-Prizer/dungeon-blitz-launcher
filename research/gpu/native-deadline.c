// Research only: a private, one-shot Windows timer. No global timer resolution,
// priority, affinity, power, window, input, monitor or game state changes.
#define WIN32_LEAN_AND_MEAN
#undef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#define NAPI_VERSION 3
#include <windows.h>
#include <node_api.h>
#include <math.h>
#include <stdlib.h>
#define DECLARE(name) static __typeof__(&name) name##_ptr
DECLARE(napi_get_cb_info); DECLARE(napi_get_value_double);
DECLARE(napi_throw_error); DECLARE(napi_create_double);
DECLARE(napi_create_string_utf8); DECLARE(napi_create_error);
DECLARE(napi_create_promise); DECLARE(napi_resolve_deferred);
DECLARE(napi_reject_deferred); DECLARE(napi_create_async_work);
DECLARE(napi_queue_async_work); DECLARE(napi_delete_async_work);
DECLARE(napi_create_function); DECLARE(napi_set_named_property);
typedef struct { napi_async_work work; napi_deferred deferred; double ms,elapsed; DWORD failure; } Wait;
static LONG pending=0;
static void execute(napi_env env, void *data) {
  Wait *w=data; LARGE_INTEGER start,end,freq,due;
  QueryPerformanceFrequency(&freq); QueryPerformanceCounter(&start);
  HANDLE timer=CreateWaitableTimerExW(NULL,NULL,0x00000002,TIMER_MODIFY_STATE|SYNCHRONIZE);
  if(!timer){w->failure=GetLastError();return;}
  due.QuadPart=-(LONGLONG)ceil(w->ms*10000.0);
  if(!SetWaitableTimerEx(timer,&due,0,NULL,NULL,NULL,0))w->failure=GetLastError();
  else if(WaitForSingleObject(timer,1500)!=WAIT_OBJECT_0)w->failure=ERROR_TIMEOUT;
  CancelWaitableTimer(timer); CloseHandle(timer);
  QueryPerformanceCounter(&end);w->elapsed=(double)(end.QuadPart-start.QuadPart)*1000.0/(double)freq.QuadPart;
}
static void complete(napi_env env,napi_status status,void *data){
  Wait *w=data;napi_value value;
  InterlockedExchange(&pending,0);
  if(status!=napi_ok||w->failure){
    napi_value text;napi_create_string_utf8_ptr(env,"Private high-resolution deadline failed",NAPI_AUTO_LENGTH,&text);
    napi_create_error_ptr(env,NULL,text,&value);napi_reject_deferred_ptr(env,w->deferred,value);
  }else{napi_create_double_ptr(env,w->elapsed,&value);napi_resolve_deferred_ptr(env,w->deferred,value);}
  napi_delete_async_work_ptr(env,w->work);free(w);
}
static napi_value wait_for(napi_env env,napi_callback_info info){
  size_t count=1;napi_value arg,promise,name;double ms;
  if(napi_get_cb_info_ptr(env,info,&count,&arg,NULL,NULL)!=napi_ok||count!=1||napi_get_value_double_ptr(env,arg,&ms)!=napi_ok||!isfinite(ms)||ms<=0||ms>1000){napi_throw_error_ptr(env,NULL,"Deadline must be finite and in (0,1000] milliseconds");return NULL;}
  if(InterlockedCompareExchange(&pending,1,0)){napi_throw_error_ptr(env,NULL,"Only one deadline may be pending");return NULL;}
  Wait *w=calloc(1,sizeof(Wait));if(!w){InterlockedExchange(&pending,0);napi_throw_error_ptr(env,NULL,"Deadline allocation failed");return NULL;}w->ms=ms;
  if(napi_create_promise_ptr(env,&w->deferred,&promise)!=napi_ok){InterlockedExchange(&pending,0);free(w);return NULL;}
  napi_create_string_utf8_ptr(env,"private-render-deadline",NAPI_AUTO_LENGTH,&name);
  if(napi_create_async_work_ptr(env,NULL,name,execute,complete,w,&w->work)!=napi_ok){InterlockedExchange(&pending,0);free(w);napi_throw_error_ptr(env,NULL,"Deadline worker creation failed");return NULL;}
  if(napi_queue_async_work_ptr(env,w->work)!=napi_ok){napi_delete_async_work_ptr(env,w->work);InterlockedExchange(&pending,0);free(w);napi_throw_error_ptr(env,NULL,"Deadline worker queue failed");return NULL;}
  return promise;
}
__declspec(dllexport) napi_value napi_register_module_v1(napi_env env,napi_value exports){
  HMODULE host=GetModuleHandleW(NULL);
#define LOAD(name) name##_ptr=(__typeof__(&name))GetProcAddress(host,#name);if(!name##_ptr)return NULL
  LOAD(napi_get_cb_info);LOAD(napi_get_value_double);LOAD(napi_throw_error);LOAD(napi_create_double);
  LOAD(napi_create_string_utf8);LOAD(napi_create_error);LOAD(napi_create_promise);LOAD(napi_resolve_deferred);
  LOAD(napi_reject_deferred);LOAD(napi_create_async_work);LOAD(napi_queue_async_work);LOAD(napi_delete_async_work);
  LOAD(napi_create_function);LOAD(napi_set_named_property);
  napi_value fn;if(napi_create_function_ptr(env,"wait",NAPI_AUTO_LENGTH,wait_for,NULL,&fn)!=napi_ok||napi_set_named_property_ptr(env,exports,"wait",fn)!=napi_ok)return NULL;
  return exports;
}
