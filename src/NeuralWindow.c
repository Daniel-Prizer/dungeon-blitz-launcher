#define WIN32_LEAN_AND_MEAN
#define COBJMACROS
#define NAPI_VERSION 3
#include <windows.h>
#include <commctrl.h>
#include <d3d11.h>
#include <d3dcompiler.h>
#include <node_api.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Local presentation only. The game keeps the original input/focus HWND and
// native coordinates. No desktop capture, input injection, hooks or sockets.
static HWND game, overlay;
static DWORD thread;
static ID3D11Device *device;
static ID3D11DeviceContext *context;
static IDXGISwapChain *swap;
static ID3D11ComputeShader *cs[6];
static ID3D11ComputeShader *normalize;
static ID3D11VertexShader *vs;
static ID3D11PixelShader *ps;
static ID3D11SamplerState *pointSampler,*linearSampler;
static ID3D11Buffer *sizes;
static ID3D11Texture2D *textures[11],*backbuffer,*presented;
static ID3D11ShaderResourceView *srv[11];
static ID3D11UnorderedAccessView *uav[11];
static ID3D11RenderTargetView *rt;
static ID3D11Query *complete;
static ID3D11Query *gpu_start,*gpu_end,*gpu_disjoint;
static int width,height,shown,initialized,pending;
static int source_width,source_height;
static int compare;
static unsigned long frames,dropped,presentation_dropped;
static LARGE_INTEGER frequency;
static double submit_ms;
static double gpu_ms=-1;
static char adapter_name[160];
static LRESULT CALLBACK game_proc(HWND,UINT,WPARAM,LPARAM,UINT_PTR,DWORD_PTR);
#define DECLARE(name) static __typeof__(&name) name##_ptr
DECLARE(napi_get_cb_info); DECLARE(napi_get_buffer_info); DECLARE(napi_throw_error);
DECLARE(napi_get_boolean); DECLARE(napi_create_function); DECLARE(napi_set_named_property);
DECLARE(napi_add_env_cleanup_hook); DECLARE(napi_get_element); DECLARE(napi_get_value_string_utf8);
DECLARE(napi_get_value_int32); DECLARE(napi_create_string_utf8); DECLARE(napi_create_buffer_copy);
DECLARE(napi_is_array); DECLARE(napi_get_array_length);

