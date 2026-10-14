(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const DEFAULT_SEARCH_API = (window.AURALIS_CONFIG && window.AURALIS_CONFIG.searchApiUrl) || "";
  const state = { animeResults:[], animeParts:[], animePart:null, animeVisibleEpisodes:12, apiBase: localStorage.getItem("auralis_search_api_url") || DEFAULT_SEARCH_API, view:"discover", tracks:[], queue:[], queueIndex:-1, liked:JSON.parse(localStorage.getItem("auralis_liked")||"[]"), history:JSON.parse(localStorage.getItem("auralis_history")||"[]"), current:null, repeat:false, shuffle:false, searchHistory:JSON.parse(localStorage.getItem("auralis_searches")||"[]") };
  const fmt = n => { if(!Number.isFinite(n)||n<0)return "0:00"; return `${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,"0")}`; };
  const esc = s => String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let toastTimer;
  let ytPlayer = null;
  let ytApiPromise = null;
  let progressTimer = null;
  let embedRetryCount = 0;
  let pendingPlayerMessage = "";
  function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2400);}
  function persist(){localStorage.setItem("auralis_liked",JSON.stringify(state.liked));localStorage.setItem("auralis_history",JSON.stringify(state.history.slice(0,60)));$("#likeCount").textContent=state.liked.length;}
  function openSettings(){ $("#workerUrlInput").value=state.apiBase || ""; $("#settingsDialog").showModal(); }
  function normalise(item){const s=item.snippet||{};return {id:item.id?.videoId||item.id||"",title:s.title||item.title||"Untitled",artist:s.channelTitle||item.artist||"YouTube creator",image:s.thumbnails?.high?.url||s.thumbnails?.medium?.url||s.thumbnails?.default?.url||item.image||"",description:s.description||"",url:"https://www.youtube.com/watch?v="+(item.id?.videoId||item.id||""),source:"youtube"};}
  function setStatus(title,body,buttonText=""){ $("#statusPanel").style.display="flex";$("#trackGrid").innerHTML="";$("#statusPanel").querySelector("h3").textContent=title;$("#statusPanel").querySelector("p").textContent=body;$("#setupBtn").textContent=buttonText||"Set up live search";$("#setupBtn").style.display=buttonText?"inline-flex":"none"; }
  async function searchMusic(query, opts={}) {
    query=(query||"").trim(); if(!query){toast("Type a song, artist, or mood first.");return;}
    $("#suggestions").classList.remove("open");$("#searchInput").value=query;$("#clearSearch").style.display="block";
    state.searchHistory=[query,...state.searchHistory.filter(x=>x.toLowerCase()!==query.toLowerCase())].slice(0,8);localStorage.setItem("auralis_searches",JSON.stringify(state.searchHistory));
    $("#sectionTitle").textContent=opts.title||`Results for “${query}”`;$("#sectionEyebrow").textContent=state.view==="videos"?"WATCH SOMETHING GOOD":state.view==="songs"?"FIND YOUR NEXT SONG":"SEARCH YOUR SOUND";$("#resultMeta").textContent="Searching…";$("#statusPanel").style.display="flex";setStatus(state.view==="videos"?"Finding videos…":"Finding songs…",state.view==="videos"?"Searching YouTube videos you can watch here when embedding is allowed.":"Searching YouTube music uploads. Some uploaders may block embedded playback.");$("#statusPanel .status-icon").textContent="⌕";
    if(!state.apiBase || state.apiBase.includes("REPLACE-WITH-YOUR-WORKER")){setStatus("Connect Auralis search","The site owner needs to deploy the included Cloudflare Worker and set its URL in config.js.","Set up search service");$("#resultMeta").textContent="Setup required";return;}
    try{
      const url=`${state.apiBase.replace(/\/+$/, "")}/api/search?q=${encodeURIComponent(query)}&view=${encodeURIComponent(state.view === "videos" ? "videos" : "songs")}`;
      const res=await fetch(url);const data=await res.json();if(!res.ok)throw new Error(data.error||"Search failed. Check the search service and API quota.");
      state.tracks=(data.items||[]).map(normalise).filter(t=>t.id);renderTracks(state.tracks);$("#resultMeta").textContent=`${state.tracks.length} ${state.view === "videos" ? "videos" : "songs"} found`;if(!state.tracks.length)setStatus("No results found","Try another spelling, artist name, or search phrase.");
    }catch(e){setStatus("Search hit a snag",e.message||"Check the search service and API quota.","Check search service");$("#resultMeta").textContent="Could not load";toast("Search failed — check API settings.");}
  }
  function renderTracks(list){$("#statusPanel").style.display="none";const grid=$("#trackGrid");grid.innerHTML="";if(!list.length){setStatus("Nothing here yet","Search for an artist, song, or mood to fill this space.");return;}
    list.forEach((t,i)=>{const liked=state.liked.some(x=>x.id===t.id);const card=document.createElement("article");card.className="track-card";card.innerHTML=`<div class="cover-wrap">${t.image?`<img class="cover" loading="lazy" src="${esc(t.image)}" alt="">`:`<div class="cover-placeholder">♪</div>`}<button class="card-like ${liked?"liked":""}" aria-label="${liked?"Unlike":"Like"} track" data-like="${i}">${liked?"♥":"♡"}</button><button class="card-play" aria-label="Play ${esc(t.title)}" data-play="${i}">▶</button></div><div class="track-title" title="${esc(t.title)}">${esc(t.title)}</div><div class="track-sub" title="${esc(t.artist)}">${esc(t.artist)}</div><div class="card-actions"><button class="small-action" data-open="${i}">Watch ↗</button><button class="small-action" data-save="${i}">Save ♡</button></div>`;
      grid.appendChild(card);
    });
    grid.querySelectorAll("[data-play]").forEach(b=>b.addEventListener("click",()=>playTrack(list[+b.dataset.play],list)));
    grid.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>openVideo(list[+b.dataset.open])));
    grid.querySelectorAll("[data-like]").forEach(b=>b.addEventListener("click",()=>toggleLike(list[+b.dataset.like])));
    grid.querySelectorAll("[data-save]").forEach(b=>b.addEventListener("click",()=>toggleLike(list[+b.dataset.save])));
  }
  function toggleLike(t){const idx=state.liked.findIndex(x=>x.id===t.id);if(idx>=0){state.liked.splice(idx,1);toast("Removed from liked songs.");}else{state.liked.unshift(t);toast("Added to liked songs.");}persist();if(state.view==="favorites")showLibrary("favorites");else if(state.current?.id===t.id)$("#nowLike").classList.toggle("liked",state.liked.some(x=>x.id===t.id));if(state.tracks.length)renderTracks(state.tracks);}
  function loadYouTubeApi(){
    if(window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if(ytApiPromise) return ytApiPromise;
    ytApiPromise=new Promise((resolve,reject)=>{
      const previous=window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady=()=>{if(typeof previous==="function")previous();resolve(window.YT);};
      const script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";script.async=true;
      script.onerror=()=>{ytApiPromise=null;reject(new Error("YouTube player could not load. Check your connection or browser content blockers."));};
      document.head.appendChild(script);
    });
    return ytApiPromise;
  }
  function syncPlayerUi(){
    if(!ytPlayer || typeof ytPlayer.getCurrentTime!=="function") return;
    try{
      const current=ytPlayer.getCurrentTime()||0, duration=ytPlayer.getDuration()||0;
      $("#currentTime").textContent=fmt(current);$("#duration").textContent=duration?fmt(duration):"--:--";
      $("#progressFill").style.width=duration?`${Math.min(100,current/duration*100)}%`:"0%";
      const playing=ytPlayer.getPlayerState()===1;$("#playBtn").textContent=playing?"Ⅱ":"▶";
    }catch(_){/* player may still be initialising */}
  }
  function playTrack(track,list=state.tracks,autoSkip=false){if(!autoSkip)embedRetryCount=0;state.current=track;state.queue=list.slice();state.queueIndex=Math.max(0,state.queue.findIndex(x=>x.id===track.id));$("#nowTitle").textContent=track.title;$("#nowArtist").textContent=track.artist;$("#nowCover").innerHTML=track.image?`<img src="${esc(track.image)}" alt="">`:"♪";$("#nowLike").classList.toggle("liked",state.liked.some(x=>x.id===track.id));$("#nowLike").textContent=state.liked.some(x=>x.id===track.id)?"♥":"♡";state.history=[track,...state.history.filter(x=>x.id!==track.id)].slice(0,60);persist();openVideo(track);}
  async function openVideo(t){
    if(!t)return;
    $("#videoTitle").textContent=t.title;$("#youtubeLink").href=t.url||`https://www.youtube.com/watch?v=${t.id}`;
    if(!$("#videoDialog").open)$("#videoDialog").showModal();
    if(pendingPlayerMessage){$("#videoFrame").innerHTML=`<div class="video-placeholder">${esc(pendingPlayerMessage)}</div>`;pendingPlayerMessage="";}
    try{
      await loadYouTubeApi();
      if(!state.current || state.current.id!==t.id)return;
      if(ytPlayer && typeof ytPlayer.loadVideoById==="function"){
        ytPlayer.loadVideoById(t.id);ytPlayer.setVolume(Number($("#volumeSlider").value));
      }else{
        $("#videoFrame").innerHTML="";
        const host=document.createElement("div");host.id="youtubePlayer";$("#videoFrame").appendChild(host);
        const playerVars={autoplay:1,rel:0,playsinline:1,enablejsapi:1,iv_load_policy:3,controls:1};
        if(location.protocol==="http:"||location.protocol==="https:")playerVars.origin=location.origin;
        ytPlayer=new window.YT.Player("youtubePlayer",{
          width:"100%",height:"100%",videoId:t.id,
          playerVars,
          events:{onReady:e=>{e.target.setVolume(Number($("#volumeSlider").value));e.target.playVideo();syncPlayerUi();},onStateChange:event=>{syncPlayerUi();if(event.data===0&&state.repeat&&state.current){try{ytPlayer.seekTo(0,true);ytPlayer.playVideo();}catch(_){}}},onError:event=>handleEmbedError(event.data,state.current||t)}
        });
      }
      if(!progressTimer)progressTimer=setInterval(syncPlayerUi,500);
    }catch(e){pendingPlayerMessage="The in-page player could not load. Please open this site on HTTPS or localhost and check your connection.";$("#videoFrame").innerHTML=`<div class="video-placeholder">${esc(pendingPlayerMessage)}</div>`;pendingPlayerMessage="";toast("Could not start the embedded player.");}
  }
  function handleEmbedError(code, track){
    // Some uploaders explicitly block embedding. Try a few other results in the same list
    // before showing an in-page explanation instead of sending the user away immediately.
    if([100,101,150,5,2,153].includes(code) && state.queue.length>1 && embedRetryCount<Math.min(3,state.queue.length-1)){
      embedRetryCount++;
      toast(`This upload won't play embedded. Trying another result (${embedRetryCount}/3)…`);
      let nextIndex=state.queueIndex+1;
      if(nextIndex>=state.queue.length)nextIndex=0;
      if(state.queue[nextIndex]?.id===track.id && state.queue.length>1)nextIndex=(nextIndex+1)%state.queue.length;
      state.queueIndex=nextIndex;
      const next=state.queue[nextIndex];
      if(next && next.id!==track.id){
        state.current=next;
        $("#nowTitle").textContent=next.title;$("#nowArtist").textContent=next.artist;
        $("#nowCover").innerHTML=next.image?`<img src="${esc(next.image)}" alt="">`:"♪";
        $("#videoTitle").textContent=next.title;$("#youtubeLink").href=next.url;
        try{ytPlayer.loadVideoById(next.id);ytPlayer.setVolume(Number($("#volumeSlider").value));}catch(_){pendingPlayerMessage="This video cannot be embedded. Choose another result to keep listening here.";}
        return;
      }
    }
    const messages={100:"This video is unavailable or private.",101:"The uploader does not allow this video to play inside other websites.",150:"The uploader does not allow this video to play inside other websites.",153:"YouTube did not receive the browser's required referrer information. Open this website on HTTPS or localhost, not as a file.",5:"This video format could not be played by the embedded player.",2:"YouTube rejected this video ID."};
    const message=messages[code]||"This upload cannot be played in the embedded player. Try another result.";
    try{if(ytPlayer&&typeof ytPlayer.destroy==="function")ytPlayer.destroy();}catch(_){}
    ytPlayer=null;
    $("#videoFrame").innerHTML=`<div class="video-placeholder playback-error"><strong>Can't play this upload here</strong><span>${esc(message)}</span><button type="button" class="secondary-btn" id="retryVideoBtn">Try another result</button></div>`;
    const retry=$("#retryVideoBtn");if(retry)retry.addEventListener("click",()=>{embedRetryCount=0;nextTrack(1);});
    toast("This upload blocks embedded playback. Trying another result usually works.");
  }

  const ANILIST_API = "https://graphql.anilist.co";
  const animeQuery = `query ($search: String, $sort: [MediaSort]) { Page(page: 1, perPage: 24) { media(type: ANIME, isAdult: false, search: $search, sort: $sort) { id title { romaji english native } coverImage { extraLarge large } bannerImage description(asHtml: false) averageScore episodes seasonYear format status genres } } }`;
  async function searchAnime(term="") {
    const queryText=(term||"").trim(); state.view="anime";
    $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view==="anime"));
    $("#hero").style.display="none";$(".quick-moods").style.display="none";$(".features-section").style.display="none";
    $("#searchInput").placeholder="Search anime titles, genres, characters...";$("#searchInput").setAttribute("aria-label","Search anime");
    $("#sectionTitle").textContent=queryText?`Anime results for “${queryText}”`:"Trending anime";$("#sectionEyebrow").textContent="ANIME DISCOVERY";$("#resultMeta").textContent="Loading anime…";
    setStatus("Loading anime…","Fetching titles, posters, ratings and episode counts from AniList.");$("#statusPanel .status-icon").textContent="◈";
    try {
      const res=await fetch(ANILIST_API,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({query:animeQuery,variables:{search:queryText||null,sort:queryText?["SEARCH_MATCH"]:["TRENDING_DESC"]}})});
      const data=await res.json();if(!res.ok||data.errors?.length)throw new Error(data.errors?.[0]?.message||"AniList could not load anime right now.");
      state.animeResults=data.data?.Page?.media||[];renderAnimeCards(state.animeResults);$("#resultMeta").textContent=`${state.animeResults.length} anime`;
      if(!state.animeResults.length)setStatus("No anime found","Try a different title or search term.");
    } catch(err) { setStatus("Anime catalog could not load",`${err.message||"Network error"} Check your connection or try again in a moment.` ,"Retry anime catalog");$("#resultMeta").textContent="Could not load"; }
  }
  function animeTitle(a){return a?.title?.english||a?.title?.romaji||a?.title?.native||"Untitled anime";}
  function renderAnimeCards(list){
    $("#statusPanel").style.display="none";const grid=$("#trackGrid");grid.innerHTML="";
    if(!list.length){setStatus("No anime found","Try another title or search term.");return;}
    list.forEach((a,i)=>{const card=document.createElement("article");card.className="track-card anime-card";const cover=a.coverImage?.extraLarge||a.coverImage?.large||"";const score=a.averageScore?`${(a.averageScore/10).toFixed(1)} ★`:"Score n/a";const ep=a.episodes?`${a.episodes} eps`:"Episode count n/a";
      card.innerHTML=`<button class="anime-card-open" data-anime-open="${i}" aria-label="Open ${esc(animeTitle(a))}"><div class="cover-wrap">${cover?`<img class="cover" loading="lazy" src="${esc(cover)}" alt="">`:`<div class="cover-placeholder">◈</div>`}<span class="anime-score">${esc(score)}</span></div><div class="track-title" title="${esc(animeTitle(a))}">${esc(animeTitle(a))}</div><div class="track-sub">${esc([a.seasonYear,a.format,ep].filter(Boolean).join(" · "))}</div><div class="anime-card-hint">Details &amp; episodes <span>↗</span></div></button>`;grid.appendChild(card);});
    grid.querySelectorAll("[data-anime-open]").forEach(b=>b.addEventListener("click",()=>openAnimeDetails(list[+b.dataset.animeOpen])));
  }
  async function openAnimeDetails(anime){
    state.animeVisibleEpisodes=12;state.animeParts=[anime];state.animePart=anime;
    $("#animeDetailCover").src=anime.coverImage?.extraLarge||anime.coverImage?.large||"";$("#animeDetailCover").alt=animeTitle(anime);$("#animeDetailTitle").textContent=animeTitle(anime);$("#animeDetailEyebrow").textContent="ANIME GUIDE";
    $("#animeDetailMeta").textContent=[anime.seasonYear,anime.format,anime.status?.replaceAll("_"," "),anime.episodes?`${anime.episodes} episodes`:"Episode count unavailable",anime.averageScore?`${(anime.averageScore/10).toFixed(1)}/10`:""].filter(Boolean).join(" · ");
    $("#animeDetailDescription").textContent=(anime.description||"No synopsis is available for this title.").replace(/<[^>]*>/g,"");$("#animeDetailGenres").innerHTML=(anime.genres||[]).map(g=>`<span>${esc(g)}</span>`).join("");
    $("#animeSeasonList").innerHTML=`<button class="anime-season active" data-anime-part="0">${esc(animeTitle(anime))}</button><span class="anime-season-loading">Loading related seasons…</span>`;$("#animeEpisodeGrid").innerHTML="";$("#animeEpisodeHeading").textContent="Episodes";$("#animeEpisodeMeta").textContent="";$("#animeMoreEpisodes").style.display="none";
    if(!$("#animeDialog").open)$("#animeDialog").showModal();renderAnimeEpisodes(anime);
    const detailQuery=`query ($id: Int) { Media(id: $id, type: ANIME) { id relations { edges { relationType node { id type format title { romaji english native } coverImage { extraLarge large } episodes seasonYear startDate { year month day } status averageScore genres description(asHtml: false) } } } } }`;
    try {const res=await fetch(ANILIST_API,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({query:detailQuery,variables:{id:anime.id}})});const data=await res.json();if(!res.ok||data.errors?.length)throw new Error("Related seasons unavailable");
      const edges=data.data?.Media?.relations?.edges||[];const related=edges.filter(e=>e.node?.type==="ANIME"&&["SEQUEL","PREQUEL"].includes(e.relationType)&&["TV","TV_SHORT","ONA"].includes(e.node.format)).map(e=>({...e.node,relationType:e.relationType}));
      const all=[...related,anime].filter((x,i,arr)=>arr.findIndex(y=>y.id===x.id)===i).sort((a,b)=>(a.seasonYear||a.startDate?.year||9999)-(b.seasonYear||b.startDate?.year||9999));
      state.animeParts=all;state.animePart=all.find(x=>x.id===anime.id)||anime;renderAnimeSeasons();renderAnimeEpisodes(state.animePart);
    } catch(_) {state.animeParts=[anime];renderAnimeSeasons();}
  }
  function renderAnimeSeasons(){const box=$("#animeSeasonList");box.innerHTML="";if(!state.animeParts.length)return;state.animeParts.forEach((part,i)=>{const b=document.createElement("button");b.className="anime-season"+(state.animePart?.id===part.id?" active":"");b.dataset.animePart=i;b.textContent=animeTitle(part);b.title=part.relationType?`${part.relationType.toLowerCase()} · ${animeTitle(part)}`:animeTitle(part);box.appendChild(b);b.addEventListener("click",()=>{state.animePart=part;state.animeVisibleEpisodes=12;renderAnimeSeasons();renderAnimeEpisodes(part);});});}
  function renderAnimeEpisodes(part){const grid=$("#animeEpisodeGrid");grid.innerHTML="";$("#animeEpisodeHeading").textContent=`Episodes · ${animeTitle(part)}`;const total=Number(part.episodes)||0;$("#animeEpisodeMeta").textContent=total?`${total} total`:"Episode count unavailable";$("#animeMoreEpisodes").style.display=total>state.animeVisibleEpisodes?"inline-flex":"none";
    if(!total){grid.innerHTML='<div class="anime-empty">AniList has no episode count for this entry.</div>';return;}
    const count=Math.min(total,state.animeVisibleEpisodes);for(let n=1;n<=count;n++){const b=document.createElement("button");b.className="anime-episode";b.innerHTML=`<span class="episode-number">${String(n).padStart(2,"0")}</span><span class="episode-copy"><strong>Episode ${n}</strong><small>Search for an official upload</small></span><span class="episode-arrow">↗</span>`;b.addEventListener("click",()=>findAnimeEpisode(part,n));grid.appendChild(b);}
  }
  function findAnimeEpisode(part,episode){const title=animeTitle(part);$("#animeDialog").close();state.view="videos";$$('.nav-item').forEach(b=>b.classList.toggle("active",b.dataset.view==="videos"));$("#searchInput").placeholder="Search songs, artists, albums, moods...";$("#searchInput").setAttribute("aria-label","Search music or anime");searchMusic(`${title} episode ${episode} official full episode`,{title:`${title} · Episode ${episode} — YouTube results`});toast("Choose an official rights-holder upload if one is available.");}
  $("#animeMoreEpisodes").addEventListener("click",()=>{state.animeVisibleEpisodes+=12;if(state.animePart)renderAnimeEpisodes(state.animePart);});

  function showLibrary(which){state.view=which;$$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===which));$("#hero").style.display=which==="discover"||which==="trending"?"flex":"none";$(".quick-moods").style.display=which==="discover"||which==="trending"?"flex":"none";$(".features-section").style.display=which==="discover"?"block":"none";
    $("#searchInput").placeholder=which==="anime"?"Search anime titles, genres, characters...":"Search songs, artists, albums, moods...";$("#searchInput").setAttribute("aria-label",which==="anime"?"Search anime":"Search music or anime");
    if(which==="anime"){searchAnime("");}
    else if(which==="favorites"){ $("#sectionTitle").textContent="Liked songs";$("#sectionEyebrow").textContent="YOUR PERSONAL COLLECTION";$("#resultMeta").textContent=`${state.liked.length} saved`;renderTracks(state.liked);if(!state.liked.length)setStatus("Your favourites start here","Tap the heart on any track to keep it close.");}
    else if(which==="history"){ $("#sectionTitle").textContent="Recently played";$("#sectionEyebrow").textContent="BACK TO THE FEELING";$("#resultMeta").textContent=`${state.history.length} recent`;renderTracks(state.history);if(!state.history.length)setStatus("Your listening story starts here","Play a track and it will show up here.");}
    else if(which==="songs"){searchMusic("popular songs",{title:"Songs"});}
    else if(which==="videos"){searchMusic("popular music videos",{title:"Videos"});}
    else if(which==="trending"){searchMusic("trending music 2026",{title:"Trending right now"});}
    else if(which==="discover"){ $("#sectionTitle").textContent="Discover something new";$("#sectionEyebrow").textContent="MADE FOR YOUR MOMENT";$("#resultMeta").textContent="Search or choose a mood";setStatus("Your next favourite is out there.","Search for a song, artist, album, or mood. Auralis search is connected by the site owner.");}
  }
  function showSuggestions(){const q=$("#searchInput").value.trim().toLowerCase(),box=$("#suggestions");const matches=(q?state.searchHistory.filter(x=>x.toLowerCase().includes(q)):state.searchHistory).slice(0,5);if(!matches.length){box.classList.remove("open");return;}box.innerHTML=matches.map(x=>`<div class="suggestion" data-suggestion="${esc(x)}"><span>◷</span>${esc(x)}</div>`).join("");box.classList.add("open");box.querySelectorAll("[data-suggestion]").forEach(el=>el.addEventListener("click",()=>searchMusic(el.dataset.suggestion)));}
  function nextTrack(dir){if(!state.queue.length)return toast("Play a track first.");let i=state.shuffle?Math.floor(Math.random()*state.queue.length):state.queueIndex+dir;if(i<0)i=state.queue.length-1;if(i>=state.queue.length)i=0;state.queueIndex=i;playTrack(state.queue[i],state.queue);}
  $("#searchForm").addEventListener("submit",e=>{e.preventDefault();if(state.view==="anime")searchAnime($("#searchInput").value);else searchMusic($("#searchInput").value);});
  $("#searchInput").addEventListener("input",()=>{$("#clearSearch").style.display=$("#searchInput").value?"block":"none";showSuggestions();});
  $("#searchInput").addEventListener("keydown",e=>{if(e.key==="Escape")$("#suggestions").classList.remove("open");});
  document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap"))$("#suggestions").classList.remove("open");});
  $("#clearSearch").addEventListener("click",()=>{$("#searchInput").value="";$("#clearSearch").style.display="none";$("#suggestions").classList.remove("open");$("#searchInput").focus();});
  $("#setupBtn").addEventListener("click",()=>{if(state.view==="anime")searchAnime($("#searchInput").value);else openSettings();});$("#settingsBtn").addEventListener("click",openSettings);
  $("#saveApiUrlBtn").addEventListener("click",()=>{state.apiBase=$("#workerUrlInput").value.trim().replace(/\/+$/, "");if(state.apiBase)localStorage.setItem("auralis_search_api_url",state.apiBase);else localStorage.removeItem("auralis_search_api_url");$("#settingsDialog").close();toast(state.apiBase?"Search service URL saved on this device.":"Search service URL cleared.");if(state.apiBase&&$("#searchInput").value.trim())searchMusic($("#searchInput").value);});
  $("#removeApiUrlBtn").addEventListener("click",()=>{$("#workerUrlInput").value="";state.apiBase="";localStorage.removeItem("auralis_search_api_url");toast("Local search service override removed.");});
  $("#exploreBtn").addEventListener("click",()=>{$("#searchInput").focus();$("#searchInput").scrollIntoView({behavior:"smooth",block:"center"});});
  $("#surpriseBtn").addEventListener("click",()=>{const q=["jazz for rainy evenings","indie discoveries","epic anime soundtrack","90s greatest hits","late night lofi","feel good pop","acoustic songs","cinematic instrumental"][Math.floor(Math.random()*8)];searchMusic(q,{title:"A little surprise"});});
  $$(".mood-pill").forEach(b=>b.addEventListener("click",()=>{$$(".mood-pill").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");searchMusic(b.dataset.query,{title:b.textContent.replace(/^[^\w]+/,"")});}));
  $$(".nav-item").forEach(b=>b.addEventListener("click",()=>{showLibrary(b.dataset.view);$("#sidebar").classList.remove("open");}));
  $("#nowLike").addEventListener("click",()=>state.current&&toggleLike(state.current));
  $("#playBtn").addEventListener("click",()=>{if(!state.current){toast("Choose a track to start listening.");return;}if(ytPlayer&&typeof ytPlayer.getPlayerState==="function"){if(ytPlayer.getPlayerState()===1)ytPlayer.pauseVideo();else ytPlayer.playVideo();}else openVideo(state.current);});
  $("#prevBtn").addEventListener("click",()=>nextTrack(-1));$("#nextBtn").addEventListener("click",()=>nextTrack(1));
  $("#shuffleBtn").addEventListener("click",()=>{state.shuffle=!state.shuffle;$("#shuffleBtn").classList.toggle("active",state.shuffle);toast(state.shuffle?"Shuffle on":"Shuffle off");});
  $("#repeatBtn").addEventListener("click",()=>{state.repeat=!state.repeat;$("#repeatBtn").classList.toggle("active",state.repeat);toast(state.repeat?"Repeat on":"Repeat off");});
  $("#openVideoBtn").addEventListener("click",()=>state.current?openVideo(state.current):toast("Choose a track first."));
  $("#queueBtn").addEventListener("click",()=>toast(state.queue.length?`${state.queue.length} tracks in the current queue.`:"Your queue is empty."));
  $("#volumeSlider").addEventListener("input",e=>{if(ytPlayer&&typeof ytPlayer.setVolume==="function")ytPlayer.setVolume(Number(e.target.value));});
  $("#progressTrack").addEventListener("click",e=>{if(!ytPlayer||typeof ytPlayer.getDuration!=="function")return;const duration=ytPlayer.getDuration()||0;if(!duration)return;const rect=e.currentTarget.getBoundingClientRect();ytPlayer.seekTo(Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*duration,true);});
  $("#seeAllBtn").addEventListener("click",()=>$("#searchInput").focus());
  $("#menuBtn").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
  $("#backBtn").addEventListener("click",()=>history.length>1?history.back():toast("You're at the start."));
  $("#forwardBtn").addEventListener("click",()=>history.forward());
  $("#year").textContent=new Date().getFullYear();$("#likeCount").textContent=state.liked.length;
  // No downloader for YouTube audio is included. Direct downloads should be provided only for files you own or have permission to distribute.
})();