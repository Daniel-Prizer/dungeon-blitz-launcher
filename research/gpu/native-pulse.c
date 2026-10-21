// Isolated research clock: one private high-resolution waitable timer/thread,
// one pending JS notification. No global timer or process setting changes.
#define WIN32_LEAN_AND_MEAN
#undef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#define NAPI_VERSION 4
#include <windows.h>
#include <node_api.h>
#include <stdlib.h>
#include <math.h>
#define DECLARE(name) static __typeof__(&name) name##_ptr
DECLARE(napi_get_cb_info);DECLARE(napi_get_value_double);DECLARE(napi_throw_error);
DECLARE(napi_create_double);DECLARE(napi_create_string_utf8);DECLARE(napi_create_function);
DECLARE(napi_set_named_property);DECLARE(napi_create_threadsafe_function);
DECLARE(napi_call_threadsafe_function);DECLARE(napi_release_threadsafe_function);
DECLARE(napi_get_undefined);DECLARE(napi_call_function);DECLARE(napi_typeof);
typedef struct { HANDLE stop,timer,thread; napi_threadsafe_function callback; double period; LARGE_INTEGER start,freq; volatile LONG queued; } Pulse;
static Pulse *volatile active=NULL;
static void call_js(napi_env env,napi_value fn,void *context,void *data){
 Pulse *p=context;InterlockedExchange(&p->queued,0);if(!env||!fn||WaitForSingleObject(p->stop,0)==WAIT_OBJECT_0)return;
 LARGE_INTEGER now;QueryPerformanceCounter(&now);napi_value value,receiver;
 napi_create_double_ptr(env,(double)(now.QuadPart-p->start.QuadPart)*1000.0/p->freq.QuadPart,&value);
 napi_get_undefined_ptr(env,&receiver);napi_call_function_ptr(env,receiver,fn,1,&value,NULL);
}
static DWORD WINAPI loop(void *data){Pulse *p=data;double next=p->period;
 while(1){LARGE_INTEGER now,due;QueryPerformanceCounter(&now);double elapsed=(double)(now.QuadPart-p->start.QuadPart)*1000.0/p->freq.QuadPart;
  // Every research stream expires without trusting the caller to stop it.
  if(elapsed>60000)break;double remaining=next-elapsed;if(remaining<=0)remaining=0.05;due.QuadPart=-(LONGLONG)ceil(remaining*10000.0);
  if(!SetWaitableTimerEx(p->timer,&due,0,NULL,NULL,NULL,0))break;HANDLE handles[2]={p->stop,p->timer};DWORD result=WaitForMultipleObjects(2,handles,FALSE,1500);if(result!=WAIT_OBJECT_0+1)break;
  if(!InterlockedCompareExchange(&p->queued,1,0)){napi_status status=napi_call_threadsafe_function_ptr(p->callback,NULL,napi_tsfn_nonblocking);if(status!=napi_ok)InterlockedExchange(&p->queued,0);if(status==napi_closing)break;}
  QueryPerformanceCounter(&now);elapsed=(double)(now.QuadPart-p->start.QuadPart)*1000.0/p->freq.QuadPart;next=fmax(next+p->period,elapsed+p->period);
 }
 CancelWaitableTimer(p->timer);napi_release_threadsafe_function_ptr(p->callback,napi_tsfn_release);return 0;
}
static void finalize(napi_env env,void *data,void *hint){Pulse *p=data;SetEvent(p->stop);WaitForSingleObject(p->thread,2000);CloseHandle(p->thread);CloseHandle(p->timer);CloseHandle(p->stop);InterlockedCompareExchangePointer((PVOID volatile*)&active,NULL,p);free(p);}
static napi_value start(napi_env env,napi_callback_info info){size_t count=2;napi_value args[2],name,result;double period;napi_valuetype type;
 if(napi_get_cb_info_ptr(env,info,&count,args,NULL,NULL)!=napi_ok||count!=2||napi_get_value_double_ptr(env,args[0],&period)!=napi_ok||!isfinite(period)||period<0.5||period>1000||napi_typeof_ptr(env,args[1],&type)!=napi_ok||type!=napi_function||active){napi_throw_error_ptr(env,NULL,"Invalid or concurrent private clock stream");return NULL;}
 Pulse *p=calloc(1,sizeof(Pulse));if(!p){napi_throw_error_ptr(env,NULL,"Private clock allocation failed");return NULL;}p->period=period;p->stop=CreateEventW(NULL,TRUE,FALSE,NULL);p->timer=CreateWaitableTimerExW(NULL,NULL,2,TIMER_MODIFY_STATE|SYNCHRONIZE);
 if(!p->stop||!p->timer){if(p->stop)CloseHandle(p->stop);if(p->timer)CloseHandle(p->timer);free(p);napi_throw_error_ptr(env,NULL,"Private high-resolution timer unavailable");return NULL;}
 QueryPerformanceFrequency(&p->freq);QueryPerformanceCounter(&p->start);napi_create_string_utf8_ptr(env,"private-render-pulse",NAPI_AUTO_LENGTH,&name);
 if(napi_create_threadsafe_function_ptr(env,args[1],NULL,name,1,1,p,finalize,p,call_js,&p->callback)!=napi_ok){CloseHandle(p->timer);CloseHandle(p->stop);free(p);return NULL;}active=p;p->thread=CreateThread(NULL,0,loop,p,0,NULL);
 if(!p->thread){SetEvent(p->stop);napi_release_threadsafe_function_ptr(p->callback,napi_tsfn_abort);napi_throw_error_ptr(env,NULL,"Private clock thread unavailable");return NULL;}napi_get_undefined_ptr(env,&result);return result;
}
static napi_value stop(napi_env env,napi_callback_info info){if(active)SetEvent(active->stop);napi_value result;napi_get_undefined_ptr(env,&result);return result;}
__declspec(dllexport) napi_value napi_register_module_v1(napi_env env,napi_value exports){HMODULE host=GetModuleHandleW(NULL);
#define LOAD(name) name##_ptr=(__typeof__(&name))GetProcAddress(host,#name);if(!name##_ptr)return NULL
 LOAD(napi_get_cb_info);LOAD(napi_get_value_double);LOAD(napi_throw_error);LOAD(napi_create_double);LOAD(napi_create_string_utf8);LOAD(napi_create_function);LOAD(napi_set_named_property);LOAD(napi_create_threadsafe_function);LOAD(napi_call_threadsafe_function);LOAD(napi_release_threadsafe_function);LOAD(napi_get_undefined);LOAD(napi_call_function);LOAD(napi_typeof);
 napi_value fn;napi_create_function_ptr(env,"start",NAPI_AUTO_LENGTH,start,NULL,&fn);napi_set_named_property_ptr(env,exports,"start",fn);napi_create_function_ptr(env,"stop",NAPI_AUTO_LENGTH,stop,NULL,&fn);napi_set_named_property_ptr(env,exports,"stop",fn);return exports;
}
