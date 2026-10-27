(function(root){
  'use strict';
  function number(value,fallback){value=Number(value);return isFinite(value)?value:fallback;}
  function size(width,height,screen){
    var maxW=Math.max(320,Math.min(1100,number(screen&&screen.width,1400)-16));
    var maxH=Math.max(320,Math.min(1300,number(screen&&screen.height,900)-16));
    return {width:Math.round(Math.max(320,Math.min(number(width,390),maxW))),height:Math.round(Math.max(320,Math.min(number(height,510),maxH)))};
  }
  function appearance(style,opacity){return {style:style==='dark'?'dark':'glass',opacity:Math.max(.30,Math.min(.95,number(opacity,.78)))};}
  function profile(style,value){
    var base=style==='dark'?{frost:90,brightness:-20,density:18}:{frost:55,brightness:4,density:10};
    value=value||{};
    return {frost:Math.max(0,Math.min(100,number(value.frost,base.frost))),brightness:Math.max(-50,Math.min(50,number(value.brightness,base.brightness))),density:Math.max(0,Math.min(60,number(value.density,base.density)))};
  }
  function material(value){value=number(value,55);return value<75?13:6;}
  function textSize(width){return Math.max(15,Math.min(20,number(width,390)*16/390));}
  var api={size:size,appearance:appearance,profile:profile,material:material,textSize:textSize};
  if(typeof module!=='undefined')module.exports=api;else root.NNLayout=api;
})(this);
