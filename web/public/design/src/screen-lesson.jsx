// SCREEN — Lesson (modern, airy)

function ScreenLesson({ setCurrent }) {
  const l = DATA.lesson;
  const [step, setStep] = React.useState(3);
  const total = l.steps.length;
  const cur = l.steps[step];

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 20}}>
        <button className="btn btn-ghost btn-sm" onClick={() => setCurrent('today')}>← Back</button>
        <div className="muted small">Step {step+1} of {total} · ~{l.estMin} min total</div>
        <button className="btn btn-ghost btn-sm">Save & pause</button>
      </div>

      <div style={{marginBottom: 24}}>
        <div className="eyebrow" style={{color:'var(--accent)', fontSize:12, letterSpacing:'0.04em', textTransform:'uppercase', fontWeight: 500, marginBottom: 8}}>
          §2.3 · Quadratic functions
        </div>
        <h1 className="display" style={{fontSize: 32, fontWeight: 400, margin:'0 0 6px', letterSpacing:'-0.01em'}}>
          {l.title}
        </h1>
        <div className="muted">{l.titleZh}</div>
      </div>

      {/* progress dots */}
      <div style={{display:'flex', gap: 6, marginBottom: 28}}>
        {l.steps.map((s, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 99,
            background: i <= step ? 'var(--accent)' : 'var(--surface-3)',
          }}/>
        ))}
      </div>

      <div className="card-new" style={{padding: 32}}>
        <div className="muted small" style={{marginBottom: 12}}>{cur.kind}</div>
        <div className="display" style={{fontSize: 22, lineHeight: 1.35, fontWeight: 400, marginBottom: 16, letterSpacing:'-0.005em'}}>
          {cur.prompt}
        </div>
        {cur.body && <div style={{color:'var(--ink-2)', fontSize: 15, lineHeight: 1.6, marginBottom: 20}}>{cur.body}</div>}

        {cur.kind === 'Check' && (
          <div style={{display:'grid', gap: 10, marginBottom: 20}}>
            {cur.options.map((o, i) => (
              <div key={i} className="card-new hover" style={{
                padding: '14px 18px', cursor:'pointer',
                display:'flex', alignItems:'center', gap: 14,
                ...(o.correct ? {borderColor:'var(--ok)', background:'color-mix(in oklch, var(--ok) 5%, white)'} : {}),
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 50,
                  border:'1.5px solid var(--line-strong)',
                  display:'grid', placeItems:'center', flexShrink: 0,
                  color: 'var(--ink-muted)', fontSize: 12, fontWeight: 500,
                  ...(o.correct ? {borderColor:'var(--ok)', background:'var(--ok)', color:'white'} : {}),
                }}>
                  {o.correct ? <Glyph name="check" size={13}/> : String.fromCharCode(65+i)}
                </div>
                <div style={{flex: 1, fontSize: 14}}>{o.t}</div>
              </div>
            ))}
          </div>
        )}

        {cur.think && (
          <div style={{
            padding: 16,
            background: 'var(--surface-2)',
            borderRadius: 10,
            marginBottom: 20,
            borderLeft: '3px solid var(--accent)',
          }}>
            <div className="small muted" style={{marginBottom: 6, fontWeight: 500}}>Thinking path</div>
            <div style={{fontSize: 14, color:'var(--ink-2)', lineHeight: 1.5}}>{cur.think}</div>
          </div>
        )}

        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--line)'}}>
          <button className="btn btn-ghost btn-sm" disabled={step===0} onClick={() => setStep(Math.max(0,step-1))}>
            ← Previous
          </button>
          <div style={{display:'flex', gap: 8}}>
            <button className="btn btn-sm">I need a hint</button>
            <button className="btn btn-primary" onClick={() => setStep(Math.min(total-1,step+1))}>
              Next → 
            </button>
          </div>
        </div>
      </div>

      <div style={{marginTop: 16, display:'flex', gap: 14, fontSize: 12, color:'var(--ink-muted)', justifyContent:'center'}}>
        <span>⌨ <span className="kbd">J</span>/<span className="kbd">K</span> to navigate</span>
        <span>⌨ <span className="kbd">?</span> for hint</span>
      </div>
    </div>
  );
}

window.ScreenLesson = ScreenLesson;
