'use strict';
// Match Electron Packager's Windows INTEGRITY/ELECTRONASAR resource format.
// Register every intentionally opened archive; retain all security fuses.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {NtExecutable,NtExecutableResource}=require('resedit'),{getRawHeader}=require('@electron/asar');
function read(executable){const exe=NtExecutable.from(fs.readFileSync(executable)),resources=NtExecutableResource.from(exe),entries=resources.entries.filter(e=>e.type==='INTEGRITY'&&e.id==='ELECTRONASAR');assert.equal(entries.length,1,'Exactly one Electron integrity table is required');const entry=entries[0],table=JSON.parse(Buffer.from(entry.bin).toString('utf8'));assert(Array.isArray(table));return {exe,resources,entry,table};}
function expected(executable,archives){return archives.map(archive=>{const file=path.relative(path.dirname(executable),archive);assert(!file.startsWith('..')&&!path.isAbsolute(file)&&file.endsWith('.asar'));return {file,alg:'SHA256',value:crypto.createHash('sha256').update(getRawHeader(archive).headerString).digest('hex')};});}
function register(executable,archives){const data=read(executable);for(const item of expected(executable,archives)){const prior=data.table.filter(e=>e.file===item.file);assert(prior.length<=1);if(prior.length)Object.assign(prior[0],item);else data.table.push(item);}const bytes=Buffer.from(JSON.stringify(data.table));data.entry.bin=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);data.resources.outputResource(data.exe);fs.writeFileSync(executable,Buffer.from(data.exe.generate()));verify(executable,archives);}
function verify(executable,archives){const {table}=read(executable);for(const item of expected(executable,archives)){const entries=table.filter(e=>e.file===item.file);assert.equal(entries.length,1,item.file);assert.deepEqual(entries[0],item);}return table;}
module.exports={register,verify};
