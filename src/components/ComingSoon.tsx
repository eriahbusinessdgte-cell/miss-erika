export function ComingSoon({ title, stage, children }: { title: string; stage: string; children: React.ReactNode }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p className="sub">Not built yet. Planned for {stage}.</p>
        </div>
      </div>
      <section className="card">
        <p>{children}</p>
      </section>
    </>
  );
}
