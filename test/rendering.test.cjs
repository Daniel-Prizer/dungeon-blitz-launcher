const test=require('node:test'),assert=require('node:assert/strict');
const {rasterPlan}=require('../src/legacy/rendering.cjs');
test('native raster stays within its budget while preserving magnification across DPI and zoom',()=>{
 for(const [w,h] of [[1920,1080],[2560,1440],[3840,2160],[8000,8000]])for(const density of [1,1.25,1.5,2])for(const zoom of [.5,1,1.5,3])for(const resolution of [.5,.75,1]){
  const {browserZoom}=rasterPlan(w,h,zoom,density,resolution);
  const nativeWidth=w/browserZoom,nativeHeight=h/browserZoom;
  assert(nativeWidth*zoom<=4096+.00001);assert(nativeHeight*zoom<=2730+.00001);
  assert(Math.abs(nativeWidth*zoom*browserZoom*density-w*zoom*density)<.00001,'Displayed magnification must survive the bounded raster');
  if(w*density*zoom<=4096&&h*density*zoom<=2730)assert(Math.abs(browserZoom*density-1/resolution)<.00001,'Requested detail must preserve game size');
 }
 for(const values of [[0,1080,1,1],[1920,1080,Infinity,1],[1920,1080,1,0],[9000,1080,1,1]])assert.throws(()=>rasterPlan(...values));
 for(const value of [0,.6,2,NaN,'0.75',null])assert.throws(()=>rasterPlan(1920,1080,1,1,value));
});
