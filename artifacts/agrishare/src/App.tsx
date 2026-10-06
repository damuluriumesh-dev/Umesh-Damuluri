import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, FormEvent, ChangeEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { Route, Switch, Link, useLocation, Router as WouterRouter } from 'wouter';
import {
  useHealthCheck, useListEquipment, getListEquipmentQueryKey, useGetEquipment, getGetEquipmentQueryKey,
  useCreateEquipment, useCreateReview, useExpressGroupInterest, useFindReplacements, getFindReplacementsQueryKey,
  useEstimatePrice, useRecommendEquipment, useGetNearbyEquipment, getGetNearbyEquipmentQueryKey,
  useListBookings, getListBookingsQueryKey, useCreateBooking, useGetDashboard, getGetDashboardQueryKey,
  useCreatePurchase, useContactOwner, useCompleteImageUpload,
} from '@workspace/api-client-react';
import type { Equipment, EquipmentInput, BookingInput, PriceEstimateInput, RecommendationInput, ReviewInput } from '@workspace/api-client-react';
import { ArrowRight, BadgeCheck, CalendarDays, Check, CircleHelp, Clock3, Compass, FilePlus2, Gauge, Handshake, ImagePlus, MapPin, Menu, Search, ShieldCheck, Sprout, Star, Tractor, Wrench, X } from 'lucide-react';
import './index.css';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }

const money = (n?: number) => typeof n === 'number' ? `₹${new Intl.NumberFormat('en-IN').format(n)}` : '—';
const categoryImage = (category = '') => /harvest|combine/i.test(category) ? '/combine.jpg' : /tiller|cultiv/i.test(category) ? '/tiller.jpg' : '/tractor.jpg';
const machineImage = (e: Equipment) => e.images?.[0] || categoryImage(e.category);
const safeError = (err: unknown) => err instanceof Error ? err.message : 'Something went wrong. Please try again.';

