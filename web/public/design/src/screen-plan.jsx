// SCREEN — Plan (modern, airy, with knowledge graph)

function ScreenPlan({ setCurrent }) {
  const p = DATA.plan;
  const [selUnit, setSelUnit] = React.useState(p.units[1]);

  return (
    <div>
      <PageHead
        eyebrow="IB Math AA HL · Paper 1"
        title="Your study plan"
        zh="学习计划"
        kicker="Six units. Read in order, open any chapter. Exam sits May 2027."
      />

      {/* overall progress */}
      <div className="card-new" style={{padding: 22}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 14}}>
          <div>
            <div className="muted small">Overall progress</div>
            <div className="display" style={{fontSize: 28, letterSpacing:'-0.01em'}}>31.4 / 84 hours</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div className="muted small">Mastery</div>
            <div className="display" style={{fontSize: 28, color:'var(--accent)'}}>58%</div>
          </div>
        </div>
        <Progress value={0.37}/>
      </div>

      {/* Units */}
      <Section title="Units" zh="单元">
        <div style={{display:'grid', gap: 10}}>
          {p.units.map((u) => {
            const avg = u.topics.reduce((a,t)=>a+t.m,0) / Math.max(1,u.topics.length);
            const sel = selUnit === u;
            return (
              <div key={u.ref}
                onClick={() => setSelUnit(u)}
                className="card-new"
                style={{
                  padding: '16px 20px',
                  cursor:'pointer',
                  borderColor: sel ? 'var(--accent)' : 'var(--line)',
                  boxShadow: sel ? '0 0 0 3px color-mix(in oklch, var(--accent) 12%, transparent)' : 'var(--shadow-sm)',
                }}>
                <div style={{display:'grid', gridTemplateColumns:'36px 1fr 160px 90px', gap: 18, alignItems:'center'}}>
                  <div className="muted small">§{u.ref}</div>
                  <div>
                    <div style={{fontSize: 15, fontWeight: 500}}>{u.title}</div>
                    <div className="muted small">{u.topics.length} topics · {u.done}/{u.hours}h</div>
                  </div>
                  <div><Progress value={avg} thin/></div>
                  <div style={{display:'flex', justifyContent:'flex-end'}}>
                    {u.status === 'done'   && <Chip kind="ok" dot>Done</Chip>}
                    {u.status === 'active' && <Chip kind="accent" dot>In progress</Chip>}
                    {u.status === 'queued' && <Chip>Up next</Chip>}
                    {u.status === 'upcoming' && <Chip>Upcoming</Chip>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Selected unit detail */}
      <Section
        title={`${selUnit.title}`}
        zh={selUnit.titleZh}
        tools={<a>View graph →</a>}
      >
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 20}}>
          <div className="card-new" style={{padding: 0}}>
            {selUnit.topics.map((t, i) => (
              <div key={i}
                onClick={() => setCurrent('lesson')}
                style={{
                  padding: '14px 18px',
                  borderTop: i>0 ? '1px solid var(--line)' : 'none',
                  cursor:'pointer',
                  display:'grid', gridTemplateColumns:'1fr 100px auto', gap: 14, alignItems:'center',
                }}>
                <div>
                  <div style={{fontSize: 14, fontWeight: 500}}>{t.t}</div>
                  <div className="muted small">
                    {t.m >= 0.75 ? 'Solid' :
                     t.m >= 0.5  ? 'Workable' :
                     t.m >= 0.25 ? 'Fragile' : 'Not started'}
                  </div>
                </div>
                <Progress value={t.m} thin/>
                <Glyph name="arrow" size={14}/>
              </div>
            ))}
          </div>

          {/* Knowledge graph */}
          <div className="card-new" style={{padding: 18}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 10}}>
              <div style={{fontWeight: 500, fontSize: 14}}>Knowledge graph</div>
              <span className="muted small">9 concepts</span>
            </div>
            <KnowledgeGraph data={DATA.graph}/>
          </div>
        </div>
      </Section>
    </div>
  );
}

function KnowledgeGraph({ data }) {
  const w = 400, h = 280;
  const pad = 30;
  const xs = data.nodes.map(n => n.x);
  const ys = data.nodes.map(n => n.y);
  const mnX = Math.min(...xs), mxX = Math.max(...xs);
  const mnY = Math.min(...ys), mxY = Math.max(...ys);
  const sx = (x) => pad + ((x - mnX) / (mxX - mnX)) * (w - pad*2);
  const sy = (y) => pad + ((y - mnY) / (mxY - mnY)) * (h - pad*2);
  const byId = Object.fromEntries(data.nodes.map(n => [n.id, n]));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{width:'100%', height:'auto', display:'block'}}>
      {data.edges.map(([a,b], i) => {
        const na = byId[a], nb = byId[b];
        const dashed = na.future || nb.future;
        return (
          <line key={i}
            x1={sx(na.x)} y1={sy(na.y)}
            x2={sx(nb.x)} y2={sy(nb.y)}
            stroke="var(--line-strong)"
            strokeWidth={dashed ? 1 : 1.5}
            strokeDasharray={dashed ? "3 3" : ""}
          />
        );
      })}
      {data.nodes.map(n => {
        const cx = sx(n.x), cy = sy(n.y);
        const r = 8 + (n.m || 0) * 6;
        const col = n.active ? 'var(--accent)' : 'var(--ink)';
        const fill = n.active ? 'var(--accent)' : n.future ? 'var(--surface-2)' : 'var(--surface)';
        return (
          <g key={n.id}>
            <circle cx={cx} cy={cy} r={r} fill={fill} stroke={col}
              strokeWidth={n.active ? 2 : 1.3} opacity={n.future ? 0.5 : 1}/>
            <text x={cx} y={cy + r + 12}
              textAnchor="middle" fontFamily="var(--sans)" fontSize="10"
              fill="var(--ink-2)" opacity={n.future ? 0.6 : 1}
              fontWeight={n.active ? 500 : 400}>
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

window.ScreenPlan = ScreenPlan;
