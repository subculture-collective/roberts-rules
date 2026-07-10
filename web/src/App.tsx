export default function App() {
  return (
    <main className="min-h-screen bg-[#ece8dc] text-[#1d201c] selection:bg-[#c5d15f] selection:text-[#1d201c]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b-2 border-[#1d201c] pb-4">
          <a
            className="font-mono text-xs font-bold uppercase tracking-[0.18em] outline-offset-4 focus-visible:outline-2"
            href="#overview"
          >
            Subculture Collective
          </a>
          <p className="border border-[#1d201c] px-3 py-1 font-mono text-[0.68rem] font-bold uppercase tracking-[0.15em]">
            Pre-alpha / simulator first
          </p>
        </header>

        <section
          className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)] lg:gap-20 lg:py-20"
          id="overview"
        >
          <div>
            <p className="mb-5 flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#50583c]">
              <span aria-hidden="true" className="h-2.5 w-2.5 bg-[#748029]" />
              The meeting is called to order
            </p>
            <h1 className="max-w-4xl font-serif text-[clamp(3.8rem,10vw,8.5rem)] leading-[0.78] font-black tracking-[-0.065em]">
              Roberts
              <span className="block pl-[0.42em] italic text-[#51583d]">Rules.</span>
            </h1>
            <p className="mt-10 max-w-2xl border-l-4 border-[#a2402d] pl-5 text-lg leading-8 sm:text-xl">
              An auditable, chair-led parliamentary meeting platform—beginning with a deterministic
              procedural simulator.
            </p>
          </div>

          <aside className="border-t-2 border-[#1d201c]" aria-label="Project status">
            <div className="flex items-center justify-between border-b border-[#8f8d82] py-4 font-mono text-xs uppercase tracking-wider">
              <span>Current order</span>
              <span className="font-bold text-[#a2402d]">Milestone 0</span>
            </div>
            <dl className="divide-y divide-[#8f8d82]">
              <div className="grid grid-cols-[2.5rem_1fr] gap-3 py-5">
                <dt className="font-mono text-xs text-[#66665f]">01</dt>
                <dd>
                  <p className="font-bold">Model procedure</p>
                  <p className="mt-1 text-sm leading-6 text-[#55574f]">
                    Commands produce immutable events; replay produces the same meeting state.
                  </p>
                </dd>
              </div>
              <div className="grid grid-cols-[2.5rem_1fr] gap-3 py-5">
                <dt className="font-mono text-xs text-[#66665f]">02</dt>
                <dd>
                  <p className="font-bold">Prove the rules</p>
                  <p className="mt-1 text-sm leading-6 text-[#55574f]">
                    Fixtures and invariant tests come before live meeting infrastructure.
                  </p>
                </dd>
              </div>
              <div className="grid grid-cols-[2.5rem_1fr] gap-3 py-5">
                <dt className="font-mono text-xs text-[#66665f]">03</dt>
                <dd>
                  <p className="font-bold">Connect the floor</p>
                  <p className="mt-1 text-sm leading-6 text-[#55574f]">
                    Real-time clients and secure voting remain later milestones.
                  </p>
                </dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className="grid border-y-2 border-[#1d201c] lg:grid-cols-2" aria-labelledby="boundary-title">
          <div className="border-b border-[#1d201c] p-6 sm:p-8 lg:border-r lg:border-b-0">
            <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[#50583c]">
              Public record
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold" id="boundary-title">
              Publish what was approved.
            </h2>
            <p className="mt-3 max-w-xl leading-7 text-[#55574f]">
              Organization identity, rule profiles, meeting manifests, and approved aggregate outcomes
              may become public artifacts.
            </p>
          </div>
          <div className="p-6 sm:p-8">
            <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[#a2402d]">
              Private by default
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold">Protect how it was decided.</h2>
            <p className="mt-3 max-w-xl leading-7 text-[#55574f]">
              Rosters, attendance, credentials, deliberation, participation records, and ballots stay
              within private meeting authority.
            </p>
          </div>
        </section>

        <footer className="flex flex-col gap-5 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-6 text-[#55574f]">
            This repository is an early implementation. It is not production-ready and does not yet
            conduct binding or secure votes.
          </p>
          <div className="flex items-center gap-3 bg-[#1d201c] px-4 py-3 text-[#ece8dc]">
            <span className="font-mono text-xs uppercase tracking-wider text-[#bdc0ad]">Verify</span>
            <code className="font-mono text-sm font-bold">make verify</code>
          </div>
        </footer>
      </div>
    </main>
  );
}
