let ffmpeg;

const TYPES = {
  LOAD:"LOAD", EXEC:"EXEC", FFPROBE:"FFPROBE", WRITE_FILE:"WRITE_FILE",
  READ_FILE:"READ_FILE", DELETE_FILE:"DELETE_FILE", RENAME:"RENAME",
  CREATE_DIR:"CREATE_DIR", LIST_DIR:"LIST_DIR", DELETE_DIR:"DELETE_DIR",
  ERROR:"ERROR", PROGRESS:"PROGRESS", LOG:"LOG", MOUNT:"MOUNT", UNMOUNT:"UNMOUNT"
};

async function load({coreURL, wasmURL, workerURL}){
  const first=!ffmpeg;
  if(!coreURL) throw new Error("coreURL is required");
  let factory;
  try{
    const mod=await import(coreURL);
    factory=mod.default || self.createFFmpegCore;
  }catch(err){
    try{
      importScripts(coreURL);
      factory=self.createFFmpegCore;
    }catch(err2){
      throw new Error("failed to import ffmpeg-core.js: "+(err2?.message||err?.message||err2));
    }
  }
  if(!factory) throw new Error("createFFmpegCore not found");
  const finalWasm=wasmURL || coreURL.replace(/\.js$/,".wasm");
  const finalWorker=workerURL || coreURL.replace(/\.js$/,".worker.js");
  ffmpeg=await factory({
    mainScriptUrlOrBlob: coreURL+"#"+btoa(JSON.stringify({wasmURL:finalWasm,workerURL:finalWorker}))
  });
  ffmpeg.setLogger(data=>self.postMessage({type:TYPES.LOG,data}));
  ffmpeg.setProgress(data=>self.postMessage({type:TYPES.PROGRESS,data}));
  return first;
}
function ensure(){ if(!ffmpeg) throw new Error("ffmpeg is not loaded"); }
function exec({args,timeout=-1}){ensure();ffmpeg.setTimeout(timeout);ffmpeg.exec(...args);const r=ffmpeg.ret;ffmpeg.reset();return r}
function ffprobe({args,timeout=-1}){ensure();ffmpeg.setTimeout(timeout);ffmpeg.ffprobe(...args);const r=ffmpeg.ret;ffmpeg.reset();return r}
function writeFile({path,data}){ensure();ffmpeg.FS.writeFile(path,data);return true}
function readFile({path,encoding}){ensure();return ffmpeg.FS.readFile(path,{encoding})}
function deleteFile({path}){ensure();ffmpeg.FS.unlink(path);return true}
function rename({oldPath,newPath}){ensure();ffmpeg.FS.rename(oldPath,newPath);return true}
function createDir({path}){ensure();ffmpeg.FS.mkdir(path);return true}
function listDir({path}){ensure();return ffmpeg.FS.readdir(path).map(name=>{const st=ffmpeg.FS.stat(path+"/"+name);return {name,isDir:ffmpeg.FS.isDir(st.mode)}})}
function deleteDir({path}){ensure();ffmpeg.FS.rmdir(path);return true}
function mount({fsType,options,mountPoint}){ensure();const fs=ffmpeg.FS.filesystems[fsType];if(!fs)return false;ffmpeg.FS.mount(fs,options,mountPoint);return true}
function unmount({mountPoint}){ensure();ffmpeg.FS.unmount(mountPoint);return true}

self.onmessage=async({data:{id,type,data}})=>{
  const trans=[];
  try{
    let out;
    if(type!==TYPES.LOAD) ensure();
    switch(type){
      case TYPES.LOAD: out=await load(data||{}); break;
      case TYPES.EXEC: out=exec(data); break;
      case TYPES.FFPROBE: out=ffprobe(data); break;
      case TYPES.WRITE_FILE: out=writeFile(data); break;
      case TYPES.READ_FILE: out=readFile(data); break;
      case TYPES.DELETE_FILE: out=deleteFile(data); break;
      case TYPES.RENAME: out=rename(data); break;
      case TYPES.CREATE_DIR: out=createDir(data); break;
      case TYPES.LIST_DIR: out=listDir(data); break;
      case TYPES.DELETE_DIR: out=deleteDir(data); break;
      case TYPES.MOUNT: out=mount(data); break;
      case TYPES.UNMOUNT: out=unmount(data); break;
      default: throw new Error("unknown message type: "+type);
    }
    if(out instanceof Uint8Array) trans.push(out.buffer);
    self.postMessage({id,type,data:out},trans);
  }catch(e){
    self.postMessage({id,type:TYPES.ERROR,data:String(e)});
  }
};