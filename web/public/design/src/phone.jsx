// PHONE SCREENS — mobile-first, even lower density

function PhoneFrame({ phoneScreen, setPhoneScreen }) {
  const screens = {
    today:   PhoneToday,
    create:  PhoneCreate,
    plan:    PhonePlan,
    lesson:  PhoneLesson,
    library: PhoneLibrary,
  };
  const Screen = screens[phoneScreen] || PhoneToday;

  const titles = {
    today:   { t: 'Today',    zh: '今日' },
    create:  { t: 'Create',   zh: '创建' },
    plan:    { t: 'Plan',     zh: '计划' },
    lesson:  { t: 'Lesson',   zh: '课' },
    library: { t: 'Library',  zh: '文库' },
  };
  const title = titles[phoneScreen] || titles.today;
  const showTopbar = phoneScreen !== 'lesson';
  const showTabbar = phoneScreen !== 'lesson';

  return (
    <div className="phone">
      <div className="phone-screen">
        {/* status bar */}
        <div className="phone-statusbar">
          <span>9:41</span>
          <span className="sb-right">
            <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><rect x="0" y="6" width="3" height="5" rx="0.5"/><rect x="4" y="4" width="3" height="7" rx="0.5"/><rect x="8" y="2" width="3" height="9" rx="0.5"/><rect x="12" y="0" width="3" height="11" rx="0.5"/></svg>
            <svg width="22" height="11" viewBox="0 0 22 11" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="18" height="10" rx="2"/><rect x="2" y="2" width="15" height="7" rx="1" fill="currentColor"/><path d="M20 4 V7" strokeLinecap="round"/></svg>
          </span>
        </div>

        {/* top bar */}
        {showTopbar && (
          <div className="phone-topbar">
            <div className="title">
              {title.t}
            </div>
            <button className="icon-btn"><Glyph name="search" size={16}/></button>
            <button className="icon-btn dot"><Glyph name="bell" size={16}/></button>
          </div>
        )}

        {/* main */}
        <div className="phone-main">
          <Screen setPhoneScreen={setPhoneScreen}/>
        </div>

        {/* fab for create */}
        {showTabbar && phoneScreen !== 'create' && (
          <button className="phone-fab" onClick={() => setPhoneScreen('create')}>
            <Glyph name="plus" size={22}/>
          </button>
        )}

        {/* tab bar */}
        {showTabbar && (
          <div className="phone-tabbar">
            {[
              { id:'today',   label:'Today',   icon:'home' },
              { id:'plan',    label:'Plan',    icon:'layers' },
              { id:'create',  label:'',        icon:'plus', isFab: true },
              { id:'library', label:'Library', icon:'book' },
              { id:'settings',label:'Me',      icon:'settings' },
            ].map(t => (
              <button key={t.id}
                className={`phone-tab ${phoneScreen === t.id ? 'active' : ''} ${t.isFab ? 'fab-spacer' : ''}`}
                onClick={() => !t.isFab && setPhoneScreen(t.id)}
                style={t.isFab ? {visibility: 'hidden'} : {}}>
                <Glyph name={t.icon} size={20}/>
                <span className="tab-label">{t.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PhoneToday({ setPhoneScreen }) {
  const t = DATA.today;
  return (
    <div>
      <div className="muted small" style={{marginBottom: 4}}>Mon · Apr 20</div>
      <div className="display" style={{fontSize: 28, letterSpacing:'-0.01em', marginBottom: 18, lineHeight: 1.15}}>
        Good morning,<br/>Wei
      </div>

      {/* hero focus */}
      <div className="card-new" style={{padding: 20, marginBottom: 16}}>
        <Chip kind="accent" dot>Today's focus</Chip>
        <div className="display" style={{fontSize: 20, fontWeight: 400, margin:'12px 0 6px', lineHeight: 1.25, letterSpacing:'-0.005em'}}>
          {t.focus}
        </div>
        <div className="muted small" style={{marginBottom: 16}}>~24 min · picks up from §2.3</div>
        <button className="btn btn-primary w-full" style={{justifyContent:'center', padding: '12px'}}
          onClick={() => setPhoneScreen('lesson')}>
          <Glyph name="play" size={14}/> Begin lesson
        </button>
      </div>

      {/* compact stats */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 8, marginBottom: 24}}>
        {[
          { icon:'flame', v:'11', l:'streak' },
          { icon:'clock', v:'42m', l:'today' },
          { icon:'sparkles', v:'58%', l:'mastery' },
        ].map(s => (
          <div key={s.l} className="card-new" style={{padding: 12, textAlign:'center'}}>
            <Glyph name={s.icon} size={14}/>
            <div className="display" style={{fontSize: 18, marginTop: 4}}>{s.v}</div>
            <div className="muted tiny">{s.l}</div>
          </div>
        ))}
      </div>

      {/* reviews — single column */}
      <div style={{fontSize: 13, fontWeight: 500, color:'var(--ink-muted)', letterSpacing:'0.04em', textTransform:'uppercase', marginBottom: 10}}>
        Reviews · 4
      </div>
      <div style={{display:'grid', gap: 10, marginBottom: 24}}>
        {DATA.reviewQueue.slice(0,3).map((r) => (
          <div key={r.id} className="card-new" onClick={() => setPhoneScreen('lesson')}
               style={{padding: 14, display:'grid', gridTemplateColumns:'1fr auto', gap: 10, alignItems:'center'}}>
            <div>
              <div style={{fontSize: 14, fontWeight: 500, marginBottom: 4, lineHeight: 1.3}}>{r.title}</div>
              <div className="muted small">{r.topic} · {r.when}</div>
            </div>
            <Glyph name="arrow" size={16}/>
          </div>
        ))}
      </div>

      {/* mentor note */}
      <div className="card-new" style={{padding: 16, background:'var(--accent-soft)', borderColor:'transparent', marginBottom: 24}}>
        <div style={{display:'flex', gap: 10, alignItems:'center', marginBottom: 8}}>
          <div style={{width: 28, height: 28, borderRadius: 9, background:'var(--accent)', color:'white', display:'grid', placeItems:'center'}}>
            <Glyph name="sparkles" size={14}/>
          </div>
          <div style={{fontSize: 13, fontWeight: 500}}>From your mentor</div>
        </div>
        <div style={{fontSize: 13, lineHeight: 1.45, marginBottom: 10}}>
          Your Monday diagnostic is ready — 8 min.
        </div>
        <button className="btn btn-primary btn-sm">Start</button>
      </div>
    </div>
  );
}

function PhoneCreate({ setPhoneScreen }) {
  const [mode, setMode] = React.useState('socratic');
  return (
    <div>
      <div className="display" style={{fontSize: 24, letterSpacing:'-0.01em', marginBottom: 14, lineHeight: 1.2}}>
        What to learn today?
      </div>

      <div className="card-new" style={{padding: 16, marginBottom: 16}}>
        <textarea
          defaultValue="Why does Δ = b² − 4ac tell you how many roots?"
          style={{
            width:'100%', minHeight: 80,
            border:'none', outline:'none', resize:'none',
            background:'transparent', color:'var(--ink)',
            fontFamily:'var(--display)', fontSize: 16, lineHeight: 1.4,
            padding: 0,
          }}
        />
      </div>

      <div style={{fontSize: 12, fontWeight: 500, color:'var(--ink-muted)', letterSpacing:'0.04em', textTransform:'uppercase', marginBottom: 10}}>
        Mode
      </div>
      <div style={{display:'grid', gap: 8, marginBottom: 20}}>
        {[
          { id:'socratic', t:'Socratic', d:'I ask, you answer' },
          { id:'simulation', t:'Simulation', d:'Defend a method' },
          { id:'lecture', t:'Lecture', d:'Direct explanation' },
        ].map(m => (
          <div key={m.id} onClick={() => setMode(m.id)}
            style={{
              padding: 14,
              background: 'var(--surface)',
              border: `1px solid ${mode===m.id?'var(--accent)':'var(--line)'}`,
              borderRadius: 12,
              display:'flex', justifyContent:'space-between', alignItems:'center',
              ...(mode===m.id ? {background:'var(--accent-soft)'} : {}),
            }}>
            <div>
              <div style={{fontSize: 14, fontWeight: 500}}>{m.t}</div>
              <div className="muted small">{m.d}</div>
            </div>
            <div style={{
              width: 18, height: 18, borderRadius: 50,
              border: `1.5px solid ${mode===m.id?'var(--accent)':'var(--line-strong)'}`,
              display:'grid', placeItems:'center',
            }}>
              {mode===m.id && <div style={{width:8, height:8, borderRadius:50, background:'var(--accent)'}}/>}
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-primary w-full btn-lg" style={{justifyContent:'center'}}
        onClick={() => setPhoneScreen('lesson')}>
        <Glyph name="sparkles" size={14}/> Create lesson
      </button>
    </div>
  );
}

function PhonePlan({ setPhoneScreen }) {
  const p = DATA.plan;
  return (
    <div>
      <div className="muted small">IB Math AA HL</div>
      <div className="display" style={{fontSize: 22, letterSpacing:'-0.01em', marginBottom: 4}}>
        Study plan
      </div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 20}}>
        <span className="muted small">31.4 / 84 hours</span>
        <span className="display" style={{fontSize: 20, color:'var(--accent)'}}>58%</span>
      </div>
      <Progress value={0.37}/>

      <div style={{fontSize: 12, fontWeight: 500, color:'var(--ink-muted)', letterSpacing:'0.04em', textTransform:'uppercase', margin: '28px 0 10px'}}>
        Units
      </div>
      <div style={{display:'grid', gap: 10}}>
        {p.units.map(u => {
          const avg = u.topics.reduce((a,t)=>a+t.m,0) / Math.max(1,u.topics.length);
          return (
            <div key={u.ref} className="card-new" style={{padding: 14}} onClick={() => setPhoneScreen('lesson')}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 10}}>
                <div style={{display:'flex', gap: 10, alignItems:'baseline'}}>
                  <span className="muted small">§{u.ref}</span>
                  <span style={{fontSize: 14, fontWeight: 500}}>{u.title}</span>
                </div>
                {u.status === 'active' && <Chip kind="accent" dot>Now</Chip>}
                {u.status === 'done' && <Chip kind="ok" dot>Done</Chip>}
              </div>
              <Progress value={avg} thin/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PhoneLesson({ setPhoneScreen }) {
  const l = DATA.lesson;
  const [step, setStep] = React.useState(3);
  const total = l.steps.length;
  const cur = l.steps[step];

  return (
    <div style={{padding: '20px 20px 40px', minHeight:'100%', display:'flex', flexDirection:'column'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16}}>
        <button className="btn btn-ghost btn-sm" onClick={() => setPhoneScreen('today')}>
          <Glyph name="x" size={16}/>
        </button>
        <div className="muted tiny">Step {step+1} / {total}</div>
        <button className="btn btn-ghost btn-sm">Pause</button>
      </div>

      {/* dots */}
      <div style={{display:'flex', gap: 4, marginBottom: 24}}>
        {l.steps.map((s, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 99,
            background: i <= step ? 'var(--accent)' : 'var(--surface-3)',
          }}/>
        ))}
      </div>

      <div className="muted small" style={{marginBottom: 10}}>{cur.kind}</div>
      <div className="display" style={{fontSize: 22, lineHeight: 1.3, letterSpacing:'-0.005em', marginBottom: 16, fontWeight: 400}}>
        {cur.prompt}
      </div>
      {cur.body && <div style={{color:'var(--ink-2)', fontSize: 14, lineHeight: 1.55, marginBottom: 18}}>{cur.body}</div>}

      {cur.kind === 'Check' && (
        <div style={{display:'grid', gap: 10, marginBottom: 20}}>
          {cur.options.map((o, i) => (
            <div key={i} style={{
              padding: 14,
              border: `1px solid ${o.correct?'var(--ok)':'var(--line)'}`,
              background: o.correct ? 'color-mix(in oklch, var(--ok) 5%, white)' : 'var(--surface)',
              borderRadius: 12,
              display:'flex', gap: 12, alignItems:'center',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: 50, flexShrink: 0,
                border:'1.5px solid var(--line-strong)',
                display:'grid', placeItems:'center',
                fontSize: 11, fontWeight: 500, color:'var(--ink-muted)',
                ...(o.correct ? {borderColor:'var(--ok)', background:'var(--ok)', color:'white'} : {}),
              }}>
                {o.correct ? <Glyph name="check" size={12}/> : String.fromCharCode(65+i)}
              </div>
              <div style={{fontSize: 13, lineHeight: 1.4}}>{o.t}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{flex: 1}}/>

      <div style={{display:'flex', gap: 8, marginTop: 20}}>
        <button className="btn btn-sm" style={{flex: 1, justifyContent:'center'}}
          disabled={step===0} onClick={() => setStep(Math.max(0,step-1))}>
          ← Back
        </button>
        <button className="btn btn-primary" style={{flex: 2, justifyContent:'center', padding: '12px'}}
          onClick={() => setStep(Math.min(total-1,step+1))}>
          Next →
        </button>
      </div>
    </div>
  );
}

function PhoneLibrary({ setPhoneScreen }) {
  const [filter, setFilter] = React.useState('all');
  const items = DATA.library;
  const filtered = filter === 'all' ? items : items.filter(i => i.kind === filter);

  return (
    <div>
      <div className="display" style={{fontSize: 22, letterSpacing:'-0.01em', marginBottom: 14}}>
        Library
      </div>

      <div style={{display:'flex', gap: 6, marginBottom: 16, overflowX:'auto'}}>
        {[
          {id:'all', t:'All'},
          {id:'lesson', t:'Lessons'},
          {id:'note', t:'Notes'},
          {id:'deck', t:'Cards'},
        ].map(f => (
          <button key={f.id}
            onClick={() => setFilter(f.id)}
            className={`btn btn-sm ${filter===f.id?'btn-primary':''}`}
            style={{flexShrink: 0}}>
            {f.t}
          </button>
        ))}
      </div>

      <div style={{display:'grid', gap: 10}}>
        {filtered.map(i => (
          <div key={i.id} className="card-new" style={{padding: 14}}
               onClick={() => i.kind==='lesson' && setPhoneScreen('lesson')}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom: 8}}>
              <Chip kind={i.mastery >= 0.7 ? 'ok' : i.mastery >= 0.4 ? 'accent' : 'warn'} dot>
                {i.kind}
              </Chip>
              <span className="muted tiny">{i.when}</span>
            </div>
            <div style={{fontSize: 14, fontWeight: 500, marginBottom: 6, lineHeight: 1.3}}>{i.title}</div>
            <div style={{display:'flex', alignItems:'center', gap: 10}}>
              <div style={{flex: 1}}><Progress value={i.mastery} thin/></div>
              <span className="muted tiny">{Math.round(i.mastery*100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { PhoneFrame });
