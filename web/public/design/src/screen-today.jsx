// SCREEN — Today (modern, airy)

function ScreenToday({ setCurrent }) {
  const t = DATA.today;
  return (
    <div>
      <PageHead
        eyebrow="Mon · Apr 20, 2026"
        title="Good morning, Wei"
        zh="早上好"
        kicker="Pick up where you almost-understood yesterday. One focus today, four reviews to close the loop."
      />

      {/* Today's focus — the hero */}
      <div className="card-new" style={{padding: 28, borderColor: 'var(--line-strong)'}}>
        <div style={{display:'flex', alignItems:'center', gap: 10, marginBottom: 14}}>
          <Chip kind="accent" dot>Today's focus</Chip>
          <span className="muted small">~24 min · picks up from §2.3</span>
        </div>
        <h2 className="display" style={{fontSize: 30, fontWeight: 400, letterSpacing:'-0.01em', margin: '0 0 8px', lineHeight: 1.15}}>
          {t.focus}
        </h2>
        <div className="muted" style={{marginBottom: 20}}>{t.focusZh}</div>

        <div style={{display:'flex', gap: 10, flexWrap:'wrap'}}>
          <button className="btn btn-primary btn-lg" onClick={() => setCurrent('lesson')}>
            <Glyph name="play" size={16}/> Begin lesson
          </button>
          <button className="btn btn-lg" onClick={() => setCurrent('create')}>
            Adjust & recreate
          </button>
        </div>
      </div>

      {/* stat strip */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 14, marginTop: 20}}>
        {[
          { icon:'flame',  label:'Streak',  v:'11 days', sub:'Best: 14' },
          { icon:'clock',  label:'Today',   v:'42 min',  sub:'Goal 60' },
          { icon:'sparkles', label:'Mastery',v:'58%',    sub:'+6 this week' },
        ].map(s => (
          <div key={s.label} className="card-new" style={{padding: 16}}>
            <div style={{display:'flex', alignItems:'center', gap: 8, color: 'var(--ink-muted)', marginBottom: 8}}>
              <Glyph name={s.icon} size={14}/>
              <span className="small">{s.label}</span>
            </div>
            <div className="display" style={{fontSize: 22, letterSpacing:'-0.005em'}}>{s.v}</div>
            <div className="muted small">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Review queue */}
      <Section title="Reviews" zh="复习" tools={<a>See all</a>}>
        <div style={{display:'grid', gap: 10}}>
          {DATA.reviewQueue.slice(0,3).map((r) => (
            <div key={r.id} className="card-new hover" style={{padding: 16, display:'grid', gridTemplateColumns:'1fr auto', gap: 20, alignItems:'center', cursor:'pointer'}}
              onClick={() => setCurrent('lesson')}>
              <div>
                <div style={{display:'flex', gap: 8, alignItems:'center', marginBottom: 6}}>
                  <Chip>{r.topic}</Chip>
                  <span className="muted small">{r.when}</span>
                </div>
                <div style={{fontSize: 15, fontWeight: 500, marginBottom: 8}}>{r.title}</div>
                <div style={{display:'flex', gap: 10, alignItems:'center'}}>
                  <div style={{width: 120}}><Progress value={r.mastery} thin/></div>
                  <span className="muted small">{Math.round(r.mastery*100)}% mastered</span>
                </div>
              </div>
              <Glyph name="arrow" size={18}/>
            </div>
          ))}
        </div>
      </Section>

      {/* Mentor note */}
      <Section title="From your mentor" zh="导师留言">
        <div className="card-new" style={{padding: 20, background: 'var(--accent-soft)', borderColor: 'transparent'}}>
          <div style={{display:'flex', gap: 14, alignItems:'flex-start'}}>
            <div style={{
              width: 36, height: 36, borderRadius: 12,
              background:'var(--accent)', color:'white',
              display:'grid', placeItems:'center', flexShrink: 0,
            }}>
              <Glyph name="sparkles" size={18}/>
            </div>
            <div style={{flex: 1}}>
              <div style={{fontSize: 15, lineHeight: 1.5, color: 'var(--ink)', marginBottom: 6}}>
                Based on last week's gaps, I've prepared a 6-question diagnostic in <strong>trigonometry</strong> and <strong>quadratics</strong>. It takes 8 minutes.
              </div>
              <div style={{display:'flex', gap: 8, marginTop: 10}}>
                <button className="btn btn-primary btn-sm">Start diagnostic</button>
                <button className="btn btn-ghost btn-sm">Later</button>
              </div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

window.ScreenToday = ScreenToday;
