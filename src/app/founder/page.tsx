import { FounderHeader } from "@/components/founder/FounderHeader";
import { FounderMotion } from "@/components/founder/FounderMotion";
import { founderProfileGraph, serializeJsonLd } from "@/lib/founder/structuredData";
import { person, hero, origin, method, daythread, pattern, whySoftware, trajectory, physical, thread, current, contact, nav } from "@/content/founder/profile";

/**
 * Karim Mohamed's profile: one editorial page, server-rendered. The only client code is the
 * small-screen menu and the reveal-on-scroll enhancement. All copy comes from
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
        <Origin />
        <Method />
        <Daythread />
        <Pattern />
        <WhySoftware />
        <Trajectory />
        <Physical />
        <Thread />
        <Current />
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

const pad = (n: number) => String(n + 1).padStart(2, "0");

function anchor(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function Meta({ index, label, children }: { index: string; label: string; children?: React.ReactNode }) {
  return (
    <div className="fp-meta">
      <span className="fp-mono fp-index">{index}</span>
      <span className="fp-meta-label">{label}</span>
      {children}
    </div>
  );
}

function Ext({ href, children, className = "fp-link" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
      <span aria-hidden className="fp-arrow">↗</span>
      <span className="fp-sr"> (opens in a new tab)</span>
    </a>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  const chapters = [origin, method, daythread, pattern, whySoftware, trajectory, thread, current, contact];
  return (
    <section id="top" className="fp-hero" aria-labelledby="fp-hero-title">
      <div className="fp-wrap">
        <p className="fp-hero-kicker fp-mono">
          <span>{hero.kicker}</span>
          <span aria-hidden className="fp-hero-kicker-rule" />
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
            {hero.paragraphs.map((p) => (
              <p key={p} className="fp-body">{p}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 01 Beginnings ────────────────────────────────────────────────────────────

function Origin() {
  const id = anchor(origin.label);
  return (
    <section id={id} className="fp-section fp-rule" aria-labelledby={`${id}-title`}>
      <div className="fp-wrap fp-grid">
        <div className="fp-col-meta" data-reveal>
          <Meta index={origin.index} label={origin.label} />
        </div>
        <div className="fp-col-main" data-reveal>
          <h2 id={`${id}-title`} className="fp-h2">{origin.title}</h2>
          <div className="fp-columns">
            {origin.paragraphs.map((p) => (
              <p key={p} className="fp-body">{p}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 02 Method ────────────────────────────────────────────────────────────────

function Method() {
  const id = anchor(method.label);
  return (
    <section id={id} className="fp-section fp-rule" aria-labelledby={`${id}-title`}>
      <div className="fp-wrap fp-grid">
        <div className="fp-col-meta" data-reveal>
          <Meta index={method.index} label={method.label} />
        </div>
        <div className="fp-col-text" data-reveal>
          <h2 id={`${id}-title`} className="fp-h2 fp-h2-tight">{method.title}</h2>
          {method.paragraphs.map((p) => (
            <p key={p} className="fp-body">{p}</p>
          ))}
          <p className="fp-pull">{method.close}</p>
        </div>
        <figure className="fp-col-figure fp-cycle" data-reveal>
          <figcaption className="fp-sr">The loop: {method.loop.join(", then ")}, and back to the start.</figcaption>
          <ol aria-hidden>
            {method.loop.map((step, i) => (
              <li key={step}>
                <span className="fp-mono">{pad(i)}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p aria-hidden className="fp-cycle-return fp-mono">
            <span className="fp-cycle-return-line fp-draw" />
            Back to 01
          </p>
        </figure>
      </div>
    </section>
  );
}

// ── 03 Daythread ─────────────────────────────────────────────────────────────

function Daythread() {
  const d = daythread;
  const id = anchor(d.label);
  return (
    <section id={id} className="fp-section fp-rule" aria-labelledby={`${id}-title`}>
      <div className="fp-wrap">
        <div className="fp-grid">
          <div className="fp-col-meta" data-reveal>
            <Meta index={d.index} label={d.label}>
              <span className="fp-mono fp-muted">{d.role}</span>
              <Ext href={d.url} className="fp-mono fp-ext">daythread.org</Ext>
            </Meta>
          </div>
          <h2 id={`${id}-title`} className="fp-col-main fp-display" data-reveal>{d.title}</h2>
        </div>

        <div className="fp-grid fp-gap-top">
          <div className="fp-col-text" data-reveal>
            <p className="fp-lede">{d.lede}</p>
            {d.paragraphs.map((p) => (
              <p key={p} className="fp-body">{p}</p>
            ))}
          </div>
          <figure className="fp-col-figure fp-flow" data-reveal>
            <blockquote className="fp-flow-message">
              <p>{d.flow.message}</p>
            </blockquote>
            <ol className="fp-flow-steps">
              {d.flow.steps.map((s, i) => (
                <li key={s.label} data-last={i === d.flow.steps.length - 1 || undefined}>
                  <span aria-hidden className="fp-flow-node" />
                  <span className="fp-flow-label">{s.label}</span>
                  <span className="fp-flow-note">{s.note}</span>
                </li>
              ))}
            </ol>
            <figcaption className="fp-mono fp-muted">{d.flow.caption}</figcaption>
          </figure>
        </div>

        <p className="fp-principle" data-reveal>
          <span>{d.principle[0]}</span> <span className="fp-italic">{d.principle[1]}</span>
        </p>

        <figure className="fp-shot" data-reveal>
          {/* A real capture of the product, stored with the site. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.screenshot.src} width={d.screenshot.width} height={d.screenshot.height} alt={d.screenshot.alt} loading="lazy" decoding="async" />
          <figcaption className="fp-mono fp-muted">{d.screenshot.caption}</figcaption>
        </figure>

        <div className="fp-grid">
          <div className="fp-col-main" data-reveal>
            <div className="fp-columns">
              {d.building.map((p) => (
                <p key={p} className="fp-body">{p}</p>
              ))}
            </div>
            <p className="fp-note fp-mono">
              {d.evidence} <Ext href={d.repository}>Repository</Ext>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 04 Rushd and InternOps ───────────────────────────────────────────────────

function Pattern() {
  const id = anchor(pattern.label);
  return (
    <section id={id} className="fp-section fp-rule" aria-labelledby={`${id}-title`}>
      <div className="fp-wrap fp-grid">
        <div className="fp-col-meta" data-reveal>
          <Meta index={pattern.index} label={pattern.label} />
        </div>
        <div className="fp-col-main">
          <h2 id={`${id}-title`} className="fp-h2" data-reveal>{pattern.title}</h2>
          <div className="fp-pair">
            {pattern.projects.map((p) => (
              <article key={p.name} className="fp-pair-item" data-reveal>
                <h3 className="fp-h3">{p.name}</h3>
                <p className="fp-mono fp-muted fp-pair-what">{p.what}</p>
                <p className="fp-body">{p.text}</p>
                <Ext href={p.link.href} className="fp-mono fp-ext">{p.link.label}</Ext>
              </article>
            ))}
          </div>
          <p className="fp-pull fp-pull-wide" data-reveal>{pattern.close}</p>
          <p className="fp-body fp-aside" data-reveal>{pattern.edai}</p>
        </div>
      </div>
    </section>
  );
}

// ── 05 Why software ──────────────────────────────────────────────────────────

function WhySoftware() {
  const w = whySoftware;
  const id = anchor(w.label);
  return (
    <section id={id} className="fp-section fp-rule" aria-labelledby={`${id}-title`}>
      <div className="fp-wrap fp-grid">
        <div className="fp-col-meta" data-reveal>
          <Meta index={w.index} label={w.label} />
        </div>
        <div className="fp-col-main">
          <h2 id={`${id}-title`} className="fp-h2" data-reveal>{w.title}</h2>
          <p className="fp-ladder" data-reveal>
            {w.ladder.map((step, i) => (
              <span key={step} className="fp-ladder-step">
                {i > 0 && <span aria-hidden className="fp-ladder-arrow">→</span>}
                {i > 0 && <span className="fp-sr">, then </span>}
                {step}
              </span>
            ))}
          </p>
          <div className="fp-columns" data-reveal>
            {w.paragraphs.map((p) => (
              <p key={p} className="fp-body">{p}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 06 Direction ─────────────────────────────────────────────────────────────

function Trajectory() {
  const t = trajectory;
  const id = anchor(t.label);
  return (
    <section id={id} className="fp-section fp-rule" aria-labelledby={`${id}-title`}>
      <div className="fp-wrap fp-grid">
        <div className="fp-col-meta" data-reveal>
          <Meta index={t.index} label={t.label} />
        </div>
        <div className="fp-col-text" data-reveal>
          <h2 id={`${id}-title`} className="fp-h2 fp-h2-tight">{t.title}</h2>
          {t.paragraphs.map((p) => (
            <p key={p} className="fp-body">{p}</p>
          ))}
        </div>
        <figure className="fp-col-figure fp-path" data-reveal>
          <figcaption className="fp-path-legend">
            <span className="fp-sr">A trajectory from idea to machines. </span>
            {t.legend.map((l) => (
              <span key={l.state} className="fp-mono" data-state={l.state}>
                <span aria-hidden className="fp-path-key" />
                {l.label}
              </span>
            ))}
          </figcaption>
          <ol>
            {t.path.map((step, i) => (
              <li key={step.label} data-state={step.state}>
                <span aria-hidden className="fp-path-rail">
                  <span className="fp-path-node" />
                </span>
                <span className="fp-mono fp-path-index" aria-hidden>{pad(i)}</span>
                <span className="fp-path-label">{step.label}</span>
                <span className="fp-mono fp-path-note">
                  <span className="fp-sr">{t.legend.find((l) => l.state === step.state)?.label}: </span>
                  {step.note}
                </span>
              </li>
            ))}
          </ol>
        </figure>
      </div>
    </section>
  );
}

// ── The physical world ───────────────────────────────────────────────────────

function Physical() {
  const id = anchor(physical.label);
  return (
    <section id={id} className="fp-night" aria-labelledby={`${id}-title`}>
      <div className="fp-wrap">
        <p className="fp-mono fp-night-label" data-reveal>{physical.label}</p>
        <h2 id={`${id}-title`} className="fp-night-statement" data-reveal>
          <span className="fp-block">{physical.statement[0]}</span>{" "}
          <span className="fp-block fp-italic">{physical.statement[1]}</span>
        </h2>
        <ol className="fp-capabilities">
          {physical.capabilities.map((c, i) => (
            <li key={c.subject} data-reveal style={{ transitionDelay: `${i * 70}ms` }}>
              <span className="fp-mono" aria-hidden>{pad(i)}</span>
              <span className="fp-capability-subject">{c.subject}</span>{" "}
              <span className="fp-capability-verb">{c.verb}</span>
            </li>
          ))}
        </ol>
        <p className="fp-night-close" data-reveal>{physical.close}</p>
      </div>
    </section>
  );
}

// ── 07 The thread ────────────────────────────────────────────────────────────

function Thread() {
  const id = anchor(thread.label);
  return (
    <section id={id} className="fp-section" aria-labelledby={`${id}-title`}>
      <div className="fp-wrap fp-grid">
        <div className="fp-col-meta" data-reveal>
          <Meta index={thread.index} label={thread.label} />
        </div>
        <div className="fp-col-main">
          <p className="fp-body fp-thread-intro" data-reveal>{thread.intro}</p>
          <h2 id={`${id}-title`} className="fp-display fp-thread-q" data-reveal>{thread.question}</h2>
          <table className="fp-thread" data-reveal>
            <caption className="fp-sr">Each project or field, and the kind of system it represents</caption>
            <thead className="fp-sr">
              <tr>
                <th scope="col">Work</th>
                <th scope="col">System</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {thread.rows.map((r) => (
                <tr key={r.name} data-state={r.state}>
                  <th scope="row">{r.name}</th>
                  <td className="fp-thread-system">
                    <span aria-hidden className="fp-thread-line" />
                    <span>{r.system}</span>
                  </td>
                  <td className="fp-mono fp-thread-state">{thread.stateLabel[r.state]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ── 08 Now ───────────────────────────────────────────────────────────────────

function Current() {
  const id = anchor(current.label);
  return (
    <section id={id} className="fp-section fp-rule" aria-labelledby={`${id}-title`}>
      <div className="fp-wrap fp-grid">
        <div className="fp-col-meta" data-reveal>
          <Meta index={current.index} label={current.label} />
        </div>
        <div className="fp-col-main">
          <h2 id={`${id}-title`} className="fp-display" data-reveal>
            <span className="fp-block">{current.title[0]}</span>{" "}
            <span className="fp-block fp-italic">{current.title[1]}</span>
          </h2>
          <div className="fp-columns fp-gap-top-sm" data-reveal>
            {current.paragraphs.map((p) => (
              <p key={p} className="fp-body">{p}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 09 Contact ───────────────────────────────────────────────────────────────

function Contact() {
  const id = anchor(contact.label);
  return (
    <section id={id} className="fp-contact" aria-labelledby={`${id}-title`}>
      <div className="fp-wrap">
        <div className="fp-meta">
          <span className="fp-mono fp-index">{contact.index}</span>
          <h2 id={`${id}-title`} className="fp-meta-label">{contact.label}</h2>
        </div>
        <p className="fp-contact-name">{person.name}</p>
        <p className="fp-contact-meta">
          <span className="fp-mono fp-muted">{person.location}</span>
          <span>{contact.focus.join(" · ")}</span>
        </p>
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