#define RELEASE(p) do {if(p){IUnknown_Release((IUnknown *)(p));(p)=NULL;}}while(0)
static void release_images(void){
 for(int i=0;i<11;i++){RELEASE(uav[i]);RELEASE(srv[i]);RELEASE(textures[i]);}
 RELEASE(rt);RELEASE(backbuffer);RELEASE(presented);width=height=source_width=source_height=0;
}
static void stop(void){
 if(game&&IsWindow(game)&&GetCurrentThreadId()==thread)RemoveWindowSubclass(game,game_proc,0xDB18);
 if(context){ID3D11DeviceContext_ClearState(context);ID3D11DeviceContext_Flush(context);}
 if(overlay)DestroyWindow(overlay);overlay=NULL;
 release_images();for(int i=0;i<6;i++)RELEASE(cs[i]);RELEASE(normalize);RELEASE(vs);RELEASE(ps);
 RELEASE(pointSampler);RELEASE(linearSampler);RELEASE(sizes);RELEASE(complete);RELEASE(gpu_start);RELEASE(gpu_end);RELEASE(gpu_disjoint);
 RELEASE(swap);RELEASE(context);RELEASE(device);game=NULL;initialized=shown=pending=0;
}
static void position(void){
 if(!overlay||!game||!IsWindow(game))return;
 RECT r;GetClientRect(game,&r);POINT p={0,0};ClientToScreen(game,&p);
 HWND previous=GetWindow(game,GW_HWNDPREV);
 SetWindowPos(overlay,previous,p.x,p.y,r.right,r.bottom,SWP_NOACTIVATE|SWP_NOOWNERZORDER|(previous==overlay?SWP_NOZORDER:0));
 if(shown&&IsWindowVisible(game))ShowWindow(overlay,SW_SHOWNOACTIVATE);else ShowWindow(overlay,SW_HIDE);
}
static LRESULT CALLBACK overlay_proc(HWND w,UINT m,WPARAM a,LPARAM b){
 if(m==WM_NCHITTEST)return HTTRANSPARENT;
 if(m==WM_MOUSEACTIVATE)return MA_NOACTIVATE;
 if(m==WM_ERASEBKGND)return 1;
 return DefWindowProcW(w,m,a,b);
}
static LRESULT CALLBACK game_proc(HWND w,UINT m,WPARAM a,LPARAM b,UINT_PTR id,DWORD_PTR data){
 LRESULT result=DefSubclassProc(w,m,a,b);
 if(m==WM_WINDOWPOSCHANGED||m==WM_SHOWWINDOW)position();
 if(m==WM_NCDESTROY){RemoveWindowSubclass(w,game_proc,id);game=NULL;if(overlay){DestroyWindow(overlay);overlay=NULL;}shown=0;}
 return result;
}
static napi_value fail(napi_env env,const char *message){napi_throw_error_ptr(env,NULL,message);return NULL;}
static napi_value boolValue(napi_env env,int value){napi_value r;napi_get_boolean_ptr(env,value!=0,&r);return r;}
static char* string(napi_env env,napi_value value){
 size_t n=0;if(napi_get_value_string_utf8_ptr(env,value,NULL,0,&n)!=napi_ok||n>100000)return NULL;
 char *s=calloc(n+1,1);if(!s)return NULL;
 if(napi_get_value_string_utf8_ptr(env,value,s,n+1,&n)!=napi_ok){free(s);return NULL;}return s;
}
static HRESULT compile(const char *source,const char *entry,const char *profile,ID3DBlob **blob){
 ID3DBlob *errors=NULL;HRESULT result=D3DCompile(source,strlen(source),"launcher-neural",NULL,NULL,entry,profile,D3DCOMPILE_OPTIMIZATION_LEVEL3,0,blob,&errors);
 if(FAILED(result)&&errors)fprintf(stderr,"Neural shader: %s\n",(char*)ID3D10Blob_GetBufferPointer(errors));
 RELEASE(errors);return result;
}
static int create_texture(int i,int w,int h,DXGI_FORMAT format,int output){
 D3D11_TEXTURE2D_DESC d={0};d.Width=w;d.Height=h;d.MipLevels=1;d.ArraySize=1;d.Format=format;d.SampleDesc.Count=1;
 d.Usage=D3D11_USAGE_DEFAULT;d.BindFlags=D3D11_BIND_SHADER_RESOURCE|(output?D3D11_BIND_UNORDERED_ACCESS:0);
 if(FAILED(ID3D11Device_CreateTexture2D(device,&d,NULL,&textures[i])))return 0;
 if(FAILED(ID3D11Device_CreateShaderResourceView(device,(ID3D11Resource *)textures[i],NULL,&srv[i])))return 0;
 return !output||SUCCEEDED(ID3D11Device_CreateUnorderedAccessView(device,(ID3D11Resource *)textures[i],NULL,&uav[i]));
}
static int resize(int sw,int sh){
 int w=sw,h=sh;
 if(source_width==sw&&source_height==sh)return 1;
 ID3D11DeviceContext_ClearState(context);release_images();
 // Electron 11 subscriptions are RGBA; capturePage on Windows is BGRA.
 // Normalize on GPU into one RGB interpretation before learned processing.
 if(!create_texture(10,sw,sh,DXGI_FORMAT_R8G8B8A8_UNORM,0))return 0;
 if(!create_texture(0,sw,sh,DXGI_FORMAT_R8G8B8A8_UNORM,1))return 0;
 for(int i=1;i<9;i++)if(!create_texture(i,w,h,DXGI_FORMAT_R8G8B8A8_UNORM,1))return 0;
 if(!create_texture(9,w*2,h*2,DXGI_FORMAT_R8G8B8A8_UNORM,1))return 0;
 // Present at actual window resolution. Do the final fit explicitly on GPU,
 // rather than relying on Windows to resize a larger swapchain implicitly.
 if(FAILED(IDXGISwapChain_ResizeBuffers(swap,2,w,h,DXGI_FORMAT_B8G8R8A8_UNORM,0)))return 0;
 if(FAILED(IDXGISwapChain_GetBuffer(swap,0,&IID_ID3D11Texture2D,(void **)&backbuffer)))return 0;
 if(FAILED(ID3D11Device_CreateRenderTargetView(device,(ID3D11Resource*)backbuffer,NULL,&rt)))return 0;
 if(getenv("BLITZ_HOST_TEST")&&strcmp(getenv("BLITZ_HOST_TEST"),"1")==0){
  D3D11_TEXTURE2D_DESC desc;ID3D11Texture2D_GetDesc(backbuffer,&desc);desc.BindFlags=0;
  if(FAILED(ID3D11Device_CreateTexture2D(device,&desc,NULL,&presented)))return 0;
 }
 width=w;height=h;source_width=sw;source_height=sh;return 1;
}
static napi_value start(napi_env env,napi_callback_info info){
 size_t count=2,length=0;napi_value args[2];void *bytes;
 if(napi_get_cb_info_ptr(env,info,&count,args,NULL,NULL)!=napi_ok||count!=2||napi_get_buffer_info_ptr(env,args[0],&bytes,&length)!=napi_ok||length!=sizeof(HWND))return fail(env,"Invalid neural window arguments.");
 HWND hwnd;memcpy(&hwnd,bytes,sizeof(hwnd));DWORD pid=0,t=GetWindowThreadProcessId(hwnd,&pid);
 if(!IsWindow(hwnd)||pid!=GetCurrentProcessId()||t!=GetCurrentThreadId())return fail(env,"Neural presentation requires our own game window thread.");
 bool array=false;uint32_t passes=0;
 if(napi_is_array_ptr(env,args[1],&array)!=napi_ok||!array||napi_get_array_length_ptr(env,args[1],&passes)!=napi_ok||passes!=6)return fail(env,"Neural model requires six shader passes.");
 stop();game=hwnd;thread=t;compare=0;frames=dropped=presentation_dropped=0;submit_ms=0;gpu_ms=-1;adapter_name[0]=0;QueryPerformanceFrequency(&frequency);
 WNDCLASSEXW wc={0};wc.cbSize=sizeof(wc);wc.lpfnWndProc=overlay_proc;wc.hInstance=GetModuleHandle(NULL);wc.lpszClassName=L"BlitzNeuralPresentation";RegisterClassExW(&wc);
 overlay=CreateWindowExW(WS_EX_TOOLWINDOW|WS_EX_NOACTIVATE|WS_EX_TRANSPARENT,wc.lpszClassName,L"Dungeon Blitz neural presentation",WS_POPUP,0,0,1,1,game,NULL,wc.hInstance,NULL);
 if(!overlay){stop();return fail(env,"Could not create neural presentation surface.");}
 DXGI_SWAP_CHAIN_DESC sd={0};sd.BufferDesc.Width=2;sd.BufferDesc.Height=2;sd.BufferDesc.Format=DXGI_FORMAT_B8G8R8A8_UNORM;sd.SampleDesc.Count=1;sd.BufferUsage=DXGI_USAGE_RENDER_TARGET_OUTPUT;sd.BufferCount=2;sd.OutputWindow=overlay;sd.Windowed=TRUE;sd.SwapEffect=DXGI_SWAP_EFFECT_DISCARD;
 D3D_FEATURE_LEVEL levels[]={D3D_FEATURE_LEVEL_11_0},level;
 HRESULT result=D3D11CreateDeviceAndSwapChain(NULL,D3D_DRIVER_TYPE_HARDWARE,NULL,D3D11_CREATE_DEVICE_BGRA_SUPPORT,levels,1,D3D11_SDK_VERSION,&sd,&swap,&device,&level,&context);
 if(FAILED(result)){stop();return fail(env,"Direct3D 11 neural presentation is unavailable.");}
 IDXGIDevice *gd=NULL;IDXGIAdapter *ga=NULL;DXGI_ADAPTER_DESC desc;
 if(SUCCEEDED(ID3D11Device_QueryInterface(device,&IID_IDXGIDevice,(void **)&gd))&&SUCCEEDED(IDXGIDevice_GetAdapter(gd,&ga))&&SUCCEEDED(IDXGIAdapter_GetDesc(ga,&desc))){
  WideCharToMultiByte(CP_UTF8,0,desc.Description,-1,adapter_name,sizeof(adapter_name),NULL,NULL);
  for(char *p=adapter_name;*p;p++)if(*p=='"'||*p=='\\'||(unsigned char)*p<32)*p=' ';
 }RELEASE(ga);RELEASE(gd);
 IDXGIDevice1 *dxgi=NULL;if(SUCCEEDED(ID3D11Device_QueryInterface(device,&IID_IDXGIDevice1,(void **)&dxgi))){IDXGIDevice1_SetMaximumFrameLatency(dxgi,1);RELEASE(dxgi);}
 for(int i=0;i<6;i++){
  napi_value arg;napi_get_element_ptr(env,args[1],i,&arg);char *source=string(env,arg);ID3DBlob *blob=NULL;
  if(!source||FAILED(compile(source,"CS","cs_5_0",&blob))){free(source);RELEASE(blob);stop();return fail(env,"Neural shader compilation failed.");}
  result=ID3D11Device_CreateComputeShader(device,ID3D10Blob_GetBufferPointer(blob),ID3D10Blob_GetBufferSize(blob),NULL,&cs[i]);free(source);RELEASE(blob);
  if(FAILED(result)){stop();return fail(env,"Neural compute shader could not start.");}
 }
 const char *draw="cbuffer Sizes:register(b0){uint2 inputSize;uint2 outputSize;uint compare;}Texture2D<float4> original:register(t0);Texture2D<float4> neural:register(t1);SamplerState sam:register(s0);struct V{float4 p:SV_Position;float2 uv:TEXCOORD;};V VS(uint i:SV_VertexID){V v;v.uv=float2((i<<1)&2,i&2);v.p=float4(v.uv*float2(2,-2)+float2(-1,1),0,1);return v;}float4 PS(V v):SV_Target{if(compare&&abs(v.uv.x-0.5)<1.0/inputSize.x)return float4(0.78,0.65,0.36,1);return float4(compare&&v.uv.x<0.5?original.SampleLevel(sam,v.uv,0).rgb:neural.SampleLevel(sam,v.uv,0).rgb,1);}";
 ID3DBlob *blob=NULL;
 const char *normalize_source="cbuffer Sizes:register(b0){uint2 inputSize;uint2 outputSize;uint compare;uint sourceRGBA;}Texture2D<float4> raw:register(t0);RWTexture2D<float4> rgb:register(u0);[numthreads(8,8,1)] void CS(uint3 p:SV_DispatchThreadID){if(any(p.xy>=inputSize))return;float4 c=raw[p.xy];rgb[p.xy]=sourceRGBA?c:c.bgra;}";
 if(FAILED(compile(normalize_source,"CS","cs_5_0",&blob))){stop();return fail(env,"Neural pixel normalization failed.");}
 result=ID3D11Device_CreateComputeShader(device,ID3D10Blob_GetBufferPointer(blob),ID3D10Blob_GetBufferSize(blob),NULL,&normalize);RELEASE(blob);
 if(FAILED(result)){stop();return fail(env,"Neural pixel normalization unavailable.");}
 if(FAILED(compile(draw,"VS","vs_5_0",&blob))){stop();return fail(env,"Neural display shader failed.");}
 result=ID3D11Device_CreateVertexShader(device,ID3D10Blob_GetBufferPointer(blob),ID3D10Blob_GetBufferSize(blob),NULL,&vs);RELEASE(blob);
 if(FAILED(result)||FAILED(compile(draw,"PS","ps_5_0",&blob))){stop();return fail(env,"Neural display shader failed.");}
 result=ID3D11Device_CreatePixelShader(device,ID3D10Blob_GetBufferPointer(blob),ID3D10Blob_GetBufferSize(blob),NULL,&ps);RELEASE(blob);
 if(FAILED(result)){stop();return fail(env,"Neural display shader failed.");}
 D3D11_SAMPLER_DESC sam={0};sam.Filter=D3D11_FILTER_MIN_MAG_MIP_POINT;sam.AddressU=sam.AddressV=sam.AddressW=D3D11_TEXTURE_ADDRESS_CLAMP;sam.MaxLOD=D3D11_FLOAT32_MAX;
 if(FAILED(ID3D11Device_CreateSamplerState(device,&sam,&pointSampler))){stop();return fail(env,"Neural sampling unavailable.");}
 sam.Filter=D3D11_FILTER_MIN_MAG_MIP_LINEAR;if(FAILED(ID3D11Device_CreateSamplerState(device,&sam,&linearSampler))){stop();return fail(env,"Neural sampling unavailable.");}
 D3D11_BUFFER_DESC bd={0};bd.ByteWidth=32;bd.Usage=D3D11_USAGE_DEFAULT;bd.BindFlags=D3D11_BIND_CONSTANT_BUFFER;
 if(FAILED(ID3D11Device_CreateBuffer(device,&bd,NULL,&sizes))){stop();return fail(env,"Neural constants unavailable.");}
 D3D11_QUERY_DESC qd={0};qd.Query=D3D11_QUERY_EVENT;if(FAILED(ID3D11Device_CreateQuery(device,&qd,&complete))){stop();return fail(env,"Neural queue unavailable.");}
 qd.Query=D3D11_QUERY_TIMESTAMP;if(FAILED(ID3D11Device_CreateQuery(device,&qd,&gpu_start))||FAILED(ID3D11Device_CreateQuery(device,&qd,&gpu_end))){stop();return fail(env,"Neural timing unavailable.");}
 qd.Query=D3D11_QUERY_TIMESTAMP_DISJOINT;if(FAILED(ID3D11Device_CreateQuery(device,&qd,&gpu_disjoint))){stop();return fail(env,"Neural timing unavailable.");}
 if(!SetWindowSubclass(game,game_proc,0xDB18,0)){stop();return fail(env,"Could not synchronize neural window.");}
 initialized=1;position();return boolValue(env,1);
}
static napi_value frame(napi_env env,napi_callback_info info){
 size_t count=4,length=0;napi_value args[4];void *bytes;int w=0,h=0,rgba=-1;
 if(napi_get_cb_info_ptr(env,info,&count,args,NULL,NULL)!=napi_ok||count!=4||napi_get_buffer_info_ptr(env,args[0],&bytes,&length)!=napi_ok||napi_get_value_int32_ptr(env,args[1],&w)!=napi_ok||napi_get_value_int32_ptr(env,args[2],&h)!=napi_ok||napi_get_value_int32_ptr(env,args[3],&rgba)!=napi_ok||(rgba!=0&&rgba!=1)||w<1||h<1||w>3840||h>2160||length!=(size_t)w*h*4)return fail(env,"Invalid neural frame.");
 if(!initialized||GetCurrentThreadId()!=thread)return boolValue(env,0);
 if(pending){BOOL done=FALSE;if(ID3D11DeviceContext_GetData(context,(ID3D11Asynchronous*)complete,&done,sizeof(done),D3D11_ASYNC_GETDATA_DONOTFLUSH)!=S_OK||!done){dropped++;return boolValue(env,0);}pending=0;
  D3D11_QUERY_DATA_TIMESTAMP_DISJOINT timing;UINT64 a=0,b=0;
  if(ID3D11DeviceContext_GetData(context,(ID3D11Asynchronous*)gpu_disjoint,&timing,sizeof(timing),D3D11_ASYNC_GETDATA_DONOTFLUSH)==S_OK&&!timing.Disjoint&&timing.Frequency&&ID3D11DeviceContext_GetData(context,(ID3D11Asynchronous*)gpu_start,&a,sizeof(a),D3D11_ASYNC_GETDATA_DONOTFLUSH)==S_OK&&ID3D11DeviceContext_GetData(context,(ID3D11Asynchronous*)gpu_end,&b,sizeof(b),D3D11_ASYNC_GETDATA_DONOTFLUSH)==S_OK)gpu_ms=(b-a)*1000.0/timing.Frequency;
 }
 LARGE_INTEGER begin,end;QueryPerformanceCounter(&begin);
 if(!resize(w,h)){shown=0;position();return fail(env,"Neural image allocation failed.");}
 unsigned constants[8]={(unsigned)w,(unsigned)h,(unsigned)w*2,(unsigned)h*2,(unsigned)compare,(unsigned)rgba,0,0};
 ID3D11DeviceContext_UpdateSubresource(context,(ID3D11Resource*)sizes,0,NULL,constants,0,0);
 ID3D11DeviceContext_Begin(context,(ID3D11Asynchronous*)gpu_disjoint);ID3D11DeviceContext_End(context,(ID3D11Asynchronous*)gpu_start);
 ID3D11DeviceContext_UpdateSubresource(context,(ID3D11Resource*)textures[10],0,NULL,bytes,w*4,0);
 w=width;h=height;
 ID3D11SamplerState *samplers[]={pointSampler,linearSampler};ID3D11DeviceContext_CSSetSamplers(context,0,2,samplers);ID3D11DeviceContext_CSSetConstantBuffers(context,0,1,&sizes);
 const int ins[6][5]={{0,-1,-1,-1,-1},{1,2,3,4,-1},{5,6,7,8,-1},{1,2,3,4,-1},{5,6,7,8,-1},{0,1,2,3,4}},outs[6][4]={{1,2,3,4},{5,6,7,8},{1,2,3,4},{5,6,7,8},{1,2,3,4},{9,-1,-1,-1}};
 ID3D11ShaderResourceView *clearSRV[5]={0};ID3D11UnorderedAccessView *clearUAV[4]={0};
 ID3D11DeviceContext_CSSetShader(context,normalize,NULL,0);ID3D11DeviceContext_CSSetShaderResources(context,0,1,&srv[10]);ID3D11DeviceContext_CSSetUnorderedAccessViews(context,0,1,&uav[0],NULL);ID3D11DeviceContext_Dispatch(context,(w+7)/8,(h+7)/8,1);
 ID3D11DeviceContext_CSSetShaderResources(context,0,5,clearSRV);ID3D11DeviceContext_CSSetUnorderedAccessViews(context,0,4,clearUAV,NULL);
 for(int i=0;i<6;i++){
  ID3D11ShaderResourceView *in[5]={0};ID3D11UnorderedAccessView *out[4]={0};int ni=0,no=0;
  for(int j=0;j<5&&ins[i][j]>=0;j++)in[ni++]=srv[ins[i][j]];
  for(int j=0;j<4&&outs[i][j]>=0;j++)out[no++]=uav[outs[i][j]];
  ID3D11DeviceContext_CSSetShader(context,cs[i],NULL,0);ID3D11DeviceContext_CSSetShaderResources(context,0,ni,in);ID3D11DeviceContext_CSSetUnorderedAccessViews(context,0,no,out,NULL);
  ID3D11DeviceContext_Dispatch(context,(w+7)/8,(h+7)/8,1);
  ID3D11DeviceContext_CSSetShaderResources(context,0,5,clearSRV);ID3D11DeviceContext_CSSetUnorderedAccessViews(context,0,4,clearUAV,NULL);
 }
 ID3D11DeviceContext_CSSetShader(context,NULL,NULL,0);
 D3D11_VIEWPORT vp={0};vp.Width=w;vp.Height=h;vp.MaxDepth=1;
 ID3D11DeviceContext_RSSetViewports(context,1,&vp);ID3D11DeviceContext_OMSetRenderTargets(context,1,&rt,NULL);
 ID3D11DeviceContext_IASetPrimitiveTopology(context,D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
 ID3D11ShaderResourceView *images[]={srv[0],srv[9]};
 ID3D11DeviceContext_VSSetShader(context,vs,NULL,0);ID3D11DeviceContext_PSSetShader(context,ps,NULL,0);ID3D11DeviceContext_PSSetSamplers(context,0,1,&linearSampler);ID3D11DeviceContext_PSSetConstantBuffers(context,0,1,&sizes);ID3D11DeviceContext_PSSetShaderResources(context,0,2,images);ID3D11DeviceContext_Draw(context,3,0);
 ID3D11DeviceContext_PSSetShaderResources(context,0,2,clearSRV);ID3D11DeviceContext_OMSetRenderTargets(context,0,NULL,NULL);
 if(presented)ID3D11DeviceContext_CopyResource(context,(ID3D11Resource*)presented,(ID3D11Resource*)backbuffer);
 ID3D11DeviceContext_End(context,(ID3D11Asynchronous*)gpu_end);ID3D11DeviceContext_End(context,(ID3D11Asynchronous*)gpu_disjoint);
 ID3D11DeviceContext_End(context,(ID3D11Asynchronous*)complete);ID3D11DeviceContext_Flush(context);pending=1;
 HRESULT present=IDXGISwapChain_Present(swap,0,DXGI_PRESENT_DO_NOT_WAIT);
 if(present==DXGI_ERROR_WAS_STILL_DRAWING)presentation_dropped++;
 if(FAILED(present)&&present!=DXGI_ERROR_WAS_STILL_DRAWING){shown=0;position();return fail(env,"Neural graphics device stopped.");}
 frames++;shown=1;position();QueryPerformanceCounter(&end);submit_ms=(end.QuadPart-begin.QuadPart)*1000.0/frequency.QuadPart;
 return boolValue(env,1);
}
static napi_value status(napi_env env,napi_callback_info info){
 RECT rect={0};if(overlay)GetWindowRect(overlay,&rect);POINT p={rect.left+1,rect.top+1};LPARAM location=MAKELPARAM(p.x,p.y);
 LRESULT hit=overlay?SendMessage(overlay,WM_NCHITTEST,0,location):0;
 char s[900];snprintf(s,sizeof(s),"{\"initialized\":%s,\"visible\":%s,\"frames\":%lu,\"dropped\":%lu,\"presentationDropped\":%lu,\"inputWidth\":%d,\"inputHeight\":%d,\"submitMs\":%.3f,\"gpuMs\":%.3f,\"adapter\":\"%s\",\"sameThread\":%s,\"hit\":%lld,\"rect\":{\"x\":%ld,\"y\":%ld,\"width\":%ld,\"height\":%ld},\"overlay\":\"%llu\",\"aboveGame\":%s,\"compare\":%s,\"displayWidth\":%d,\"displayHeight\":%d}",initialized?"true":"false",overlay&&IsWindowVisible(overlay)?"true":"false",frames,dropped,presentation_dropped,width,height,submit_ms,gpu_ms,adapter_name,thread==GetCurrentThreadId()?"true":"false",(long long)hit,rect.left,rect.top,rect.right-rect.left,rect.bottom-rect.top,(unsigned long long)(uintptr_t)overlay,game&&GetWindow(game,GW_HWNDPREV)==overlay?"true":"false",compare?"true":"false",width,height);
 napi_value r;napi_create_string_utf8_ptr(env,s,NAPI_AUTO_LENGTH,&r);return r;
}
static napi_value end(napi_env env,napi_callback_info info){if(initialized&&GetCurrentThreadId()!=thread)return fail(env,"Wrong neural window thread.");if(game&&IsWindow(game))RemoveWindowSubclass(game,game_proc,0xDB18);stop();return boolValue(env,1);}
static napi_value comparison(napi_env env,napi_callback_info info){
 size_t count=1;napi_value arg;int value=-1;
 if(napi_get_cb_info_ptr(env,info,&count,&arg,NULL,NULL)!=napi_ok||count!=1||napi_get_value_int32_ptr(env,arg,&value)!=napi_ok||(value!=0&&value!=1)||!initialized||GetCurrentThreadId()!=thread)return fail(env,"Invalid neural comparison mode.");
 compare=value;return boolValue(env,1);
}
static napi_value readback(napi_env env,napi_callback_info info){
 if((!getenv("BLITZ_HOST_TEST")||strcmp(getenv("BLITZ_HOST_TEST"),"1")!=0)||!initialized||!textures[9])return fail(env,"Neural readback is available only in tests.");
 size_t count=1;napi_value arg;napi_get_cb_info_ptr(env,info,&count,&arg,NULL,NULL);ID3D11Texture2D *image=textures[9];
 if(count){char *kind=string(env,arg);if(!kind)return fail(env,"Invalid readback kind.");if(strcmp(kind,"source")==0)image=textures[0];else if(strcmp(kind,"presented")==0)image=presented;else if(strcmp(kind,"neural")!=0){free(kind);return fail(env,"Invalid readback kind.");}free(kind);}
 if(!image)return fail(env,"Readback image unavailable.");
 D3D11_TEXTURE2D_DESC d;ID3D11Texture2D_GetDesc(image,&d);d.Usage=D3D11_USAGE_STAGING;d.BindFlags=0;d.CPUAccessFlags=D3D11_CPU_ACCESS_READ;
 ID3D11Texture2D *copy=NULL;if(FAILED(ID3D11Device_CreateTexture2D(device,&d,NULL,&copy)))return fail(env,"Readback allocation failed.");
 ID3D11DeviceContext_CopyResource(context,(ID3D11Resource*)copy,(ID3D11Resource*)image);D3D11_MAPPED_SUBRESOURCE mapped;
 if(FAILED(ID3D11DeviceContext_Map(context,(ID3D11Resource*)copy,0,D3D11_MAP_READ,0,&mapped))){RELEASE(copy);return fail(env,"Readback failed.");}
 size_t n=(size_t)d.Width*d.Height*4;unsigned char *pixels=malloc(n);if(!pixels){ID3D11DeviceContext_Unmap(context,(ID3D11Resource*)copy,0);RELEASE(copy);return fail(env,"Readback allocation failed.");}
 for(unsigned y=0;y<d.Height;y++)memcpy(pixels+(size_t)y*d.Width*4,(char*)mapped.pData+(size_t)y*mapped.RowPitch,d.Width*4);
 if(d.Format==DXGI_FORMAT_B8G8R8A8_UNORM)for(size_t at=0;at<n;at+=4){unsigned char r=pixels[at];pixels[at]=pixels[at+2];pixels[at+2]=r;}
 ID3D11DeviceContext_Unmap(context,(ID3D11Resource*)copy,0);RELEASE(copy);napi_value r;napi_create_buffer_copy_ptr(env,n,pixels,NULL,&r);free(pixels);return r;
}
static void cleanup(void *data){if(GetCurrentThreadId()==thread){if(game&&IsWindow(game))RemoveWindowSubclass(game,game_proc,0xDB18);stop();}}
__declspec(dllexport) napi_value napi_register_module_v1(napi_env env,napi_value exports){
 HMODULE exe=GetModuleHandleW(NULL);
#define LOAD(name) name##_ptr=(__typeof__(&name))GetProcAddress(exe,#name);if(!name##_ptr)return NULL
 LOAD(napi_get_cb_info);LOAD(napi_get_buffer_info);LOAD(napi_throw_error);LOAD(napi_get_boolean);LOAD(napi_create_function);LOAD(napi_set_named_property);LOAD(napi_add_env_cleanup_hook);LOAD(napi_get_element);LOAD(napi_get_value_string_utf8);LOAD(napi_get_value_int32);LOAD(napi_create_string_utf8);LOAD(napi_create_buffer_copy);LOAD(napi_is_array);LOAD(napi_get_array_length);
#define EXPORT(name) {napi_value f;napi_create_function_ptr(env,#name,NAPI_AUTO_LENGTH,name,NULL,&f);napi_set_named_property_ptr(env,exports,#name,f);}
 EXPORT(start);EXPORT(frame);EXPORT(status);EXPORT(end);EXPORT(comparison);EXPORT(readback);napi_add_env_cleanup_hook_ptr(env,cleanup,NULL);return exports;
}
