// The trusted host pushes bounded private timer notifications. Resolving an
// existing wait never requires a new DevTools/IPC request for each frame.
export class PulseClock {
 constructor(socket){this.socket=socket;this.pending=null;this.closed=false;this.mode='windows-private-push';this.onmessage=()=>{const p=this.pending;if(p&&performance.now()>=p.deadline){this.pending=null;clearTimeout(p.timer);p.resolve();}};this.onerror=()=>this.close(Error('Private pulse stream disconnected'));socket.addEventListener('message',this.onmessage);socket.addEventListener('close',this.onerror);socket.addEventListener('error',this.onerror);}
 wait(delay){if(this.closed||this.pending||!Number.isFinite(delay)||delay<0||delay>1000)return Promise.reject(Error('Invalid private pulse wait'));if(delay===0)return Promise.resolve();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.close(Error('Private pulse timeout')),2000);this.pending={deadline:performance.now()+delay,resolve,reject,timer};});}
 close(error=Error('Private pulse clock closed')){if(this.closed)return;this.closed=true;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;}this.socket.removeEventListener('message',this.onmessage);this.socket.removeEventListener('close',this.onerror);this.socket.removeEventListener('error',this.onerror);this.socket.close();}
}
