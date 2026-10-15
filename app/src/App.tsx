import { useEffect, useState } from "react";
import { ApplyModal } from "./ApplyModal";
import { MockWalletPopup } from "./MockWalletPopup";
import { ProbeCard, type ProbeInvitation } from "./ProbeCard";
import { ProjectList } from "./ProjectList";
import { ProjectPage } from "./ProjectPage";
import projectData from "./data/projects.json";
import { askedKey, at_exit, loadProbePlan } from "./probe";
import { sessionKey, uuid } from "./session";
import { getTracker } from "./track";
import type { DecisionPoint, ProbePlan, Project } from "./types";
import { connectWallet, type Wallet, type WalletAttempt } from "./wallet";

const projects: Project[] = projectData;
const projectFromUrl = () =>
  location.hash.match(/^#\/project\/(p\d+)$/)?.[1] ?? null;

export default function App() {
  const [tracker] = useState(getTracker);
  const [consent, setConsent] = useState<boolean | null>(() => {
    const saved = sessionStorage.getItem(
      sessionKey(tracker.sessionId, "consent"),
    );
    return saved === null ? null : saved === "yes";
  });
  const [route, setRoute] = useState(() => ({
    id: projectFromUrl(),
    visitId: uuid(),
  }));
  const project = projects.find((item) => item.id === route.id) ?? null;
  const [plans, setPlans] = useState<Record<DecisionPoint, ProbePlan | null>>({
    DP1: null,
    DP2: null,
  });
  const [gateId, setGateId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<WalletAttempt | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(() =>
    sessionStorage.getItem(sessionKey(tracker.sessionId, "connected"))
      ? { kind: "mock" }
      : null,
  );
  const [error, setError] = useState("");
  const [invitation, setInvitation] = useState<ProbeInvitation | null>(null);

  useEffect(() => tracker.start(), [tracker]);
  useEffect(() => {
    setPlans({ DP1: null, DP2: null });
    if (!project || consent === null) return;
    const abort = new AbortController();
    for (const point of ["DP1", "DP2"] as const) {
      void loadProbePlan(tracker.sessionId, point, abort.signal).then(
        (value) => {
          if (!abort.signal.aborted)
            setPlans((current) => ({ ...current, [point]: value }));
        },
      );
    }
    return () => abort.abort();
  }, [route.visitId, project, consent, tracker]);

  function offerProbe(decisionPoint: DecisionPoint, exitSequence: number) {
    if (invitation) return;
    const plan = plans[decisionPoint];
    const cohort = tracker.cohort();
    if (
      at_exit(plan, {
        decisionPoint,
        now: Date.now(),
        consent: consent === true,
        alreadyAsked:
          sessionStorage.getItem(askedKey(tracker.sessionId)) === "1",
        walletPopupOpen: attempt !== null,
        hasAttempted: tracker.hasAttempted(),
        cohort,
      }) === "show_probe" &&
      plan
    ) {
      setInvitation({
        plan,
        sessionId: tracker.sessionId,
        cohortAtShown: cohort,
        eventSeqAtShown: exitSequence,
      });
    }
  }

  function leaveProject() {
    if (!project) return;
    const exit = tracker.track("back_nav", "ProjectPage", {
      project_id: project.id,
    });
    setGateId(null);
    setAttempt(null);
    setError("");
    offerProbe("DP2", exit.seq);
  }

  useEffect(() => {
    function popstate() {
      const next = projectFromUrl();
      if (project && next !== project.id) leaveProject();
      setRoute({ id: next, visitId: uuid() });
    }
    window.addEventListener("popstate", popstate);
    return () => window.removeEventListener("popstate", popstate);
  });

  function openProject(id: string) {
    history.pushState(
      { fromList: true },
      "",
      `${location.pathname}${location.search}#/project/${id}`,
    );
    setRoute({ id, visitId: uuid() });
  }

  function back() {
    if (history.state?.fromList) history.back();
    else {
      leaveProject();
      history.replaceState(
        null,
        "",
        `${location.pathname}${location.search}#/`,
      );
      setRoute({ id: null, visitId: uuid() });
    }
  }

  function apply() {
    if (!project) return;
    tracker.track("apply_clicked", "ProjectPage", { project_id: project.id });
    setError("");
    setGateId(uuid());
  }

  function notNow() {
    if (!project) return;
    const exit = tracker.track("not_now_clicked", "ApplyModal", {
      project_id: project.id,
    });
    setGateId(null); // Exit UI immediately; offerProbe does no network work.
    setError("");
    offerProbe("DP1", exit.seq);
  }

  function connect() {
    if (!project || attempt) return;
    setError("");
    setAttempt(
      connectWallet(
        project.id,
        {
          onConnected: (connected) => {
            sessionStorage.setItem(
              sessionKey(tracker.sessionId, "connected"),
              "1",
            );
            setWallet(connected);
            setAttempt(null);
          },
          onFailure: (message) => {
            setError(message);
            setAttempt(null);
          },
        },
        tracker,
      ),
    );
  }

  function chooseConsent(allowed: boolean) {
    sessionStorage.setItem(
      sessionKey(tracker.sessionId, "consent"),
      allowed ? "yes" : "no",
    );
    setConsent(allowed);
  }

  return (
    <>
      <header className="site-header">
        <a
          className="wordmark"
          href="#/"
          onClick={(event) => {
            event.preventDefault();
            if (project) back();
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            c.
          </span>
          common ground
        </a>
        <nav className="main-navigation" aria-label="Main navigation">
          <a href="/" aria-current="page">
            DAO
          </a>
          <a href="/seed/">Demo User Seed</a>
          <a href="/report/">Report</a>
        </nav>
      </header>
      {consent === null ? (
        <main className="consent-page">
          <span className="consent-symbol" aria-hidden="true">
            ↗
          </span>
          <h1>
            A small start.
            <br />A shared future.
          </h1>
          <p>Explore DAO grant projects and try a short application flow.</p>
          <p>
            We may ask one optional question to help improve the application
            experience. You can skip it.
          </p>
          <p className="small muted">
            This is a demo. No real wallet or funds are used.
          </p>
          <div className="actions">
            <button
              className="button primary"
              onClick={() => chooseConsent(true)}
            >
              Continue with optional feedback
            </button>
            <button
              className="button text"
              onClick={() => chooseConsent(false)}
            >
              Continue without feedback
            </button>
          </div>
        </main>
      ) : project ? (
        <ProjectPage
          project={project}
          visitId={route.visitId}
          tracker={tracker}
          onBack={back}
          onApply={apply}
        />
      ) : (
        <ProjectList projects={projects} onSelect={openProject} />
      )}
      {project && gateId && (
        <ApplyModal
          project={project}
          wallet={wallet}
          displayId={gateId}
          tracker={tracker}
          error={error}
          onConnect={connect}
          onNotNow={notNow}
          onClose={() => setGateId(null)}
        />
      )}
      {attempt && <MockWalletPopup attempt={attempt} />}
      {invitation && (
        <ProbeCard
          invitation={invitation}
          onClose={() => setInvitation(null)}
        />
      )}
      <footer className="site-footer">
        <span>Common Ground</span>
        <span>Built for the commons. Open to possibility.</span>
      </footer>
    </>
  );
}
