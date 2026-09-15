document.querySelectorAll('[data-demo-action]').forEach(el=>el.addEventListener('click',e=>{
  const msg=el.getAttribute('data-demo-action');
  if(!msg) return;
  e.preventDefault();
  const backdrop=document.createElement('div');
  backdrop.className='modal-backdrop';
  backdrop.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><span class="tag purple">Interactive prototype</span><h2 style="margin-top:14px">${msg}</h2><p>This demonstrates the action the production app will complete. The developer will connect it to Kyriq and QuickBooks data.</p><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:24px"><button class="btn" data-close>Cancel</button><button class="btn primary" data-complete>Complete demo action</button></div></div>`;
  document.body.appendChild(backdrop);
  const close=()=>backdrop.remove();
  backdrop.addEventListener('click',event=>{if(event.target===backdrop||event.target.closest('[data-close]'))close();});
  backdrop.querySelector('[data-complete]').addEventListener('click',()=>{
    const modal=backdrop.querySelector('.modal');
    modal.innerHTML='<div style="text-align:center;padding:24px"><div class="stat-ico green" style="margin:0 auto 16px">✓</div><h2>Action complete</h2><p>The prototype has recorded this step for demonstration.</p><button class="btn primary" style="margin:20px auto 0" data-close>Continue</button></div>';
    modal.querySelector('[data-close]').addEventListener('click',close);
  });
}));

const loginForm=document.querySelector('#login-form');
if(loginForm) loginForm.addEventListener('submit',event=>{event.preventDefault();window.location.href='upload.html';});

const sidebar=document.querySelector('.sidebar');
if(sidebar){
  const signOut=document.createElement('a');
  signOut.className='sidebar-signout';
  signOut.href='index.html';
  signOut.innerHTML='<span class="ico">↪</span> Sign out';
  const help=sidebar.querySelector('.helpbox');
  sidebar.insertBefore(signOut,help);
}
