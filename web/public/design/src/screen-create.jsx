// SCREEN — Create (modern, airy)

function ScreenCreate({ setCurrent }) {
  const [mode, setMode] = React.useState('socratic');
  const [query, setQuery] = React.useState("I keep panicking on the discriminant — why does Δ = b² − 4ac tell you how many roots?");

  const modes = [
    { id:'socratic',   t:'Socratic',     d:'I ask, you answer' },
    { id:'simulation', t:'Simulation',   d:'Defend against a flaw' },
    { id:'lecture',    t:'Lecture',      d:'Direct explanation' },
    { id:'oral',       t:'Oral defence', d:'You teach, I test' },
  ];

  return (
    <div>
      <PageHead
        eyebrow="Create"
        title="What should we learn today?"
        zh="今日课题"
        kicker="Describe what's unclear. A lesson appears — tailored to you, your gaps, your pace."
      />

      {/* Question */}
      <div className="card-new" style={{padding: 24}}>
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="e.g. Why does the discriminant tell you how many roots a quadratic has?"
          style={{
            width:'100%', minHeight: 110,
            border:'none', outline:'none', resize:'vertical',
            background:'transparent', color:'var(--ink)',
            fontFamily:'var(--display)', fontSize: 20, lineHeight: 1.45,
            padding: 0,
          }}
        />
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)'}}>
          <div style={{display:'flex', gap: 8}}>
            <button className="btn btn-sm"><Glyph name="upload" size={14}/> Add source</button>
            <button className="btn btn-sm"><Glyph name="doc" size={14}/> Paste</button>
          </div>
          <div className="muted small">{query.length} characters · 18 words</div>
        </div>
      </div>

      {/* Mode */}
      <Section title="Teaching mode" zh="教学方式">
        <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 12}}>
          {modes.map(m => (
            <div key={m.id}
              onClick={() => setMode(m.id)}
              className="card-new"
              style={{
                padding: 16,
                cursor:'pointer',
                borderColor: mode === m.id ? 'var(--accent)' : 'var(--line)',
                background: mode === m.id ? 'var(--accent-soft)' : 'var(--surface)',
                boxShadow: mode === m.id ? '0 0 0 3px color-mix(in oklch, var(--accent) 15%, transparent)' : 'var(--shadow-sm)',
              }}>
              <div style={{fontWeight: 500, fontSize: 14, marginBottom: 4}}>{m.t}</div>
              <div className="muted small">{m.d}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Settings */}
      <Section title="Personalization" zh="个性化">
        <div className="card-new" style={{padding: 0}}>
          {[
            { k:'Show the thinking path',    v:'On' },
            { k:'Deliberate-error mode',     v:'On' },
            { k:'Personal anchor',           v:'Skateboarding physics' },
            { k:'Challenge level',           v:'1.1× current' },
          ].map((r, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding: '16px 20px',
              borderTop: i>0 ? '1px solid var(--line)' : 'none',
            }}>
              <div style={{fontSize: 14}}>{r.k}</div>
              <div style={{display:'flex', alignItems:'center', gap: 10, color:'var(--ink-muted)', fontSize: 13}}>
                {r.v}
                <Glyph name="arrow" size={14}/>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div style={{display:'flex', gap: 10, marginTop: 24, justifyContent:'space-between', alignItems:'center'}}>
        <div className="muted small">Generates in ~2 min · Uses GLM-5.1</div>
        <div style={{display:'flex', gap: 10}}>
          <button className="btn">Save draft</button>
          <button className="btn btn-primary btn-lg" onClick={() => setCurrent('lesson')}>
            <Glyph name="sparkles" size={16}/> Create lesson
          </button>
        </div>
      </div>
    </div>
  );
}

window.ScreenCreate = ScreenCreate;