function Header() {
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  return <header className="topbar"><div className="shell nav">
    <Link href="/" className="brand"><span className="brand-mark"><Sprout size={21}/></span>AgriShare</Link>
    <nav className="nav-links" aria-label="Main navigation">
      <Link href="/marketplace">Marketplace</Link><Link href="/finder">Equipment finder</Link><Link href="/nearby">Near me</Link><Link href="/sell">Sell equipment</Link>
    </nav>
    <div className="actions">
      <Link className="btn ghost" href="/dashboard">{isSignedIn ? (user?.firstName || 'My farm') : 'Dashboard'}</Link>
      {isSignedIn ? <><Link href="/dashboard" className="profile-chip" aria-label={`Open profile for ${user?.fullName || 'your account'}`}>{(user?.firstName?.[0] || user?.emailAddresses[0]?.emailAddress[0] || 'F').toUpperCase()}</Link><button className="btn secondary" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-logout"><X size={15}/> Log out</button></> : <Link href="/sign-in" className="btn" data-testid="link-sign-in">Sign in</Link>}
      <button className="mobile-menu btn ghost" aria-label="Toggle navigation" onClick={() => setOpen(!open)}><Menu size={18}/></button>
    </div>
  </div>{open && <div className="mobile-menu-panel shell">{[['Marketplace','/marketplace'],['Equipment finder','/finder'],['Near me','/nearby'],['Sell equipment','/sell'],['Dashboard','/dashboard']].map(([t,p])=><Link key={p} href={p} onClick={()=>setOpen(false)}>{t}</Link>)}</div>}</header>;
}
function Layout({ children }: { children: ReactNode }) { return <><Header/>{children}<Footer/></>; }
function Footer() { return <footer className="footer"><div className="shell footer-inner"><div><Link href="/" className="brand" style={{color:'#f7f2e5'}}><span className="brand-mark"><Sprout size={20}/></span>AgriShare</Link><p>Good equipment. Shared opportunity.</p></div><div className="actions"><Link className="text-link" href="/marketplace" style={{color:'#d4dfd0'}}>Browse machinery</Link><Link className="text-link" href="/sell" style={{color:'#d4dfd0'}}>List your equipment</Link></div><p>Built for the people who grow India.</p></div></footer>; }
function PageShell({ children }: { children: ReactNode }) { return <main className="page"><div className="shell">{children}</div></main>; }
function Eyebrow({ children }: { children: ReactNode }) { return <div className="eyebrow">{children}</div>; }
function LoadingCards() { return <div className="cards">{[1,2,3].map(i=><div key={i} className="equipment-card"><div className="skeleton" style={{height:210,borderRadius:0}}/><div className="equip-body"><div className="skeleton" style={{height:18,width:'70%'}}/><div className="skeleton" style={{height:12,width:'45%',marginTop:14}}/><div className="skeleton" style={{height:32,marginTop:22}}/></div></div>)}</div>; }
function QueryError({ error, retry }: { error: unknown; retry: () => void }) { return <div className="error-box"><CircleHelp size={25}/><h3>We couldn’t load that just now</h3><p>{safeError(error)}</p><button className="btn" onClick={retry}>Try again</button></div>; }
function EquipmentCard({ equipment }: { equipment: Equipment }) {
  return <article className="equipment-card" data-testid={`card-equipment-${equipment.id}`}>
    <Link href={`/equipment/${equipment.id}`} style={{textDecoration:'none',color:'inherit'}}>
      <div className="equip-image"><img src={machineImage(equipment)} alt={equipment.name} onError={(e)=>{e.currentTarget.src=categoryImage(equipment.category)}}/><span className="pill image-pill">{equipment.condition}</span></div>
    </Link>
    <div className="equip-body"><div className="equip-title-row"><Link href={`/equipment/${equipment.id}`} className="equip-title text-link">{equipment.name}</Link><span className="rating"><Star size={14} fill="#d39b36" color="#d39b36"/>{Number(equipment.rating || 0).toFixed(1)}</span></div>
      <div className="equip-meta"><MapPin size={13}/>{equipment.location} <span>·</span>{equipment.distanceKm} km away</div>
      <div className="price-row"><div><div className="price">{money(equipment.buyPrice)} <small>buy</small></div><div style={{fontSize:12,color:'#738071',marginTop:4}}>{money(equipment.rentalPrice)} / day</div></div><Link href={`/equipment/${equipment.id}`} className="btn secondary" aria-label={`View ${equipment.name}`}>View <ArrowRight size={15}/></Link></div>
    </div>
  </article>;
}
function Home() {
  const health = useHealthCheck();
  const { data, isLoading, isError, error, refetch } = useListEquipment({ transaction:'all' }, { query:{ queryKey:getListEquipmentQueryKey({transaction:'all'}), staleTime:60_000 } });
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState(()=>new URLSearchParams(window.location.search).get('search') || '');
  const goSearch = (e: FormEvent) => { e.preventDefault(); setLocation(`/marketplace${search ? `?search=${encodeURIComponent(search)}` : ''}`); };
  return <Layout>
    <section className="hero"><div className="shell"><div className="hero-content"><Eyebrow>Machinery, made more reachable</Eyebrow><h1>Better tools.<br/><span>Stronger harvests.</span></h1><p>Buy, rent or share trusted farm equipment from people who work the land just like you.</p>
      <form className="hero-search" onSubmit={goSearch}><Search size={18}/><input aria-label="Search machinery" data-testid="input-hero-search" placeholder="Try “tractor”, “tiller” or your village" value={search} onChange={e=>setSearch(e.target.value)}/><button className="btn amber" type="submit">Find equipment <ArrowRight size={16}/></button></form>
      <div className="hero-note"><BadgeCheck size={15}/>Real local owners · Transparent prices · Neighbourhood-first</div>
    </div></div></section>
    <div className="trust-strip"><div className="shell trust-inner">{[[ShieldCheck,'Verified local owners'],[Handshake,'Share the cost together'],[MapPin,'Find it close to home'],[Wrench,'Equipment with a history']].map(([Icon,label]: any)=><div className="trust-item" key={label}><Icon size={20} className="trust-icon"/>{label}</div>)}</div></div>
    <section className="section"><div className="shell"><div className="section-head"><div><Eyebrow>Ready for the field</Eyebrow><h2>Equipment farmers are finding</h2><p>Good machines, cared for by people nearby.</p></div><Link className="btn ghost" href="/marketplace">Explore marketplace <ArrowRight size={15}/></Link></div>
      {isLoading ? <LoadingCards/> : isError ? <QueryError error={error} retry={()=>refetch()}/> : data?.length ? <div className="cards">{data.slice(0,3).map(e=><EquipmentCard equipment={e} key={e.id}/>)}</div> : <Empty message="New listings are on their way. Check the marketplace soon."/>}
    </div></section>
    <section className="section feature-band"><div className="shell feature-inner"><div><Eyebrow>Big tools. Shared plans.</Eyebrow><h2 style={{fontSize:42,letterSpacing:-2,margin:'14px 0'}}>A smarter way to equip your farm.</h2><p style={{color:'#586e59',lineHeight:1.7,maxWidth:500}}>Find a machine that fits the season, split a purchase with nearby farmers, or earn from equipment sitting idle between jobs.</p><div className="feature-list">{[[Tractor,'Choose what works for your crop and budget'],[Handshake,'Group up on equipment that costs more'],[Gauge,'Know the price before you buy or sell']].map(([I,t]:any)=><div className="feature-point" key={t}><div className="point-icon"><I size={18}/></div><div style={{fontWeight:700,color:'#35513a'}}>{t}</div></div>)}</div><Link className="btn" href="/finder" style={{marginTop:25}}>Find the right equipment <ArrowRight size={15}/></Link></div><div className="feature-photo" role="img" aria-label="Farm machinery ready for work"/></div></section>
    <section className="section"><div className="shell" style={{textAlign:'center'}}><Eyebrow>Make every machine count</Eyebrow><h2 style={{fontSize:38,letterSpacing:-1.5,margin:'13px 0'}}>Have equipment to share?</h2><p style={{color:'#718073',maxWidth:540,margin:'0 auto 22px'}}>Put your machine to work on more fields. Reach nearby farmers and set a fair price in minutes.</p><Link href="/sell" className="btn">List your equipment <FilePlus2 size={16}/></Link></div></section>
    <div aria-live="polite" className="shell" style={{paddingBottom:24}}>{health.isError && <p style={{fontSize:12,color:'#9d6031'}}>Live marketplace connection is unavailable. Please retry in a moment.</p>}</div>
  </Layout>;
}
function Empty({ message }: { message: string }) { return <div className="empty"><Sprout size={26}/><h3>A little room to grow</h3><p>{message}</p></div>; }
function Marketplace() {
  const [search,setSearch]=useState('');const [category,setCategory]=useState('');const [transaction,setTransaction]=useState<'all'|'buy'|'rent'>('all');const [location,setLoc]=useState('');const [maxPrice,setMaxPrice]=useState('');
  const params=useMemo(()=>({search:search||undefined,category:category||undefined,transaction,location:location||undefined,maxPrice:maxPrice?Number(maxPrice):undefined}),[search,category,transaction,location,maxPrice]);
  const q=useListEquipment(params,{query:{queryKey:getListEquipmentQueryKey(params),staleTime:30_000}});
  return <Layout><PageShell><Eyebrow>Marketplace</Eyebrow><h1 className="page-title">The right machine is closer than you think.</h1><p className="page-subtitle">Search trusted farm equipment for sale or rent from your community.</p>
    <div className="filter-bar"><div className="search-field" style={{position:'relative'}}><Search size={16} style={{position:'absolute',left:12,top:13,color:'#758174'}}/><input data-testid="input-market-search" placeholder="Search equipment" value={search} onChange={e=>setSearch(e.target.value)} style={{width:'100%',paddingLeft:37}}/></div>
    <select aria-label="Transaction" value={transaction} onChange={e=>setTransaction(e.target.value as 'all'|'buy'|'rent')}><option value="all">Buy & rent</option><option value="buy">For sale</option><option value="rent">For rent</option></select>
    <select aria-label="Category" value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{['Tractor','Harvester','Rotavator','Seeder','Rice Transplanter','Water Pump','Sprayer','Other'].map(c=><option key={c}>{c}</option>)}</select>
    <input aria-label="Location" placeholder="Village or district" value={location} onChange={e=>setLoc(e.target.value)}/>
    <input aria-label="Maximum price" type="number" placeholder="Max ₹" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} style={{width:115}}/>
    <button className="btn ghost" onClick={()=>{setSearch('');setCategory('');setTransaction('all');setLoc('');setMaxPrice('')}}>Clear</button></div>
    {q.isLoading?<LoadingCards/>:q.isError?<QueryError error={q.error} retry={()=>q.refetch()}/>:q.data?.length?<><p style={{color:'#728073',fontSize:13,marginBottom:14}}>{q.data.length} listings found</p><div className="cards">{q.data.map(e=><EquipmentCard key={e.id} equipment={e}/>)}</div></>:<Empty message="Try another search or clear a filter to see more local listings."/>}
  </PageShell></Layout>;
}
function EquipmentDetail({ id }: { id:string }) {
  const q=useGetEquipment(id,{query:{queryKey:getGetEquipmentQueryKey(id)}});
  const replacements=useFindReplacements(id,{query:{enabled:!!id,queryKey:getFindReplacementsQueryKey(id)}});
  const group=useExpressGroupInterest();const review=useCreateReview();const purchase=useCreatePurchase();const contact=useContactOwner();const client=useQueryClient();const {isSignedIn}=useUser();
  const [comment,setComment]=useState('');const [rating,setRating]=useState('5');const [notice,setNotice]=useState('');
  const [contactOpen,setContactOpen]=useState(false);const [contactMessage,setContactMessage]=useState('');
  const submitReview=(e:FormEvent)=>{e.preventDefault();const payload:ReviewInput={rating:Number(rating),comment:comment.trim()};if(payload.comment.length<3)return;review.mutate({id,data:payload},{onSuccess:()=>{setComment('');setNotice('Your review has been added.');client.invalidateQueries({queryKey:getGetEquipmentQueryKey(id)});},onError:err=>setNotice(safeError(err))})};
  const sendContact=(e:FormEvent)=>{e.preventDefault();contact.mutate({id,data:{message:contactMessage.trim()}},{onSuccess:()=>{setContactMessage('');setContactOpen(false);setNotice('Your message was sent to the equipment owner.');client.invalidateQueries({queryKey:getGetDashboardQueryKey()});},onError:err=>setNotice(safeError(err))})};
  const reservePurchase=()=>{if(!window.confirm('Reserve this equipment at the listed price? No payment will be collected in this demo.'))return;purchase.mutate({id},{onSuccess:(result)=>{setNotice(`${result.equipmentName} is reserved. Contact the owner to arrange payment and pickup.`);client.invalidateQueries({queryKey:getGetEquipmentQueryKey(id)});client.invalidateQueries({queryKey:getGetDashboardQueryKey()});client.invalidateQueries({queryKey:getListEquipmentQueryKey()});},onError:err=>setNotice(safeError(err))})};
  if(q.isLoading)return <Layout><PageShell><div className="skeleton" style={{height:380}}/></PageShell></Layout>;
  if(q.isError||!q.data)return <Layout><PageShell><QueryError error={q.error} retry={()=>q.refetch()}/></PageShell></Layout>;
  const e=q.data;
  return <Layout><PageShell><Link href="/marketplace" className="text-link">← Back to marketplace</Link><div className="detail-grid" style={{marginTop:20}}><div>
    <div className="detail-photo"><img src={machineImage(e)} alt={e.name} onError={ev=>{ev.currentTarget.src=categoryImage(e.category)}}/></div>
    <div className="detail-info"><span className="pill">{e.category} · {e.condition}</span><h1>{e.name}</h1><div className="equip-meta"><MapPin size={15}/>{e.location} · {e.distanceKm} km away <span>·</span><Star size={14} fill="#d39b36" color="#d39b36"/>{Number(e.rating).toFixed(1)} ({e.reviews?.length||0} reviews)</div><p>{e.description}</p>
    <div className="stat-grid" style={{gridTemplateColumns:'repeat(3,1fr)'}}><div className="stat"><span className="stat-label">Year</span><div className="stat-value">{e.year}</div></div><div className="stat"><span className="stat-label">Usage hours</span><div className="stat-value">{e.usageHours.toLocaleString('en-IN')}</div></div><div className="stat"><span className="stat-label">Owner trust</span><div className="stat-value">{e.ownerTrust}</div></div></div>
    <div className="panel"><h3><Wrench size={17} style={{verticalAlign:'middle',marginRight:8}}/>Maintenance history</h3>{e.maintenanceHistory?.length?<ul style={{paddingLeft:19,color:'#68786a',lineHeight:1.8}}>{e.maintenanceHistory.map((x,i)=><li key={i}>{x}</li>)}</ul>:<p style={{color:'#728073'}}>No maintenance notes have been shared yet.</p>}</div>
    <div className="panel" style={{marginTop:18}}><h3>Reviews from the community</h3>{e.reviews?.length?e.reviews.map(r=><div className="nearby-row" key={r.id}><div><strong>{r.author}</strong><div style={{fontSize:13,color:'#6e7b6f',marginTop:5}}>{r.comment}</div></div><span className="rating"><Star size={13} fill="#d39b36" color="#d39b36"/>{r.rating}</span></div>):<p style={{color:'#728073'}}>No reviews yet. Share your experience with this owner.</p>}
      <form onSubmit={submitReview} style={{display:'grid',gap:10,marginTop:17}}><div className="field"><label htmlFor="review-rating">Your rating</label><select id="review-rating" value={rating} onChange={ev=>setRating(ev.target.value)}>{[5,4,3,2,1].map(n=><option value={n} key={n}>{n} stars</option>)}</select></div><div className="field"><label htmlFor="review-comment">Your review</label><textarea id="review-comment" value={comment} maxLength={800} minLength={3} required rows={3} onChange={ev=>setComment(ev.target.value)} placeholder="How was the equipment and owner?"/></div>{notice&&<small role="status">{notice}</small>}<button className="btn" disabled={review.isPending}>{review.isPending?'Posting…':'Post review'}</button></form>
    </div>
    </div></div>
    <aside className="booking-card"><div className="eyebrow">Owner listing</div><div style={{fontWeight:700,fontSize:18,marginTop:10}}>{e.ownerName} <BadgeCheck size={16} color="#43834a" style={{verticalAlign:'middle'}}/></div><p style={{fontSize:13,color:'#728073',marginTop:7}}>Trusted local owner · score {e.ownerTrust}</p><div className="divider"/><div className="price">{money(e.buyPrice)} <small>to buy</small></div><div style={{fontSize:14,color:'#718073',marginTop:8}}>{money(e.rentalPrice)} / day to rent</div><div className="divider"/><span className="status">{e.availability?'Available now':'Currently unavailable'}</span>
      {e.availability ? <Link className="btn" style={{width:'100%',marginTop:17}} href={`/rent/${e.id}`}>Book a rental <CalendarDays size={16}/></Link> : <button className="btn" style={{width:'100%',marginTop:17}} disabled>Currently unavailable</button>}
      {e.availability ? (isSignedIn ? <button className="btn amber" style={{width:'100%',marginTop:9}} onClick={reservePurchase} disabled={purchase.isPending}>{purchase.isPending?'Reserving…':'Buy now'} <ArrowRight size={15}/></button> : <Link className="btn amber" style={{width:'100%',marginTop:9}} href="/sign-in">Sign in to buy <ArrowRight size={15}/></Link>) : null}
      {isSignedIn ? <button className="btn ghost" style={{width:'100%',marginTop:9}} onClick={()=>setContactOpen(true)}><Handshake size={15}/>Contact owner</button> : <Link className="btn ghost" style={{width:'100%',marginTop:9}} href="/sign-in">Sign in to contact owner</Link>}
      {isSignedIn ? <button className="btn secondary" style={{width:'100%',marginTop:9}} onClick={()=>{group.mutate({id},{onSuccess:(r)=>{setNotice(`You’re in. ${r.interestedCount} farmers interested; ${r.goal} needed.`);client.invalidateQueries({queryKey:getGetEquipmentQueryKey(id)})},onError:err=>setNotice(safeError(err))})}} disabled={group.isPending}><Handshake size={16}/>{group.isPending?'Joining…':'Join group purchase'}</button> : <Link className="btn secondary" style={{width:'100%',marginTop:9}} href="/sign-in"><Handshake size={16}/>Sign in to join group purchase</Link>}
      <div style={{textAlign:'center',fontSize:12,color:'#728073',marginTop:11}}>{e.groupInterested} farmers interested</div>
      {notice&&<p role="status" style={{fontSize:12,color:'#4d734d',marginTop:10}}>{notice}</p>}
      <div className="divider"/><details><summary style={{cursor:'pointer',fontWeight:700,fontSize:13}}>Looking for an alternative?</summary>{replacements.isLoading?<p>Finding nearby options…</p>:replacements.isError?<p>Could not load alternatives.</p>:replacements.data?.length?replacements.data.slice(0,3).map(item=><div className="nearby-row" key={item.id}><div><b>{item.name}</b><div style={{fontSize:12,color:'#738071'}}>{item.location} · {item.distanceKm} km</div></div><b>{money(item.buyPrice)}</b></div>):<p style={{fontSize:13,color:'#728073'}}>No nearby replacements listed yet.</p>}</details>
    </aside></div>{contactOpen&&<div className="modal-backdrop" onClick={()=>setContactOpen(false)}><form className="contact-modal" role="dialog" aria-modal="true" aria-labelledby="contact-title" onClick={e=>e.stopPropagation()} onSubmit={sendContact}><button type="button" className="modal-close" aria-label="Close" onClick={()=>setContactOpen(false)}><X size={18}/></button><Eyebrow>Message the owner</Eyebrow><h2 id="contact-title" style={{margin:'12px 0 8px'}}>{e.ownerName}</h2><p style={{color:'#718073'}}>Ask a question about {e.name}, availability, or pickup arrangements.</p><div className="field"><label htmlFor="owner-message">Your message</label><textarea id="owner-message" minLength={3} maxLength={1000} required rows={5} value={contactMessage} onChange={event=>setContactMessage(event.target.value)} placeholder="Hello, I’m interested in this equipment…"/></div><button className="btn" style={{marginTop:16}} disabled={contact.isPending}>{contact.isPending?'Sending…':'Send message'} <ArrowRight size={15}/></button></form></div>}</PageShell></Layout>;
}
function Rent({ id }: {id:string}) {
  const q=useGetEquipment(id,{query:{queryKey:getGetEquipmentQueryKey(id)}});const create=useCreateBooking();const client=useQueryClient();const [start,setStart]=useState('');const [end,setEnd]=useState('');const [message,setMessage]=useState('');
  const days=start&&end?Math.max(0,Math.ceil((new Date(end).getTime()-new Date(start).getTime())/86400000)):0;
  const submit=(ev:FormEvent)=>{ev.preventDefault();if(!q.data||days<1){setMessage('Choose an end date after your start date.');return}const payload:BookingInput={equipmentId:id,startDate:start,endDate:end};create.mutate({data:payload},{onSuccess:()=>{setMessage('Booking request sent to the owner.');client.invalidateQueries({queryKey:getListBookingsQueryKey()});client.invalidateQueries({queryKey:getGetDashboardQueryKey()})},onError:err=>setMessage(safeError(err))})};
  if(q.isLoading)return <Layout><PageShell><div className="skeleton" style={{height:350}}/></PageShell></Layout>;
  if(q.isError||!q.data)return <Layout><PageShell><QueryError error={q.error} retry={()=>q.refetch()}/></PageShell></Layout>;
  const e=q.data;return <Layout><PageShell><Link href={`/equipment/${id}`} className="text-link">← Equipment details</Link><div className="detail-grid" style={{marginTop:22}}><div><Eyebrow>Rental checkout</Eyebrow><h1 className="page-title">Book it for the work ahead.</h1><p className="page-subtitle">Request a date range from {e.ownerName}. The owner will confirm availability.</p><div className="panel"><div style={{display:'flex',gap:16,alignItems:'center'}}><img src={machineImage(e)} alt="" style={{width:115,height:88,objectFit:'cover',borderRadius:12}}/><div><b>{e.name}</b><div style={{fontSize:13,color:'#738071',marginTop:6}}><MapPin size={13} style={{verticalAlign:'middle'}}/> {e.location}</div><div className="price" style={{fontSize:16,marginTop:8}}>{money(e.rentalPrice)} <small>/ day</small></div></div></div></div></div>
    <form onSubmit={submit} className="booking-card"><h3>Choose your dates</h3><div className="field"><label htmlFor="start-date">Start date</label><input id="start-date" required type="date" min={new Date().toISOString().slice(0,10)} value={start} onChange={ev=>setStart(ev.target.value)}/></div><div className="field" style={{marginTop:14}}><label htmlFor="end-date">End date</label><input id="end-date" required type="date" min={start||new Date().toISOString().slice(0,10)} value={end} onChange={ev=>setEnd(ev.target.value)}/></div><div className="divider"/><div className="nearby-row"><span>Rental duration</span><b>{days||0} days</b></div><div className="nearby-row"><span>Estimated total</span><b>{money(days*e.rentalPrice)}</b></div>{message&&<p role="status" style={{fontSize:13,color:'#4b704d',marginTop:12}}>{message}</p>}<button className="btn" style={{width:'100%',marginTop:15}} disabled={create.isPending||!e.availability}>{create.isPending?'Sending request…':'Request this booking'} <ArrowRight size={15}/></button><p style={{fontSize:11,color:'#7a867a',marginTop:11}}>No payment is collected here. Booking is confirmed by the owner.</p></form>
  </div></PageShell></Layout>;
}
function Sell() {
  const create=useCreateEquipment();const estimate=useEstimatePrice();const completeImage=useCompleteImageUpload();const client=useQueryClient();const {isSignedIn}=useUser();const [result,setResult]=useState<{low:number;high:number;suggested:number;rationale:string}|null>(null);const [notice,setNotice]=useState('');
  const [uploadedImages,setUploadedImages]=useState<string[]>([]);const [uploading,setUploading]=useState(false);
  const [form,setForm]=useState({name:'',category:'Tractor',description:'',buyPrice:'',rentalPrice:'',condition:'Good',year:'2020',usageHours:'',location:'',images:''});
  const change=(e:ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setForm({...form,[e.target.name]:e.target.value});
  const uploadImages=async(e:ChangeEvent<HTMLInputElement>)=>{const files=Array.from(e.target.files||[]);e.target.value='';if(!files.length)return;if(!isSignedIn){setNotice('Sign in before uploading listing images.');return}setUploading(true);setNotice('Uploading your images…');try{for(const file of files){if(!file.type.startsWith('image/')||file.size>10*1024*1024)throw new Error('Choose image files smaller than 10 MB.');const response=await fetch(`${basePath}/api/storage/uploads/request-url`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,size:file.size,contentType:file.type})});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'Could not start the image upload.')}const {uploadURL,objectPath}=await response.json() as {uploadURL:string;objectPath:string};const uploaded=await fetch(uploadURL,{method:'PUT',body:file,headers:{'Content-Type':file.type}});if(!uploaded.ok)throw new Error('The image could not be uploaded. Please retry.');const saved=await completeImage.mutateAsync({data:{objectPath}});setUploadedImages(current=>[...current,saved.imageUrl]);}setNotice('Image upload complete.');}catch(err){setNotice(safeError(err));}finally{setUploading(false)}};
  const priceInput=():PriceEstimateInput=>({category:form.category,year:Number(form.year),usageHours:Number(form.usageHours||0),condition:form.condition as PriceEstimateInput['condition']});
  const askEstimate=()=>{if(Number(form.year)<1970||!form.category){setNotice('Add a category and valid year for an estimate.');return}estimate.mutate({data:priceInput()},{onSuccess:setResult,onError:err=>setNotice(safeError(err))})};
  const submit=(e:FormEvent)=>{e.preventDefault();if(!isSignedIn){setNotice('Sign in to publish an equipment listing.');return}const payload:EquipmentInput={name:form.name.trim(),category:form.category,description:form.description.trim(),buyPrice:Number(form.buyPrice),rentalPrice:Number(form.rentalPrice),condition:form.condition as EquipmentInput['condition'],year:Number(form.year),usageHours:Number(form.usageHours),location:form.location.trim(),images:[...uploadedImages,...(form.images.trim()?form.images.split(',').map(x=>x.trim()).filter(Boolean):[])]};
    if(payload.name.length<2||payload.description.length<10||!payload.location||payload.buyPrice<0||payload.rentalPrice<0){setNotice('Please complete all required fields. Description must be at least 10 characters.');return}
    create.mutate({data:payload},{onSuccess:()=>{setNotice('Your equipment is listed.');client.invalidateQueries({queryKey:getListEquipmentQueryKey()});setForm({...form,name:'',description:'',buyPrice:'',rentalPrice:'',usageHours:'',location:'',images:''});setUploadedImages([]);},onError:err=>setNotice(safeError(err))});};
  return <Layout><PageShell><Eyebrow>Sell or rent</Eyebrow><h1 className="page-title">Give your machine more work.</h1><p className="page-subtitle">Tell nearby farmers what you have. Start with a fair estimate, then set your price.</p>
    <div className="two-col"><form className="panel" onSubmit={submit}><h3>Equipment details</h3><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
      <div className="field"><label htmlFor="name">Equipment name *</label><input id="name" name="name" value={form.name} onChange={change} minLength={2} required placeholder="e.g. Mahindra 575 DI"/></div>
      <div className="field"><label htmlFor="category">Category *</label><select id="category" name="category" value={form.category} onChange={change}>{['Tractor','Harvester','Rotavator','Seeder','Rice Transplanter','Water Pump','Sprayer','Other'].map(c=><option key={c}>{c}</option>)}</select></div>
      <div className="field"><label htmlFor="condition">Condition *</label><select id="condition" name="condition" value={form.condition} onChange={change}>{['New','Excellent','Good','Fair'].map(c=><option key={c}>{c}</option>)}</select></div>
      <div className="field"><label htmlFor="year">Year *</label><input id="year" name="year" type="number" min="1970" max={new Date().getFullYear()+1} value={form.year} onChange={change} required/></div>
      <div className="field"><label htmlFor="usageHours">Usage hours *</label><input id="usageHours" name="usageHours" type="number" min="0" value={form.usageHours} onChange={change} required placeholder="e.g. 1240"/></div>
      <div className="field"><label htmlFor="location">Village / district *</label><input id="location" name="location" value={form.location} onChange={change} required placeholder="e.g. Ludhiana, Punjab"/></div>
      <div className="field"><label htmlFor="buyPrice">Sale price (₹) *</label><input id="buyPrice" name="buyPrice" type="number" min="0" value={form.buyPrice} onChange={change} required placeholder="₹"/></div>
      <div className="field"><label htmlFor="rentalPrice">Rental price per day (₹) *</label><input id="rentalPrice" name="rentalPrice" type="number" min="0" value={form.rentalPrice} onChange={change} required placeholder="₹"/></div>
      <div className="field" style={{gridColumn:'1/-1'}}><label htmlFor="description">Description * (10–800 characters)</label><textarea id="description" name="description" value={form.description} onChange={change} required minLength={10} maxLength={800} rows={4} placeholder="Share what makes this machine dependable…"/></div>
      <div className="field" style={{gridColumn:'1/-1'}}><label htmlFor="listing-images">Upload equipment images</label><input id="listing-images" type="file" accept="image/*" multiple onChange={uploadImages} disabled={uploading}/><small style={{color:'#728073'}}>Up to 10 MB per image. Uploaded images are saved with this listing.</small>{uploading&&<div className="upload-status" role="status">Uploading images…</div>}{uploadedImages.length>0&&<div className="image-previews">{uploadedImages.map((src,index)=><div key={`${src}-${index}`} className="image-preview"><img src={src} alt={`Uploaded equipment ${index+1}`}/><button type="button" aria-label="Remove uploaded image" onClick={()=>setUploadedImages(current=>current.filter((_,i)=>i!==index))}><X size={14}/></button></div>)}</div>}</div>
      <div className="field" style={{gridColumn:'1/-1'}}><label htmlFor="images">Image URLs (optional, comma separated)</label><input id="images" name="images" value={form.images} onChange={change} placeholder="https://…"/></div>
    </div>{notice&&<p role="status" style={{color:'#4c754d',marginTop:14,fontSize:13}}>{notice}</p>}<button className="btn" type="submit" style={{marginTop:12}} disabled={create.isPending||uploading}>{create.isPending?'Publishing…':uploading?'Uploading images…':'Publish listing'} <ArrowRight size={15}/></button>{!isSignedIn&&<p style={{fontSize:12,color:'#728073',marginTop:11}}>You need to <Link href="/sign-in" className="text-link">sign in</Link> to publish a listing.</p>}</form>
    <aside><div className="panel" style={{background:'#e9efdf'}}><div className="eyebrow">A fair starting point</div><h3 style={{marginTop:12}}>Get a local price estimate</h3><p style={{color:'#647565',fontSize:13,lineHeight:1.6}}>Based on category, year, condition and hours. Your final price is always yours to choose.</p><button className="btn secondary" onClick={askEstimate} disabled={estimate.isPending}>{estimate.isPending?'Checking…':'Estimate my price'} <Gauge size={16}/></button>
      {result&&<div style={{marginTop:20,padding:17,borderRadius:13,background:'#fffdf7'}}><div style={{fontSize:12,color:'#738071'}}>Suggested resale range</div><div className="price" style={{marginTop:8}}>{money(result.low)} – {money(result.high)}</div><div style={{fontWeight:700,color:'#31563a',marginTop:8}}>Suggested: {money(result.suggested)}</div><p style={{fontSize:12,color:'#718073',margin:'9px 0 0'}}>{result.rationale}</p></div>}
      </div><div className="panel" style={{marginTop:16}}><h3><ShieldCheck size={17} style={{verticalAlign:'middle',marginRight:7}}/>Make a trusted listing</h3><p style={{fontSize:13,color:'#738071',lineHeight:1.7,margin:0}}>Clear photos, accurate usage hours and a useful description help your neighbours make a confident choice.</p></div></aside>
    </div></PageShell></Layout>;
}
function Finder() {
  const recommend=useRecommendEquipment();const [crop,setCrop]=useState('Wheat');const [acres,setAcres]=useState('5');const [work,setWork]=useState('Field preparation');const [budget,setBudget]=useState('250000');const [transaction,setTransaction]=useState<'buy'|'rent'>('rent');const [results,setResults]=useState<Equipment[]|null>(null);
  const submit=(e:FormEvent)=>{e.preventDefault();const input:RecommendationInput={crop,acres:Number(acres),work,budget:Number(budget),transaction};recommend.mutate({data:input},{onSuccess:setResults});};
  return <Layout><PageShell><Eyebrow>Equipment finder</Eyebrow><h1 className="page-title">Tell us what’s growing.</h1><p className="page-subtitle">We’ll match equipment to the crop, work and budget you have in mind.</p><div className="two-col"><form className="panel" onSubmit={submit}><h3>Your field, your needs</h3><div className="field"><label htmlFor="crop">What are you growing?</label><select id="crop" value={crop} onChange={e=>setCrop(e.target.value)}>{['Wheat','Rice','Cotton','Sugarcane','Maize','Pulses','Vegetables','Other'].map(c=><option key={c}>{c}</option>)}</select></div>
    <div className="field" style={{marginTop:15}}><label htmlFor="acres">How many acres?</label><input id="acres" type="number" min=".1" step=".1" value={acres} onChange={e=>setAcres(e.target.value)} required/></div>
    <div className="field" style={{marginTop:15}}><label htmlFor="work">What work needs doing?</label><select id="work" value={work} onChange={e=>setWork(e.target.value)}>{['Field preparation','Sowing','Harvesting','Irrigation','Transport','Other'].map(w=><option key={w}>{w}</option>)}</select></div>
    <div className="field" style={{marginTop:15}}><label htmlFor="budget">Budget (₹)</label><input id="budget" type="number" min="0" value={budget} onChange={e=>setBudget(e.target.value)} required/></div>
    <div className="field" style={{marginTop:15}}><label htmlFor="transaction">I’m looking to</label><select id="transaction" value={transaction} onChange={e=>setTransaction(e.target.value as 'buy'|'rent')}><option value="rent">Rent equipment</option><option value="buy">Buy equipment</option></select></div>
    <button className="btn" style={{marginTop:20}} disabled={recommend.isPending}>{recommend.isPending?'Finding a match…':'Show my matches'} <Compass size={16}/></button>{recommend.isError&&<p role="alert" style={{color:'#a24a30',fontSize:13,marginTop:12}}>{safeError(recommend.error)}</p>}</form>
    <div>{results===null?<div className="panel" style={{minHeight:330,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',textAlign:'center',background:'#e9efdf'}}><div className="point-icon" style={{width:54,height:54}}><Sprout size={25}/></div><h3 style={{margin:'17px 0 7px'}}>A good fit starts here.</h3><p style={{color:'#687b67',maxWidth:320}}>Share a few details about your season. We’ll look through local machinery and return options to consider.</p></div>:results.length?<div style={{display:'grid',gap:13}}><h3 style={{margin:'0 0 3px'}}>Your matches</h3>{results.map(e=><EquipmentCard equipment={e} key={e.id}/>)}</div>:<Empty message="No exact matches yet. Try a larger budget or a nearby type of work."/>}</div>
    </div></PageShell></Layout>;
}
function Nearby() {
  const [location,setLocation]=useState('');const [searched,setSearched]=useState('');
  const params=useMemo(()=>({location:searched||undefined}),[searched]);
  const q=useGetNearbyEquipment(params,{query:{queryKey:getGetNearbyEquipmentQueryKey(params)}});
  return <Layout><PageShell><Eyebrow>Nearby machinery</Eyebrow><h1 className="page-title">Good equipment, around the corner.</h1><p className="page-subtitle">Find available machinery near your village or district.</p><form className="filter-bar" onSubmit={e=>{e.preventDefault();setSearched(location.trim())}}><MapPin size={17} color="#567957"/><input aria-label="Search location" data-testid="input-nearby-location" placeholder="Enter village, town or district" value={location} onChange={e=>setLocation(e.target.value)} style={{flex:1}}/><button className="btn">Search nearby <Search size={15}/></button></form>
    {q.isLoading?<LoadingCards/>:q.isError?<QueryError error={q.error} retry={()=>q.refetch()}/>:q.data?.length?<div className="cards">{q.data.map(item=><article className="equipment-card" key={item.id}><Link href={`/equipment/${item.id}`}><div className="equip-image"><img src={item.image||categoryImage(item.category)} alt={item.name}/><span className="pill image-pill">{item.distanceKm} km away</span></div></Link><div className="equip-body"><h3 className="equip-title">{item.name}</h3><div className="equip-meta"><MapPin size={13}/>{item.location}</div><div className="price-row"><div><div className="price">{money(item.buyPrice)} <small>buy</small></div><div style={{fontSize:12,color:'#738071',marginTop:4}}>{money(item.rentalPrice)} / day</div></div><Link className="btn secondary" href={`/equipment/${item.id}`}>Details <ArrowRight size={14}/></Link></div></div></article>)}</div>:<Empty message="Enter a location to see local machinery, or try a nearby district."/>}
  </PageShell></Layout>;
}
function ProfileCard() {
  const {user,isLoaded}=useUser();
  const [profile,setProfile]=useState({firstName:'',lastName:'',phone:'',location:'',role:'Both'});
  const [saving,setSaving]=useState(false);const [notice,setNotice]=useState('');
  useEffect(()=>{if(!user)return;const metadata=user.unsafeMetadata as Record<string,unknown>;setProfile({firstName:user.firstName||'',lastName:user.lastName||'',phone:typeof metadata.phone==='string'?metadata.phone:'',location:typeof metadata.location==='string'?metadata.location:'',role:typeof metadata.role==='string'?metadata.role:'Both'});},[user?.id]);
  const save=async(e:FormEvent)=>{e.preventDefault();if(!user)return;setSaving(true);setNotice('');try{await user.update({firstName:profile.firstName.trim(),lastName:profile.lastName.trim(),unsafeMetadata:{...user.unsafeMetadata,phone:profile.phone.trim(),location:profile.location.trim(),role:profile.role}});setNotice('Your profile has been saved.');}catch(err){setNotice(safeError(err));}finally{setSaving(false)}};
  if(!isLoaded)return <div className="panel"><div className="skeleton" style={{height:150}}/></div>;
  if(!user)return <div className="panel"><h3>Your farmer profile</h3><p style={{color:'#718073'}}>Sign in to save your contact details and farming role.</p><Link className="btn" href="/sign-in">Sign in to your profile</Link></div>;
  return <form className="panel" onSubmit={save}><div className="eyebrow">Your farmer profile</div><h3 style={{marginTop:11}}>How neighbours can reach you</h3><div className="profile-fields">
    <div className="field"><label htmlFor="profile-first">First name</label><input id="profile-first" value={profile.firstName} onChange={e=>setProfile({...profile,firstName:e.target.value})} required maxLength={50}/></div>
    <div className="field"><label htmlFor="profile-last">Last name</label><input id="profile-last" value={profile.lastName} onChange={e=>setProfile({...profile,lastName:e.target.value})} maxLength={50}/></div>
    <div className="field"><label htmlFor="profile-phone">Phone</label><input id="profile-phone" type="tel" value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})} maxLength={20} placeholder="+91"/></div>
    <div className="field"><label htmlFor="profile-location">Village / district</label><input id="profile-location" value={profile.location} onChange={e=>setProfile({...profile,location:e.target.value})} maxLength={100} placeholder="e.g. Nashik, Maharashtra"/></div>
    <div className="field" style={{gridColumn:'1/-1'}}><label htmlFor="profile-role">I use AgriShare as</label><select id="profile-role" value={profile.role} onChange={e=>setProfile({...profile,role:e.target.value})}><option>Both</option><option>Farmer / buyer</option><option>Equipment owner / seller</option></select></div>
  </div><p style={{fontSize:12,color:'#718073',margin:'12px 0'}}>Account email: {user.primaryEmailAddress?.emailAddress||'Not provided'}</p>{notice&&<p role="status" style={{fontSize:13,color:'#4c754d'}}>{notice}</p>}<button className="btn" disabled={saving}>{saving?'Saving profile…':'Save profile'}</button></form>;
}
function Dashboard() {
  const q=useGetDashboard({query:{queryKey:getGetDashboardQueryKey()}});const bookings=useListBookings({query:{queryKey:getListBookingsQueryKey()}});
  if(q.isLoading)return <Layout><PageShell><div className="skeleton" style={{height:180}}/></PageShell></Layout>;
  if(q.isError||!q.data)return <Layout><PageShell><QueryError error={q.error} retry={()=>q.refetch()}/></PageShell></Layout>;
  const d=q.data;const stats=[['Active listings',d.activeListings],['Active rentals',d.activeRentals],['Purchases',d.purchases],['Pending requests',d.pendingRequests]];
  return <Layout><PageShell><Eyebrow>Your farm overview</Eyebrow><h1 className="page-title">Namaste, farmer.</h1><p className="page-subtitle">A quick look at your equipment, requests and community standing.</p><div className="stat-grid">{stats.map(([label,value])=><div className="stat" key={label}><span className="stat-label">{label}</span><div className="stat-value">{value}</div></div>)}</div><div style={{marginBottom:22}}><ProfileCard/></div>
    <div className="two-col"><div className="panel"><h3>Recent activity</h3>{d.recentActivity?.length?d.recentActivity.map((line,i)=><div className="activity-row" key={`${line}-${i}`}><span><span className="point-icon" style={{display:'inline-grid',verticalAlign:'middle',marginRight:10,width:29,height:29}}><Check size={14}/></span>{line}</span><Clock3 size={15} color="#849080"/></div>):<Empty message="Your updates will appear here as you list and book equipment."/>}</div><aside><div className="panel"><div className="eyebrow">Trust score</div><div className="stat-value" style={{fontSize:45}}>{d.trustScore}</div><p style={{color:'#728073',fontSize:13}}>Your care and reliability help the whole community.</p><div className="divider"/><div className="nearby-row"><span>Saved equipment</span><b>{d.savedCount}</b></div></div><div className="panel" style={{marginTop:16}}><h3>Shortcuts</h3><div style={{display:'grid',gap:9}}><Link href="/sell" className="btn secondary"><FilePlus2 size={15}/>List machinery</Link><Link href="/marketplace" className="btn ghost"><Search size={15}/>Find equipment</Link><Link href="/finder" className="btn ghost"><Compass size={15}/>Get a recommendation</Link></div></div></aside></div>
    <div className="panel" style={{marginTop:22}}><h3>Upcoming and recent bookings</h3>{bookings.isLoading?<div className="skeleton" style={{height:90}}/>:bookings.isError?<QueryError error={bookings.error} retry={()=>bookings.refetch()}/>:bookings.data?.length?bookings.data.map(b=><div className="nearby-row" key={b.id}><div><b>{b.equipmentName}</b><div style={{fontSize:12,color:'#738071',marginTop:5}}>{b.startDate} – {b.endDate} · {b.location}</div></div><div style={{textAlign:'right'}}><span className={`status ${b.status==='Requested'?'pending':''}`}>{b.status}</span><div style={{fontWeight:700,marginTop:7}}>{money(b.totalPrice)}</div></div></div>):<Empty message="Your rental bookings will show up here."/>}</div>
  </PageShell></Layout>;
}
function AuthPage({signUp=false}:{signUp?:boolean}) { return <main className="auth-panel"><div className="auth-card"><Link href="/" className="brand" style={{marginBottom:22}}><span className="brand-mark"><Sprout size={21}/></span>AgriShare</Link><h1 style={{fontSize:27,letterSpacing:-1,marginBottom:7}}>{signUp?'Join your farming community':'Welcome back'}</h1><p style={{color:'#748071',marginBottom:23}}>{signUp?'Create an account to share equipment and opportunity.':'Sign in to manage your equipment and bookings.'}</p>{signUp?<SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/>:<SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/>}</div></main>; }
function NotFound() { return <Layout><PageShell><div className="empty"><CircleHelp size={27}/><h3>We couldn’t find that page.</h3><p>Let’s get you back to equipment that works.</p><Link className="btn" href="/">Back to AgriShare</Link></div></PageShell></Layout>; }
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const priorUser = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const nextUser = user?.id ?? null;
    if (priorUser.current !== undefined && priorUser.current !== nextUser) client.clear();
    priorUser.current = nextUser;
  }), [addListener, client]);
  return null;
}
function Routes() {
  return <Switch>
    <Route path="/" component={Home}/><Route path="/marketplace" component={Marketplace}/><Route path="/sell" component={Sell}/><Route path="/finder" component={Finder}/><Route path="/dashboard" component={Dashboard}/><Route path="/nearby" component={Nearby}/>
    <Route path="/equipment/:id">{params=><EquipmentDetail id={params.id}/>}</Route><Route path="/rent/:id">{params=><Rent id={params.id}/>}</Route>
    <Route path="/sign-in/*?"><AuthPage/></Route><Route path="/sign-up/*?"><AuthPage signUp/></Route><Route component={NotFound}/>
  </Switch>;
}
function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    routerPush={to=>setLocation(stripBase(to))}
    routerReplace={to=>setLocation(stripBase(to),{replace:true})}
    appearance={{variables:{colorPrimary:'#245638',colorForeground:'#203729',colorMutedForeground:'#718073',colorBackground:'#fffdf7',colorInput:'#fffefa',colorInputForeground:'#203729',colorDanger:'#a94232',colorNeutral:'#deded1',fontFamily:'DM Sans, sans-serif',borderRadius:'0.75rem'}}}>
    <ClerkQueryClientCacheInvalidator/><Routes/>
  </ClerkProvider>;
}
function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <WouterRouter base={basePath}><QueryClientProvider client={queryClient}><ClerkRoutes/></QueryClientProvider></WouterRouter>;
}
export default App;
