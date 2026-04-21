// SCREEN — Library (modern, airy)

function ScreenLibrary({ setCurrent }) {
  const [filter, setFilter] = React.useState('all');
  const items = DATA.library;
  const filtered = filter === 'all' ? items : items.filter(i => i.kind === filter);

  return (
    <div>
      <PageHead
        eyebrow="Library"
        title="Everything you've learned"
        zh="文库"
        kicker="Lessons, notes, and flashcards you've generated. Searchable, revisitable."
      />

      <div style={{display:'flex', gap: 8, marginBottom: 20, flexWrap:'wrap'}}>
        {[
          {id:'all', t:'All', n: items.length},
          {id:'lesson', t:'Lessons', n: items.filter(i=>i.kind==='lesson').length},
          {id:'note', t:'Notes', n: items.filter(i=>i.kind==='note').length},
          {id:'deck', t:'Flashcards', n: items.filter(i=>i.kind==='deck').length},
        ].map(f => (
          <button key={f.id}
            onClick={() => setFilter(f.id)}
            className={`btn btn-sm ${filter===f.id?'btn-primary':''}`}>
            {f.t} <span style={{opacity:.7}}>{f.n}</span>
          </button>
        ))}
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 14}}>
        {filtered.map(i => (
          <div key={i.id} className="card-new hover" style={{padding: 18, cursor:'pointer'}}
               onClick={() => i.kind==='lesson' && setCurrent('lesson')}>
            <div style={{display:'flex', gap: 8, marginBottom: 12}}>
              <Chip kind={i.mastery >= 0.7 ? 'ok' : i.mastery >= 0.4 ? 'accent' : 'warn'} dot>
                {i.kind}
              </Chip>
              <span className="muted small" style={{marginLeft:'auto'}}>{i.when}</span>
            </div>
            <div style={{fontSize: 15, fontWeight: 500, marginBottom: 4, lineHeight: 1.3}}>{i.title}</div>
            <div className="muted small" style={{marginBottom: 14, minHeight: 32}}>{i.topic}</div>
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

window.ScreenLibrary = ScreenLibrary;
