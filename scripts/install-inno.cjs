'use strict';
const path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
// Inno's own documented portable mode creates no uninstall registration,
// file associations or shortcuts. Its UI runs only on the inactive desktop.
execFileSync(path.join(root,'.test-tools/innosetup-7.1.0-x64.exe'),['/PORTABLE=1','/CURRENTUSER','/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/NOICONS','/SP-',`/DIR=${path.join(root,'.test-tools/inno-7.1.0')}`],{windowsHide:true,timeout:120000});
