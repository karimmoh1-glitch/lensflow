import { FounderHeader } from "@/components/founder/FounderHeader";
import { FounderMotion } from "@/components/founder/FounderMotion";
import { founderProfileGraph, serializeJsonLd } from "@/lib/founder/structuredData";
import { person, hero, who, daythread, rushd, internops, edai, bigIdea, systems, foundation, next, background, contact, nav } from "@/content/founder/profile";

/**
 * Karim Mohamed's profile. One long editorial page, server-rendered; the only client code is
 * the small-screen menu and the reveal-on-scroll enhancement. All copy comes from
 * src/content/founder/profile.ts.
 */
export default function FounderPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(founderProfileGraph()) }} />
      <a href="#main" className="fp-skip">Skip to content</a>
      <FounderHeader name={person.name} links={nav} />
      <FounderMotion />

      <main id="main">
        <Hero />
        <div id="work">
          <Who />
          <Daythread />
          <Rushd />
          <InternOps />
          <EdAI />
        </div>
        <div id="direction">
          <BigIdea />
          <Systems />
          <Foundation />
          <Next />
        </div>
        <Background />
        <Contact />
      </main>

      <footer className="fp-footer">
        <div className="fp-wrap fp-footer-row">
          <span>{person.name}</span>
          <a href="https://daythread.org">daythread.org</a>
        </div>
      </footer>
    </>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function ChapterHead({ index, label, role, id, title, link }: { index: string; label: string; role?: string; id: string; title: string; link?: { label: string; href: string } }) {
  return (
    <header className="fp-chapter-head" data-reveal>
      <div className="fp-chapter-meta">
        <span className="fp-mono fp-index">{index}</span>
        <span className="fp-chapter-label">{label}</span>
        {role && <span className="fp-mono fp-muted">{role}</span>}
        {link && (
          <a href={link.href} className="fp-mono fp-ext" target="_blank" rel="noreferrer">
            {link.label}
            <span aria-hidden className="fp-arrow">↗</span>
            <span className="fp-sr"> (opens in a new tab)</span>
          </a>
        )}
      </div>
      <h2 id={id} className="fp-chapter-title">{title}</h2>
    </header>
  );
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="fp-link">
      {children}
      <span aria-hidden className="fp-arrow">↗</span>
      <span className="fp-sr"> (opens in a new tab)</span>
    </a>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  const chapters = [who, daythread, rushd, internops, edai, systems, foundation, next, background, contact];
  return (
    <section id="top" className="fp-hero" aria-labelledby="fp-hero-title">
      <div className="fp-wrap">
        <p className="fp-hero-meta fp-mono">
          <span>{hero.kicker}</span>
          <span aria-hidden className="fp-hero-meta-rule" />
          <span>{person.location}</span>
        </p>
        <h1 id="fp-hero-title" className="fp-hero-title">
          <span className="fp-hero-name">{person.name}</span>
          <span className="fp-sr">: </span>
          <span className="fp-hero-line">{hero.line[0]}</span>{" "}
          <span className="fp-hero-line fp-italic">{hero.line[1]}</span>
        </h1>

        <div className="fp-hero-grid">
          <nav aria-label="Contents" className="fp-toc">
            <p className="fp-mono fp-muted">Contents</p>
            <ol>
              {chapters.map((c) => (
                <li key={c.index}>
                  <a href={`#${anchor(c.label)}`}>
                    <span className="fp-mono">{c.index}</span>
                    {c.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="fp-hero-copy">
            <p className="fp-lede">{hero.lede}</p>
            <p className="fp-body">{hero.follow}</p>
          </div>
        </div>

        <figure className="fp-trajectory">
          <figcaption className="fp-mono fp-muted">Trajectory</figcaption>
          <ol>
            {hero.trajectory.map((t, i) => (
              <li key={t.label} data-state={t.state}>
                <span aria-hidden className="fp-trajectory-track">
                  <span className="fp-trajectory-node" />
                </span>
                <span className="fp-mono fp-trajectory-index" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                <span className="fp-trajectory-label">{t.label}</span>
                <span className="fp-mono fp-trajectory-note">{t.note}</span>
              </li>
            ))}
          </ol>
        </figure>
      </div>
    </section>
  );
}

// ── 01 Who ───────────────────────────────────────────────────────────────────

function Who() {
  const projects = ["Daythread", "Rushd", "InternOps"];
  return (
    <section id={anchor(who.label)} className="fp-section" aria-labelledby={`${anchor(who.label)}-title`}>
      <div className="fp-wrap">
        <ChapterHead index={who.index} label={who.label} id={`${anchor(who.label)}-title`} title={who.lede} />
        <div className="fp-split">
          <div className="fp-split-text" data-reveal>
            {who.paragraphs.map((p) => (
              <p key={p} className="fp-body">{p}</p>
            ))}
          </div>
          <div className="fp-split-aside" data-reveal>
            <table className="fp-ledger">
              <caption className="fp-mono fp-muted">What the work covers</caption>
              <thead>
                <tr>
                  <th scope="col"><span className="fp-sr">Area</span></th>
                  {projects.map((p) => (
                    <th key={p} scope="col" className="fp-mono">{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {who.ledger.map((row) => (
                  <tr key={row.area}>
                    <th scope="row">{row.area}</th>
                    {projects.map((p) => (
                      <td key={p}>
                        {row.in.includes(p) ? (
                          <>
                            <span aria-hidden className="fp-mark" />
                            <span className="fp-sr">Yes</span>
                          </>
                        ) : (
                          <span className="fp-sr">No</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 02 Daythread ─────────────────────────────────────────────────────────────

function Daythread() {
  const d = daythread;
  return (
    <section id={anchor(d.label)} className="fp-section fp-section-rule" aria-labelledby={`${anchor(d.label)}-title`}>
      <div className="fp-wrap">
        <ChapterHead index={d.index} label={d.label} role={d.role} id={`${anchor(d.label)}-title`} title={d.title} link={{ label: "daythread.org", href: d.url }} />

        <div className="fp-split">
          <div className="fp-split-text" data-reveal>
            <p className="fp-lede fp-lede-sm">{d.lede}</p>
            {d.paragraphs.map((p) => (
              <p key={p} className="fp-body">{p}</p>
            ))}
          </div>

          <figure className="fp-flow" data-reveal>
            <blockquote className="fp-flow-message">
              <p>{d.example.message}</p>
            </blockquote>
            <ol className="fp-flow-steps">
              {d.example.steps.map((s, i) => (
                <li key={s.label} data-last={i === d.example.steps.length - 1 || undefined}>
                  <span aria-hidden className="fp-flow-node" />
                  <span className="fp-mono fp-flow-label">{s.label}</span>
                  <span className="fp-flow-note">{s.note}</span>
                </li>
              ))}
            </ol>
            <figcaption className="fp-mono fp-muted">{d.example.caption}</figcaption>
          </figure>
        </div>

        <p className="fp-principle" data-reveal>
          <span>{d.principle.split(". ")[0]}.</span> <span className="fp-italic">{d.principle.split(". ")[1]}</span>
          <span className="fp-mono fp-muted fp-principle-note">{d.principleNote}</span>
        </p>

        <figure className="fp-workflow" data-reveal>
          <figcaption className="fp-mono fp-muted">{d.workflowCaption}</figcaption>
          <ol>
            {d.workflow.map((w, i) => (
              <li key={w}>
                <span className="fp-mono" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                <span>{w}</span>
              </li>
            ))}
          </ol>
          <span aria-hidden className="fp-workflow-rule fp-draw" />
        </figure>

        <figure className="fp-shot" data-reveal>
          {/* A real capture of the product, stored with the site. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.screenshot.src} width={d.screenshot.width} height={d.screenshot.height} alt={d.screenshot.alt} loading="lazy" decoding="async" />
          <figcaption className="fp-mono fp-muted">{d.screenshot.caption}</figcaption>
        </figure>

        <div className="fp-scope">
          <div className="fp-evidence" data-reveal>
            {d.evidence.map((e) => (
              <p key={e.figure}>
                <span className="fp-figure">{e.figure}</span>
                <span className="fp-evidence-label">{e.label}</span>
              </p>
            ))}
            <p className="fp-mono fp-muted">
              {d.evidenceNote} <Ext href={d.repository}>Repository</Ext>
            </p>
          </div>
          <div data-reveal>
            <p className="fp-body">{d.scopeIntro}</p>
            <ol className="fp-scope-list">
              {d.scope.map((s, i) => (
                <li key={s}>
                  <span className="fp-mono" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 03 Rushd ─────────────────────────────────────────────────────────────────

function Rushd() {
  const r = rushd;
  const n = r.inputs.length;
  return (
    <section id={anchor(r.label)} className="fp-section fp-section-rule" aria-labelledby={`${anchor(r.label)}-title`}>
      <div className="fp-wrap">
        <ChapterHead index={r.index} label={r.label} role={r.role} id={`${anchor(r.label)}-title`} title={r.title} link={{ label: "therushd.com", href: r.url }} />
        <div className="fp-split fp-split-reverse">
          <figure className="fp-converge" data-reveal>
            <figcaption className="fp-sr">Classes, assignments, exams, deadlines and available time feed into one prioritized plan.</figcaption>
            <ul className="fp-converge-inputs" aria-hidden>
              {r.inputs.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <svg className="fp-converge-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              {r.inputs.map((_, i) => {
                const y = ((i + 0.5) / n) * 100;
                return <path key={i} className="fp-draw-path" pathLength={1} d={`M0 ${y} C 55 ${y}, 45 50, 100 50`} />;
              })}
            </svg>
            <div className="fp-converge-output" aria-hidden>
              <span className="fp-converge-out-label">{r.output.label}</span>
              <span className="fp-mono fp-muted">{r.output.note}</span>
              <span className="fp-converge-rows">
                <span />
                <span />
                <span />
              </span>
            </div>
          </figure>
          <div className="fp-split-text" data-reveal>
            <p className="fp-lede fp-lede-sm">{r.lede}</p>
            {r.paragraphs.map((p) => (
              <p key={p} className="fp-body">{p}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 04 InternOps ─────────────────────────────────────────────────────────────

function InternOps() {
  const o = internops;
  return (
    <section id={anchor(o.label)} className="fp-section fp-section-rule" aria-labelledby={`${anchor(o.label)}-title`}>
      <div className="fp-wrap">
        <ChapterHead index={o.index} label={o.label} role={o.role} id={`${anchor(o.label)}-title`} title={o.title} link={{ label: "GitHub", href: o.repository }} />
        <div className="fp-split">
          <div className="fp-split-text" data-reveal>
            <p className="fp-lede fp-lede-sm">{o.lede}</p>
            {o.paragraphs.map((p) => (
              <p key={p} className="fp-body">{p}</p>
            ))}
          </div>
          <figure className="fp-modules" data-reveal>
            <figcaption className="fp-sr">The parts InternOps brings together: {o.modules.join(", ")}.</figcaption>
            <ul aria-hidden>
              {o.modules.map((m, i) => (
                <li key={m}>
                  <span className="fp-mono">{String(i + 1).padStart(2, "0")}</span>
                  {m}
                </li>
              ))}
            </ul>
            <div className="fp-modules-base" aria-hidden>
              <span className="fp-draw" />
              <span className="fp-modules-base-label">{o.output}</span>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}

// ── 05 EdAI ──────────────────────────────────────────────────────────────────

function EdAI() {
  return (
    <section id={anchor(edai.label)} className="fp-section fp-section-rule" aria-labelledby={`${anchor(edai.label)}-title`}>
      <div className="fp-wrap fp-edai">
        <div className="fp-chapter-meta" data-reveal>
          <span className="fp-mono fp-index">{edai.index}</span>
          <h2 id={`${anchor(edai.label)}-title`} className="fp-chapter-label">{edai.label}</h2>
        </div>
        <p className="fp-edai-result" data-reveal>
          <span className="fp-edai-place">{edai.result}</span>
          <span className="fp-mono">{edai.resultLabel}</span>
        </p>
        <div className="fp-edai-copy" data-reveal>
          <p className="fp-edai-prize">
            <span className="fp-figure">{edai.prize}</span>
            <span className="fp-mono fp-muted">{edai.prizeLabel}</span>
          </p>
          {edai.paragraphs.map((p) => (
            <p key={p} className="fp-body">{p}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Direction ────────────────────────────────────────────────────────────────

function BigIdea() {
  return (
    <section className="fp-night" aria-labelledby="fp-direction-title">
      <div className="fp-wrap">
        <h2 id="fp-direction-title" className="fp-mono fp-night-label">{bigIdea.label}</h2>
        <ol className="fp-statements">
          {bigIdea.lines.map((l, i) => (
            <li key={l} data-reveal style={{ transitionDelay: `${i * 60}ms` }}>
              <span className="fp-mono" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
              <span className={i === bigIdea.lines.length - 1 ? "fp-italic" : undefined}>{l}</span>
            </li>
          ))}
        </ol>
        <p className="fp-mono fp-night-note">{bigIdea.note}</p>
      </div>
    </section>
  );
}

function Systems() {
  const s = systems;
  return (
    <section id={anchor(s.label)} className="fp-section" aria-labelledby={`${anchor(s.label)}-title`}>
      <div className="fp-wrap">
        <div className="fp-chapter-meta" data-reveal>
          <span className="fp-mono fp-index">{s.index}</span>
          <span className="fp-chapter-label">{s.label}</span>
        </div>
        <h2 id={`${anchor(s.label)}-title`} className="fp-question" data-reveal>
          <span className="fp-question-from">{s.from}</span>{" "}
          <span className="fp-question-to">{s.to}</span>
        </h2>
        <div className="fp-systems-copy" data-reveal>
          {s.paragraphs.map((p) => (
            <p key={p} className="fp-body">{p}</p>
          ))}
        </div>

        <div className="fp-loop" data-reveal>
          <table>
            <caption className="fp-mono fp-muted">The same loop, on a screen and in the world</caption>
            <thead>
              <tr>
                <td />
                {s.stages.map((st) => (
                  <th key={st} scope="col" className="fp-mono">{st}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.rows.map((row) => (
                <tr key={row.label} data-state={row.state}>
                  <th scope="row">
                    <span className="fp-loop-row-label">{row.label}</span>
                    <span className="fp-mono fp-muted">{s.rowNotes[row.state]}</span>
                  </th>
                  {row.cells.map((c, i) => (
                    <td key={c}>
                      <span className="fp-mono fp-loop-stage" aria-hidden>{s.stages[i]}</span>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Foundation() {
  const f = foundation;
  return (
    <section id={anchor(f.label)} className="fp-section fp-section-rule" aria-labelledby={`${anchor(f.label)}-title`}>
      <div className="fp-wrap">
        <ChapterHead index={f.index} label={f.label} id={`${anchor(f.label)}-title`} title={f.title} />
        <p className="fp-subjects" data-reveal>
          {f.subjects.map((x) => (
            <span key={x}>{x}.</span>
          ))}
        </p>
        <div className="fp-foundation" data-reveal>
          <p className="fp-body">{f.paragraph}</p>
          <div>
            <h3 className="fp-mono fp-muted fp-h3">Current coursework</h3>
            <ul className="fp-courses">
              {f.current.map((c) => (
                <li key={c.course}>
                  <span>{c.course}</span>
                  {c.where && <span className="fp-mono fp-muted">{c.where}</span>}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="fp-mono fp-muted fp-h3">Prior AP exam results</h3>
            <ul className="fp-results">
              {f.results.map((r) => (
                <li key={r.exam}>
                  <span className="fp-figure">{r.score}</span>
                  <span>{r.exam}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Next() {
  return (
    <section id={anchor(next.label)} className="fp-section fp-section-rule" aria-labelledby={`${anchor(next.label)}-title`}>
      <div className="fp-wrap">
        <ChapterHead index={next.index} label={next.label} id={`${anchor(next.label)}-title`} title={next.title} />
        <div className="fp-split">
          <p className="fp-lede fp-lede-sm fp-split-text" data-reveal>{next.paragraph}</p>
          <div data-reveal>
            <ol className="fp-fields">
              {next.fields.map((x, i) => (
                <li key={x}>
                  <span className="fp-mono" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                  {x}
                </li>
              ))}
            </ol>
            <p className="fp-body fp-next-close">{next.close}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Background & contact ─────────────────────────────────────────────────────

function Background() {
  return (
    <section id={anchor(background.label)} className="fp-section fp-section-rule" aria-labelledby={`${anchor(background.label)}-title`}>
      <div className="fp-wrap">
        <div className="fp-chapter-meta" data-reveal>
          <span className="fp-mono fp-index">{background.index}</span>
          <h2 id={`${anchor(background.label)}-title`} className="fp-chapter-label">{background.label}</h2>
        </div>
        <dl className="fp-background" data-reveal>
          {background.entries.map((e) => (
            <div key={e.name}>
              <dt>{e.name}</dt>
              <dd className="fp-mono fp-muted">{e.role}</dd>
              <dd>{e.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id={anchor(contact.label)} className="fp-contact" aria-labelledby={`${anchor(contact.label)}-title`}>
      <div className="fp-wrap">
        <div className="fp-chapter-meta">
          <span className="fp-mono fp-index">{contact.index}</span>
          <h2 id={`${anchor(contact.label)}-title`} className="fp-chapter-label">{contact.label}</h2>
        </div>
        <p className="fp-contact-name">{person.name}</p>
        <p className="fp-mono fp-muted">{person.location}</p>
        <p className="fp-contact-focus">{contact.focus.join(" · ")}</p>
        <ul className="fp-contact-links">
          {contact.links.map((l) => (
            <li key={l.href}>
              <Ext href={l.href}>{l.label}</Ext>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function anchor(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
