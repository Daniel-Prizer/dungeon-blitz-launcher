'use strict';
// Dimensions are DIPs; density is the observed device pixel ratio without page
// zoom. Budget applies to native layout input, leaving room below Flash's bitmap
// allocation ceiling. Residual browser zoom preserves requested magnification.
function rasterPlan(width,height,zoom,density){
 if(![width,height,zoom,density].every(Number.isFinite)||width<1||height<1||width>8000||height>8000||zoom<.5||zoom>3||density<.5||density>8)throw Error('Invalid native raster request');
 const rasterScale=Math.min(1,4096/(width*density*zoom),2730/(height*density*zoom));
 return {rasterScale,browserZoom:1/(density*rasterScale)};
}
module.exports={rasterPlan};
