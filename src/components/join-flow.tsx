"use client";

/**
 * Interactive signup flow. A faithful port of the join block in assets/js/site.js
 * (same markup, class names, timings and keyboard behaviour), adapted to React state
 * and a Server Action for submission. The vanilla site.js copy has this block removed
 * so it does not double-bind.
 */
import { useActionState, useEffect, useRef, useState } from "react";
import { submitJoin, type JoinState } from "@/app/join/actions";
import { Icon } from "@/components/icons";

const AVATARS: Record<string, string> = {
  cyber_02: "Violet cyber",
  alien_01: "Magenta alien",
  cyber_01: "Cyan cyber",
  robot_02: "Blue robot",
  neon_01: "Green neon",
  neon_02: "Pink neon",
  pixel_01: "Orange pixel",
  robot_01: "Gold robot",
};

export default function JoinFlow({
  trap,
  invited,
  avPick,
}: {
  trap: string;
  invited: boolean;
  avPick: string;
}) {
  const [state, formAction, pending] = useActionState<JoinState, FormData>(submitJoin, {
    errors: {},
    old: { email: "", name: "", avatar: "" },
  });
  const [step, setStep] = useState(1);
  const [animating, setAnimating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [willErr, setWillErr] = useState(false);
  const [picked, setPicked] = useState<string>(AVATARS[avPick] ? avPick : "");
  const [shaking, setShaking] = useState(false);
  const [pulse, setPulse] = useState<"nod" | "shake" | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const reduce =
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const errors = state.errors;
  const old = state.old;

  // Server-rendered/server-returned errors decide where to start.
  useEffect(() => {
    if (errors.name && !errors.email) setStep(2);
    else if (errors.email || errors.form) setStep(state.resetStep ?? 1);
  }, [errors, state.resetStep]);

  // Unlock the form after a Back navigation following a failed submit.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // Put server-side old values back into inputs (only when they arrive with errors).
  useEffect(() => {
    if (old.email && emailRef.current) emailRef.current.value = old.email;
    if (old.name && nameRef.current) nameRef.current.value = old.name;
  }, [old.email, old.name]);

  useEffect(() => {
    if (pending && !busy) setBusy(true);
    if (!pending && busy) setBusy(false);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  function fire(cls: "nod" | "shake", ms: number) {
    if (reduce) return;
    setPulse(cls);
    setTimeout(() => setPulse(null), ms);
  }

  function go(i: number) {
    if (i === step || animating || i < 1 || i > 3) return;
    const from = wrapRef.current?.children[step - 1] as HTMLElement | undefined;
    const toEl = wrapRef.current?.children[i - 1] as HTMLElement | undefined;
    setStep(i);
    if (reduce || !from || !toEl || !wrapRef.current) {
      focusStep(i);
      return;
    }
    setAnimating(true);
    const wrap = wrapRef.current;
    const back = i < step;
    from.classList.remove("is-active");
    from.classList.toggle("back", back);
    from.classList.add("is-leaving");
    toEl.classList.toggle("back", back);
    toEl.classList.add("is-active");
    wrap.style.height = `${from.offsetHeight}px`;
    requestAnimationFrame(() => {
      wrap.style.height = `${toEl.offsetHeight}px`;
    });
    fire("nod", 520);
    setTimeout(() => {
      from.classList.remove("is-leaving", "back");
      toEl.classList.remove("back");
      wrap.style.height = "";
      setAnimating(false);
      focusStep(i);
    }, 430);
  }

  function focusStep(i: number) {
    const el = wrapRef.current?.children[i - 1] as HTMLElement | undefined;
    if (!el) return;
    const f = el.querySelector<HTMLInputElement>("input[type=email],input[type=text]");
    if (f) f.focus({ preventScroll: true });
    else el.querySelector<HTMLElement>(".q")?.focus({ preventScroll: true });
  }

  function emailOk(v: string): boolean {
    return v.trim().length <= 190 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  }
  function nameOk(v: string): boolean {
    const t = v.trim();
    return t.length <= 40 && !/https?:|www\./i.test(t) && !/[<>]/.test(t);
  }
  function bad(which: "email" | "name") {
    const input = which === "email" ? emailRef.current : nameRef.current;
    if (!input) return;
    setWillErr(false);
    input.setAttribute("aria-invalid", "true");
    setShaking(true);
    fire("shake", 360);
    setTimeout(() => setShaking(false), 400);
    input.focus();
  }
  function clearBad(which: "email" | "name") {
    const input = which === "email" ? emailRef.current : nameRef.current;
    if (input) input.removeAttribute("aria-invalid");
  }

  function next() {
    if (step === 1) {
      if (!emailOk(emailRef.current?.value ?? "")) return bad("email");
      clearBad("email");
      go(2);
    } else if (step === 2) {
      if (!nameOk(nameRef.current?.value ?? "")) return bad("name");
      clearBad("name");
      go(3);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    const t = e.target as HTMLElement;
    if (
      e.key === "Enter" &&
      t.tagName === "INPUT" &&
      (t as HTMLInputElement).type !== "radio" &&
      step < 3
    ) {
      e.preventDefault();
      next();
    }
  }

  function onBeforeSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!emailOk(emailRef.current?.value ?? "")) {
      e.preventDefault();
      setStep(1);
      setTimeout(() => bad("email"), reduce ? 0 : 460);
      return;
    }
    if (!nameOk(nameRef.current?.value ?? "")) {
      e.preventDefault();
      setStep(2);
      setTimeout(() => bad("name"), reduce ? 0 : 460);
      return;
    }
    if (busy || willErr) return;
  }

  const emailErr = errors.email ?? "";
  const nameErr = errors.name ?? "";

  return (
    <>
      <div className={`avstage ${picked !== "" ? "has-pick" : ""} ${pulse ? pulse : ""} ${busy ? "busy" : ""}`} id="avstage">
        <div className="avcore">
          <img className="avmark" src="/assets/img/logo-mark.png" width={112} height={112} alt="Web3Edu" />
          {picked !== "" && (
            <img className="avpick" src={`/assets/avatars/${picked}.svg`} width={112} height={112} alt="" />
          )}
        </div>
      </div>
      {invited && <p className="invite">You’re joining with a friend’s invite</p>}
      <div className="prog" role="progressbar" aria-label="Signup progress" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
        <i className={step >= 1 ? "on" : ""} />
        <i className={step >= 2 ? "on" : ""} />
        <i className={step >= 3 ? "on" : ""} />
      </div>
      <p className="sr" id="prog-txt" aria-live="polite">Step {step} of 3</p>

      <form id="join-form" action={formAction} noValidate onSubmit={onBeforeSubmit} onKeyDown={onKeyDown}>
        <input type="hidden" name="_t" value={trap} />
        <div className="hp" aria-hidden="true">
          <label>
            Website <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        {errors.form && <div className="form-error" role="alert">{errors.form}</div>}

        <div className="stepswrap" ref={wrapRef}>
          <div className={`step ${step === 1 ? "is-active" : ""}`} data-step="1">
            <h1 className="q" tabIndex={-1}>Be an early member.</h1>
            <p className="q-sub">One email gets you on the list.</p>
            <label className="field">
              <span className="sr">Email address</span>
              <input
                className={`input ${shaking && step === 1 ? "shake" : ""}`}
                type="email"
                name="email"
                id="email"
                inputMode="email"
                enterKeyHint="next"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={190}
                placeholder="you@example.com"
                required
                defaultValue={old.email}
                aria-invalid={emailErr !== "" ? true : undefined}
                aria-describedby="email-err"
                ref={emailRef}
                onInput={() => clearBad("email")}
              />
            </label>
            <p className="err" id="email-err" role="alert">{emailErr}</p>
            <button type="button" className="btn btn-primary btn-block" data-next onClick={next}>
              Continue<Icon name="arrow" className="arrow" />
            </button>
            <p className="hint">Press Enter to continue. No spam, and no password.</p>
          </div>

          <div className={`step ${step === 2 ? "is-active" : ""}`} data-step="2">
            <h2 className="q" tabIndex={-1}>What should we call you?</h2>
            <p className="q-sub">Optional. It appears on your pass.</p>
            <label className="field">
              <span className="sr">First name (optional)</span>
              <input
                className={`input ${shaking && step === 2 ? "shake" : ""}`}
                type="text"
                name="name"
                id="name"
                enterKeyHint="next"
                autoComplete="given-name"
                maxLength={40}
                placeholder="First name"
                defaultValue={old.name}
                aria-invalid={nameErr !== "" ? true : undefined}
                aria-describedby="name-err"
                ref={nameRef}
                onInput={() => clearBad("name")}
              />
            </label>
            <p className="err" id="name-err" role="alert">{nameErr}</p>
            <button type="button" className="btn btn-primary btn-block" data-next onClick={next}>
              Continue<Icon name="arrow" className="arrow" />
            </button>
            <p className="hint">You can leave this empty.</p>
            <button type="button" className="btn btn-ghost btn-block" data-back onClick={() => go(1)}>Back</button>
          </div>

          <div className={`step ${step === 3 ? "is-active" : ""}`} data-step="3">
            <h2 className="q" tabIndex={-1}>Pick your avatar.</h2>
            <p className="q-sub">Optional. It appears on your pass.</p>
            <fieldset className="avatars">
              <legend className="sr">Choose an avatar for your pass</legend>
              {Object.entries(AVATARS).map(([key, label]) => (
                <label className="av" key={key}>
                  <input
                    type="radio"
                    name="avatar"
                    value={key}
                    defaultChecked={picked === key}
                    onChange={(e) => {
                      if (e.currentTarget.checked) {
                        setPicked(key);
                        fire("nod", 520);
                      }
                    }}
                  />
                  <img src={`/assets/avatars/${key}.svg`} width={80} height={80} alt={label} loading="lazy" />
                  <span className="tick"><Icon name="check" /></span>
                </label>
              ))}
            </fieldset>
            {errors.avatar && <p className="err" role="alert">{errors.avatar}</p>}
            <button
              type="button"
              className="skip-av"
              onClick={() => {
                setPicked("");
                const radios = document.querySelectorAll<HTMLInputElement>('input[name=avatar]');
                radios.forEach((r) => (r.checked = false));
                fire("nod", 520);
                showToast("Using the Web3Edu cube");
              }}
            >
              Use the Web3Edu cube instead
            </button>
            <button
              type="submit"
              className={`btn btn-primary btn-block ${busy ? "is-loading" : ""} ${willErr ? "" : ""}`}
              id="join-submit"
              aria-busy={busy ? "true" : undefined}
              onClick={() => {
                // client-side pre-check marks busy so double taps don't duplicate
                if (emailOk(emailRef.current?.value ?? "") && nameOk(nameRef.current?.value ?? "")) setBusy(true);
              }}
            >
              {busy ? "Joining…" : "Join the waitlist"}
            </button>
            <p className="legal-hint">
              By joining you agree to receive emails about Web3Edu’s launch. See the <a href="/privacy">privacy notice</a>. You can unsubscribe from campaign emails at any time.
            </p>
            <button type="button" className="btn btn-ghost btn-block" data-back onClick={() => go(2)}>Back</button>
          </div>
        </div>
      </form>
    </>
  );
}

function showToast(msg: string) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

