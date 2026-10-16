(() => {
  const projects = [...document.querySelectorAll('.project')];
  const row = document.querySelector('.type-filters');
  const buttons = [...row.querySelectorAll('[data-type]')];
  const search = document.querySelector('#search'), reset = document.querySelector('#reset');
  let type = 'all';
  const entries = projects.map(el => ({el,types:JSON.parse(el.dataset.types),search:el.dataset.search.toLocaleLowerCase()}));
  document.querySelector('.discovery').hidden = false;
  const about = document.querySelector('.about'), smallScreen = matchMedia('(max-width:640px)');
  about.open = !smallScreen.matches;
  smallScreen.addEventListener('change', e => {about.open = !e.matches;});
  // One pill behind the pressed category button; it glides between buttons instead of each button repainting.
  const pill = document.createElement('span');
  pill.className = 'pill'; pill.setAttribute('aria-hidden','true');
  row.prepend(pill); row.classList.add('has-pill');
  function movePill(animate) {
    const b = buttons.find(x => x.dataset.type === type);
    if (!animate) pill.style.transition = 'none';
    pill.style.width = b.offsetWidth + 'px'; pill.style.height = b.offsetHeight + 'px';
    pill.style.transform = `translate(${b.offsetLeft}px,${b.offsetTop}px)`;
    if (!animate) { pill.offsetWidth; pill.style.transition = ''; }
  }
  new ResizeObserver(() => movePill(false)).observe(row);
  buttons.forEach(b => new ResizeObserver(() => movePill(false)).observe(b));
  function matches(entry,testType=type) {
    const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return (testType==='all'||entry.types.includes(Number(testType)))&&terms.every(t=>entry.search.includes(t));
  }
  function update(writeUrl=true) {
    let visible=0;
    entries.forEach(e=>{e.el.hidden=!matches(e);if(!e.el.hidden)visible++;});
    buttons.forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.type===type));b.querySelector('span').textContent=entries.filter(e=>matches(e,b.dataset.type)).length;});
    const filtered=type!=='all'||search.value.trim();
    reset.hidden=!filtered;
    document.querySelector('.empty').hidden=visible!==0;
    document.querySelector('#results').textContent=filtered?`${visible} of ${entries.length} projects`:`${entries.length} projects`;
    if(writeUrl){const url=new URL(location.href);url.searchParams.delete('with');url.searchParams.delete('topic');[['type',type==='all'?'':type],['q',search.value.trim()]].forEach(([k,v])=>v?url.searchParams.set(k,v):url.searchParams.delete(k));history.replaceState(null,'',url);}
  }
  function restore(){const p=new URLSearchParams(location.search);type=buttons.some(b=>b.dataset.type===p.get('type'))?p.get('type'):'all';search.value=p.get('q')||'';update(false);movePill(false);}
  function clear(){type='all';search.value='';update();movePill(true);}
  buttons.forEach(b=>b.addEventListener('click',()=>{type=b.dataset.type;update();movePill(true);b.scrollIntoView({block:'nearest',inline:'nearest'});}));
  search.addEventListener('input',()=>update());reset.addEventListener('click',clear);
  document.querySelector('#empty-reset').addEventListener('click',()=>{clear();search.focus();});window.addEventListener('popstate',restore);restore();

  const themeButton=document.querySelector('#theme-toggle');
  function labelTheme(){const light=document.documentElement.dataset.theme==='light';const label=`Switch to ${light?'dark':'light'} theme`;themeButton.setAttribute('aria-label',label);themeButton.title=label;document.querySelector('meta[name="theme-color"]').content=light?'#eef1f5':'#0d1117';}
  themeButton.hidden=false;labelTheme();
  themeButton.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=next;try{localStorage.setItem('mackforge-theme',next);}catch{}labelTheme();});

  const btn=document.querySelector('#share-btn'),menu=document.querySelector('#share-menu'),canonical='https://mackforge.dev/',u=encodeURIComponent(canonical),t=encodeURIComponent('mackforge');
  const links={linkedin:`https://www.linkedin.com/sharing/share-offsite/?url=${u}`,reddit:`https://www.reddit.com/submit?url=${u}&title=${t}`,x:`https://x.com/intent/post?url=${u}&text=${t}`,bluesky:`https://bsky.app/intent/compose?text=${t}%20${u}`};menu.querySelectorAll('[data-net]').forEach(a=>a.href=links[a.dataset.net]);
  function close(){menu.hidden=true;btn.setAttribute('aria-expanded','false');}
  btn.addEventListener('click',()=>{menu.hidden=!menu.hidden;btn.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)document.querySelector('#share-copy').textContent='Copy link';});
  document.addEventListener('click',e=>{if(!e.target.closest('.share'))close();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){close();btn.focus();}});
  document.querySelector('#share-copy').addEventListener('click',async e=>{try{await navigator.clipboard.writeText(canonical);e.target.textContent='Link copied';}catch{window.prompt('Copy this link:',canonical);}});
  if(navigator.share){const native=document.querySelector('#share-native');native.hidden=false;native.addEventListener('click',()=>{close();navigator.share({title:'mackforge',url:canonical}).catch(()=>{});});}
})();
