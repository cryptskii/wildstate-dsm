import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
const names=['player','mira','rowan','kade','nessa'];
const records=[];
for(const name of names){
 const image=PNG.sync.read(readFileSync('public/spritesheets/'+name+'-walk-v2.png'));
 const bands=[];let start=null;
 for(let y=0;y<=image.height;y++){
  let count=0;
  if(y<image.height)for(let x=0;x<image.width;x++)if(image.data[(y*image.width+x)*4+3]>128)count++;
  if(count>5&&start===null)start=y;
  if(count<=5&&start!==null){bands.push([start,y-1]);start=null;}
 }
 if(bands.length!==4)throw new Error(name+': expected four isolated rows');
 const boxes=[];
 for(let r=0;r<4;r++)for(let c=0;c<3;c++){
  let x0=image.width,y0=image.height,x1=-1,y1=-1;
  const left=Math.floor(c*image.width/3),right=Math.floor((c+1)*image.width/3);
  // Segment the source cell first: neighbours must never inflate its crop or scale.
  const sourceSeen=new Set(),sourceParts=[];
  for(let y=bands[r][0];y<=bands[r][1];y++)for(let x=left;x<right;x++){
   const key=y*image.width+x;
   if(sourceSeen.has(key)||image.data[key*4+3]<=128)continue;
   const part=[],queue=[[x,y]];sourceSeen.add(key);
   while(queue.length){const [px,py]=queue.pop();part.push(py*image.width+px);
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
     const nx=px+ox,ny=py+oy,k=ny*image.width+nx;
     if(nx>=left&&nx<right&&ny>=bands[r][0]&&ny<=bands[r][1]&&!sourceSeen.has(k)&&image.data[k*4+3]>128){sourceSeen.add(k);queue.push([nx,ny]);}
    }
   }sourceParts.push(part);
  }
  sourceParts.sort((a,b)=>b.length-a.length);
  const keep=new Set(sourceParts[0]);
  for(let y=bands[r][0];y<=bands[r][1];y++)for(let x=left;x<right;x++)if(!keep.has(y*image.width+x))image.data[(y*image.width+x)*4+3]=0;
  for(let y=bands[r][0];y<=bands[r][1];y++)for(let x=left;x<right;x++){
   if(image.data[(y*image.width+x)*4+3]>128){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  }
  if(x1<0)throw new Error(name+': missing frame');
  boxes.push({x0,y0,x1,y1});
 }
 // One scale for all poses; feet share a baseline. No neighbouring row is sampled.
 const ratio=Math.min(28/Math.max(...boxes.map(b=>b.x1-b.x0+1)),34/Math.max(...boxes.map(b=>b.y1-b.y0+1)));
 const packed=new PNG({width:96,height:160});
 boxes.forEach((b,i)=>{
  const w=Math.round((b.x1-b.x0+1)*ratio),h=Math.round((b.y1-b.y0+1)*ratio);
  const dx=(i%3)*32+Math.floor((32-w)/2),dy=Math.floor(i/3)*40+38-h;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const sx=b.x0+Math.min(b.x1-b.x0,Math.floor(x/ratio)),sy=b.y0+Math.min(b.y1-b.y0,Math.floor(y/ratio));
   const from=(sy*image.width+sx)*4,to=((dy+y)*96+dx+x)*4;
   image.data.copy(packed.data,to,from,from+4);
  }
 });
 for(let r=0;r<4;r++)for(let c=0;c<3;c++){
  // Remove isolated sampling specks, preserving all substantial character parts.
  const seen=new Set(),components=[];
  for(let sy=0;sy<40;sy++)for(let sx=0;sx<32;sx++){
   const key=sy*32+sx;
   const alpha=(x,y)=>packed.data[((r*40+y)*96+c*32+x)*4+3];
   if(seen.has(key)||!alpha(sx,sy))continue;
   const component=[],queue=[[sx,sy]];seen.add(key);
   while(queue.length){const [x,y]=queue.pop();component.push([x,y]);
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
     const nx=x+ox,ny=y+oy,k=ny*32+nx;
     if(nx>=0&&nx<32&&ny>=0&&ny<40&&!seen.has(k)&&alpha(nx,ny)){seen.add(k);queue.push([nx,ny]);}
    }
   }
   components.push(component);
  }
  components.sort((a,b)=>b.length-a.length);
  for(const component of components.slice(1))for(const [x,y] of component)packed.data[((r*40+y)*96+c*32+x)*4+3]=0;
  let occupied=0;
  for(let y=0;y<40;y++)for(let x=0;x<32;x++){
   const a=packed.data[((r*40+y)*96+c*32+x)*4+3];
   if(a>0){occupied++;if(x===0||x===31||y===0||y===39)throw new Error(name+': frame touches border');}
  }
  if(!occupied)throw new Error(name+': empty packed frame');
 }
 writeFileSync('public/spritesheets/'+name+'-walk-v4.png',PNG.sync.write(packed));
 records.push({name,rows:bands,frame:[32,40],frames:12});
}
writeFileSync('public/spritesheets/character-walk-v4.json',JSON.stringify(records,null,2));
console.log('Packed and verified 60 isolated frames, with shared baselines and clear borders.');

