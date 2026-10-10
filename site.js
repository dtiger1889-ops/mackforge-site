(() => {
  const projects = [...document.querySelectorAll('.project')];
  const buttons = [...document.querySelectorAll('[data-type]')];
  const tags = [...document.querySelectorAll('[data-topic]')];
  const search = document.querySelector('#search'), works = document.querySelector('#works'), topic = document.querySelector('#topic'), reset = document.querySelector('#reset');
  let type = 'all';
  const entries = projects.map(el => ({el,types:JSON.parse(el.dataset.types),works:JSON.parse(el.dataset.works),tags:JSON.parse(el.dataset.tags),search:el.dataset.search.toLocaleLowerCase()}));
  document.querySelector('.discovery').hidden = false;
  document.querySelectorAll('.tag-controls').forEach(el => el.hidden = false);
  document.querySelectorAll('.static-tags').forEach(el => el.hidden = true);
  const about = document.querySelector('.about'), smallScreen = matchMedia('(max-width:640px)');
  about.open = !smallScreen.matches;
  smallScreen.addEventListener('change', e => {about.open = !e.matches;});
  function matches(entry,testType=type) {
    const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return (testType==='all'||entry.types.includes(Number(testType)))&&(!works.value||entry.works.includes(works.value))&&(!topic.value||entry.tags.includes(topic.value))&&terms.every(t=>entry.search.includes(t));
  }
  function update(writeUrl=true) {
    let visible=0;
    entries.forEach(e=>{e.el.hidden=!matches(e);if(!e.el.hidden)visible++;});
    buttons.forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.type===type));b.querySelector('span').textContent=entries.filter(e=>matches(e,b.dataset.type)).length;});
    tags.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.topic===topic.value)));
    const filtered=type!=='all'||search.value.trim()||works.value||topic.value;
    reset.hidden=!filtered;
    document.querySelector('.empty').hidden=visible!==0;
    document.querySelector('#results').textContent=filtered?`${visible} of ${entries.length} projects`:`${entries.length} projects`;
    if(writeUrl){const url=new URL(location.href);[['type',type==='all'?'':type],['q',search.value.trim()],['with',works.value],['topic',topic.value]].forEach(([k,v])=>v?url.searchParams.set(k,v):url.searchParams.delete(k));history.replaceState(null,'',url);}
  }
  function restore(){const p=new URLSearchParams(location.search);type=buttons.some(b=>b.dataset.type===p.get('type'))?p.get('type'):'all';search.value=p.get('q')||'';[works,topic].forEach((select,i)=>{const value=p.get(i?'topic':'with');select.value=[...select.options].some(o=>o.value===value)?value:'';});update(false);}
  function clear(){type='all';search.value='';works.value='';topic.value='';update();}
  buttons.forEach(b=>b.addEventListener('click',()=>{type=b.dataset.type;update();}));
  tags.forEach(b=>b.addEventListener('click',()=>{topic.value=topic.value===b.dataset.topic?'':b.dataset.topic;update();}));
  search.addEventListener('input',()=>update());works.addEventListener('change',()=>update());topic.addEventListener('change',()=>update());reset.addEventListener('click',clear);
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
