# Spaced repetition scheduling and learner modelling for a speed+accuracy skill drill (Fretboard Trainer)

Context reminder for the report writer. The app's current model, per item (position + spelling, with A#/Bb "twins"), is:
- an FSRS-like card with S, D and R = 1/(1+t/(9S)), updated from right/wrong only;
- a separate speed model: running mean/variance of log answer time, shrunk toward the note-name mean and then the global mean (prior weight 2), with fluency mapped linearly from 1 at 0.6 s to 0 at 10 s, and expected time inflated as R decays;
- similarity-weighted "zone shape context";
- zone selection targeting about 80% success (adaptive range 65-92%), plus an unlock rule;
- in-run prompt weighting;
- a review run every 5th run.

Reviews happen minutes apart within a session.

---

## 1. FSRS (v4/v4.5/v5/v6): DSR model, short-term reviews, optimisation, benchmarks

### Takeaway
The app's forgetting curve, R = (1 + t/(9S))^-1, is exactly the FSRS **v4** curve. FSRS has since moved to a flatter power curve (v4.5, decay -0.5) and then a **trainable decay w20** (v6). FSRS-6 also added an explicit same-day stability formula, which matters because this app reviews minutes apart. On the open benchmark (~10k Anki collections), FSRS-6 beats FSRS-5, FSRS-4.5, v4, HLR, Ebisu and ACT-R on log loss and RMSE(bins). All the FSRS variants lose to sequence neural nets (GRU/LSTM/RWKV), which aren't practical client-side for one user. Every model predicts noticeably worse when same-day reviews are included.

### Cited Findings
- **FSRS v4 formulas** (17 params) — [awesome-fsrs wiki, The Algorithm](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm):
  - Initial stability: S0(G) = w_{G-1}.
  - Initial difficulty: D0(G) = w4 − (G−3)·w5.
  - Difficulty update: D' = w7·D0(3) + (1−w7)(D − w6(G−3)).
  - Forgetting curve: R = (1 + t/(9S))^-1. This is the app's curve.
  - Stability after success: S'r = S·(e^{w8}·(11−D)·S^{−w9}·(e^{w10(1−R)} − 1)·w15[G=2]·w16[G=4] + 1).
  - Post-lapse stability: S'f = w11·D^{−w12}·((S+1)^{w13} − 1)·e^{w14(1−R)}.
  - Defaults: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61].
- **FSRS-4.5** changed the curve to R = (1 + FACTOR·t/S)^DECAY with DECAY = −0.5 and FACTOR = 19/81, so that R(S,S) = 0.9. The interval is I(r,S) = (S/FACTOR)(r^{1/DECAY} − 1). — [awesome-fsrs wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)
- **FSRS-5** (19 params) — [awesome-fsrs wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm):
  - Initial difficulty: D0(G) = w4 − e^{w5(G−1)} + 1.
  - Linear damping: ΔD = −w6(G−3), then D' = D + ΔD·(10−D)/9.
  - Mean reversion toward D0(4): D'' = w7·D0(4) + (1−w7)·D'.
  - First same-day formula: S' = S·e^{w17(G−3+w18)}.
- **FSRS-6** (21 params) — [awesome-fsrs wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm):
  - Forgetting curve: R(t,S) = (1 + factor·t/S)^{−w20}, with factor = 0.9^{−1/w20} − 1 (so R(S,S) = 90% for any w20).
  - Same-day stability: S' = S·e^{w17(G−3+w18)}·S^{−w19}. SInc converges toward 1 and should be ≥ 1 for G ≥ 2, so stability grows fast when small and slowly when large.
  - Defaults: [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]. The final value, w20 = 0.1542, is a much flatter tail than v4's exponent of 1.
- The old fsrs4anki wiki cites MaiMemo's KDD and TKDE papers as the scheduling research behind FSRS. That page has moved to the awesome-fsrs wiki. — [fsrs4anki wiki (moved notice)](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm)
- **srs-benchmark method** — [srs-benchmark README](https://github.com/open-spaced-repetition/srs-benchmark):
  - Time-ordered evaluation with sklearn TimeSeriesSplit (train on older reviews, test on newer, 5 folds, first split train-only).
  - Two regimes. "Without same-day reviews": same-day reviews are excluded from evaluation, though FSRS-5+ still train on them. "With same-day reviews": everything is evaluated.
  - Baseline AVG (LL 0.3945, AUC 0.4997). An algorithm that doesn't beat AVG is not considered good.
- **srs-benchmark results** (LL / RMSE(bins) / AUC; no same-day, then with same-day) — [srs-benchmark README](https://github.com/open-spaced-repetition/srs-benchmark):

  | Model | LL | RMSE(bins) | AUC | LL (with same-day) | RMSE(bins) (with same-day) | AUC (with same-day) |
  |---|---|---|---|---|---|---|
  | FSRS-6 | 0.3460 | 0.0653 | 0.7034 | 0.3842 | 0.0985 | 0.6830 |
  | FSRS-5 | 0.3561 | 0.0742 | 0.7010 | 0.4565 | 0.1175 | 0.6761 |
  | FSRS-4.5 | 0.3625 | 0.0764 | 0.6891 | 0.4286 | 0.1033 | 0.6821 |
  | FSRS v4 | 0.3726 | 0.0838 | 0.6853 | 0.4848 | 0.1159 | 0.6662 |
  | HLR | 0.4694 | 0.1275 | 0.6369 | 0.705 | 0.1715 | 0.6104 |
  | ACT-R | 0.4033 | 0.1074 | 0.5225 | 0.3898 | 0.1240 | 0.5174 |
  | DASH | 0.3682 | 0.0838 | 0.6311 | 0.3487 | 0.0885 | 0.6533 |
  | Ebisu v2 | 0.4989 | 0.1627 | 0.6051 | 0.772 | 0.1846 | 0.5947 |
  | GRU | 0.3328 | 0.0549 | 0.7324 | 0.3141 | 0.0536 | 0.7606 |
  | LSTM | 0.3332 | 0.0538 | 0.7329 | 0.3140 | 0.0520 | 0.7622 |
  | RWKV-Instant | 0.2773 | 0.0250 | 0.8329 | 0.2660 | 0.0321 | 0.8450 |
  | FSRS-7 default params | 0.3620 | 0.0910 | 0.7029 | 0.3399 | 0.0895 | 0.7283 |
- **Caveats on the benchmark page** — [srs-benchmark README](https://github.com/open-spaced-repetition/srs-benchmark):
  - It gives two inconsistent dataset descriptions: 20k users/1.7B reviews and 10k users/727M reviews. The evaluated counts are about 350M reviews without same-day and about 519M with same-day.
  - The current README has no SM-2 row in its results tables (it appears only in a run command).
  - The only default-parameter row is for FSRS-7, which suggests a newer FSRS-7 exists. I did not research it.

### Inferences
- **Swap the curve.** The app uses v4's curve, which is the worst-calibrated of the FSRS family on the benchmark (LL 0.3726 vs 0.3460 for FSRS-6). Replacing it with the FSRS-6 curve adds one parameter (w20), keeps R(S,S) = 0.9 so S stays interpretable, and w20 can be fitted by 1-D grid search on the user's logs.
- **Minute-apart reviews don't grow S under the long-term formula.** With R ≈ 1 for a review minutes after the last one, the term (e^{w10(1−R)} − 1) ≈ 0, so S'r ≈ S. If the app applies the long-term success formula to within-session reviews, S barely changes. That is probably correct as "spacing-effect" behaviour, but then within-session success must be credited somewhere else, for example a short-term memory component (see section 4). If the app instead grows S on every in-session correct answer, it will overestimate long-term stability. Check which one it does.
- **Use FSRS-6's same-day update.** Its S^{−w19} damping lets small-S items grow quickly within a session while mature items barely move. That matches the app's need: early learning of a new zone happens within one session.
- **Expect short-term prediction to be hard.** "With same-day" metrics are clearly worse for every FSRS version. DASH/ACT-R-style and neural models degrade less, which suggests models with explicit multi-timescale history features cope better with short lags.
- **Replace the speed signal's role in grading.** FSRS's grade G (1-4) and the w15 (Hard) / w16 (Easy) multipliers give a ready slot for a speed-derived grade. A correct-but-slow answer maps to "Hard" and a correct-and-fast answer to "Easy". The app currently uses binary right/wrong only, so it discards information that FSRS's structure already accommodates (see section 5).

### Gaps
- I did not fetch Ye et al. KDD 2022 ("A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling") or the TKDE follow-up, so I have no verified details of the SSP/DHP formulation or its reported gains.
- I could not verify the FSRS optimiser's minimum review count or its exact training procedure. The benchmark README says only that a preset with "too few reviews" falls back to other parameters.
- The current FSRS-7 formulas were not researched.
- An SM-2 benchmark figure was not available on the fetched page.

---

## 2. Duolingo half-life regression (HLR) and sharing information across related items

### Takeaway
HLR models p = 2^(−Δ/h) with h = 2^(Θ·x). x holds sqrt-counts of correct/incorrect/total plus a sparse indicator per lexeme. Per-item ("lexeme tag") features barely improved prediction, overfit, and **hurt** users in a live A/B test. Removing them raised daily retention by 12%. The lesson for Fretboard Trainer: share information across items through a few dense, structured features (pitch class, string, fret region, spelling), not per-item free parameters fitted on sparse data. HLR also does poorly on the modern benchmark (LL 0.469 vs FSRS-6 0.346).

### Cited Findings
- **Model** — [Settles & Meeder 2016, ACL](https://aclanthology.org/P16-1174/):
  - p = 2^(−Δ/h), with Δ the lag since last practice and h the half-life; estimated h = 2^(Θ·x).
  - Loss: (p − p̂)² + α(h − ĥ)² + λ‖Θ‖², where the "observed" h = −Δ/log2(p).
  - Fitted with AdaGrad. Settings: λ = 0.1, α = 0.01, η = 0.001.
  - p̂ is bounded to [0.0001, 0.9999] and ĥ to [15 min, 9 months]. The 15-minute floor means HLR was never designed for within-session lags.
- **Features** — [Settles & Meeder 2016](https://aclanthology.org/P16-1174/):
  - Interaction counts: times seen, correct and incorrect. Square roots of the counts worked better than raw counts.
  - About 20k sparse lexeme-tag indicators meant to capture inherent difficulty, plus a bias.
  - Each data instance is a whole session: p is the proportion correct for that word in that session.
- **Pimsleur and Leitner as fixed-weight special cases** — [Settles & Meeder 2016](https://aclanthology.org/P16-1174/):
  - Pimsleur's schedule (5 s, 25 s, 2 min, 10 min, 1 h, 5 h, 1 d, 5 d, 25 d, 4 mo, 2 y) is reproduced by Θ = {x_n: 2.4, bias: −16.5}.
  - Leitner corresponds to Θ = {x⊕: 1, x⊖: −1}.
- **Offline results** (12.9M traces, 90/10 time split; MAE / AUC / CORh) — [Settles & Meeder 2016](https://aclanthology.org/P16-1174/):
  - HLR: 0.128 / 0.538 / 0.201.
  - HLR without lexeme features: 0.128 / 0.537 / 0.160.
  - HLR without the half-life loss term: MAE 0.350.
  - Leitner: 0.235 / **0.542** / −0.098.
  - Logistic regression: 0.211 / 0.513.
  - Constant p̄ = 0.859: MAE 0.175.
  - The half-life term was crucial (MAE more than doubles without it), and lexeme features "made limited impact". The authors attribute the low AUC partly to range restriction, since most recalls succeed.
- **Live A/B tests** — [Settles & Meeder 2016](https://aclanthology.org/P16-1174/):
  - HLR vs Leitner, about 1M students for 6 weeks: +0.3% any activity, −7.3% practice retention.
  - HLR without lexeme features vs HLR, 3.3M students: **+12.0%** any activity, +1.7% lessons, +9.5% practice.
  - Students complained that some words decayed rapidly no matter how much they practised. This was traced to highly negative lexeme weights: overfitting despite L2.
  - The authors suggest using denser decomposed features (part of speech, tense, etc., plus frequency and length) instead of sparse IDs.
- **Modern benchmark** — [srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark): HLR LL 0.4694, RMSE(bins) 0.1275, AUC 0.6369, well behind FSRS.

### Inferences
- **Item-level difficulty parameters are dangerous with one user's data.** Per-cell D values fitted from a handful of answers resemble HLR's sparse lexeme weights. Keep shrinkage strong and prefer shared factors:
  - pitch class (natural vs accidental);
  - string;
  - fret region (open / 1-4 / 5-9 / 10-12 / 12+), including the octave-repeat equivalence (fret n and n+12);
  - spelling (♯ vs ♭);
  - inlay landmark proximity.
- **Concrete design: an additive, HLR-style difficulty prior.** log-half-life (or initial D/S) = global + β_pitchclass + β_string + β_region + β_spelling, each with an L2 penalty. Use it to set the starting D and S of unseen cells, then let per-card FSRS updates take over. This is the "cold start" role. It replaces the ad-hoc "unlocked when half the cells are reachable from known neighbours" heuristic with a predictive prior.
- **The app's speed shrinkage is the right shape but unvalidated.** Shrinking toward the note-name mean and then the global mean is a reasonable hierarchical prior, but prior weight 2 should be fitted (see sections 3 and 6).

### Gaps
- I found no study of HLR-style shared features for music or motor-perceptual items. The transfer to fretboard positions is an inference.
- Zaidi et al. 2020 (an HLR extension with richer linguistic features) was seen only as a search result: [Zaidi et al. 2020](https://www.cl.cam.ac.uk/~apc38/pubs/zaidi_et-al_2020.pdf). I did not read it.

---

## 3. Knowledge tracing: BKT, PFA, Elo/IRT (Pelánek) and incorporating response time

### Takeaway
For factual drills with varied prior knowledge, Pelánek's group got the best practical results from a two-stage design:
1. An **Elo/Rasch prior** (learner skill vs item difficulty, K = α/(1+βn)) estimates knowledge before first practice.
2. **PFAE** (PFA with Elo-style updates) tracks current knowledge, plus an empirically fitted **staircase "time-since-last-attempt" boost**.

Hierarchical and networked extensions that share information between related items improved accuracy only slightly. BKT's discrete learned/unlearned assumption fits facts poorly. Math Garden (Klinkenberg et al. 2011) runs Elo with an explicit speed-accuracy scoring rule.

### Cited Findings
- **Basic Elo/Rasch prior** — [Pelánek et al. 2017, UMUAI](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf):
  - P = σ(θ_l − d_i); θ += K(correct − P); d += K(P − correct).
  - Uncertainty function U(n) = α/(1+βn). Grid search gave **α = 1, β = 0.06**, and the exact values are "not crucial".
  - Elo estimates correlate 0.97 with joint maximum-likelihood Rasch estimates, in a single pass.
- **Prior-knowledge model comparison** (3.9M first answers, 91k learners; RMSE / AUC) — [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf):
  - Baseline (mean of learner and item success rates): 0.4348 / 0.6797.
  - Elo: 0.4142 / 0.7431.
  - Particle-Bayes Elo: 0.4147, slightly worse than plain Elo.
  - Bayesian model with 3 skills: 0.4117.
  - Hierarchical model: 0.4115 / 0.7514.
  - Networked model: 0.4118.
  - Improvements over basic Elo are significant but small: 95% of predictions differ by less than 0.1.
- **Hierarchical model** — [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf):
  - P = σ(θ_l + θ_lc − d_i). The concept skill θ_lc is updated with γ·U(n_lc)·(correct − P).
  - Manually defined concepts that combine location and type worked best (ΔRMSE 0.00268). Too many concepts on a small item set (39 European countries) hurt.
- **Networked model** — [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf):
  - Each item i has a local skill. After an answer on i, every item j is updated by c_ij·U(n)·(correct − P), where c_ij is the Spearman correlation of correctness between items. Prediction is σ(w1·θ_l + w2·θ_li − d_i).
  - This is close to a multivariate Elo.
- **PFAE current-knowledge model** — [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf):
  - θ_li is initialised from the prior.
  - After a correct answer: θ += γ(1 − P). After a wrong answer: θ += δ·P. Fitted γ = 2.23 ± 0.05 and δ = −0.89 ± 0.04, stable across 10 data subsets.
  - Prediction uses P(θ_li + f(t)), where f is a **staircase function of time since last attempt** with bounds at 0, 60, 90, 150, 300, 600, 1800, 10800, 86400, 259200 and 2592000 s.
  - The fitted f is about +1.4 logits at about 1 min and about +0.5 by 10 min. It plateaus at about 0.5 from 10 min to 1 day, then falls to about 0 by about 1 month (Fig. 4).
  - Analytic forms (w/t; 1.6 − 0.1·log t) were badly calibrated.
  - PFAE was "quite a large improvement" over BKT and PFA.
  - BKT's discrete-transition assumption is implausible for declarative facts, whose memory activation develops gradually.
- **Math Garden** — [Klinkenberg, Straatemeier & van der Maas 2011, Computers & Education (UvA record)](https://dare.uva.nl/id/de65bb65-d198-4dbc-ac7b-bc25ca23e627):
  - It uses an Elo-based item response model with an explicit scoring rule. Ability and difficulty update after every answer, and both accuracy and response time enter the scoring rule.
  - Later work extends it with a dynamic K: [Tilburg/UMUAI record](https://research.tilburguniversity.edu/en/publications/balancing-stability-and-flexibility-investigating-a-dynamic-k-val/).
- **Maris & van der Maas 2012** (Psychometrika 77(4):615-633) — [IDEAS record](https://ideas.repec.org/a/spr/psycho/v77y2012i4p615-633.html); [UvA DARE](https://dare.uva.nl/id/257c9569-e69c-466b-b813-c48c1e65942c):
  - The response model is derived from an explicit time-limit scoring rule that combines response time and accuracy, treated as a sufficient statistic (exponential family).
  - The accuracy part reduces to a 2PL model, and the time limit determines item discrimination.
- **Pelánek 2024, UMUAI 34(3):729-752, "Leveraging response times in learning environments"** — [MU record](https://is.muni.cz/publication/2385339):
  - It reviews response-time distributions, aberrant behaviour, and modelling approaches for knowledge, affect, domain modelling and cheating detection.
  - It stresses understanding caveats before use. The full text was not retrieved.
- **Řihák 2015 (EDM)** describes an Elo-variant model for adaptive maths fluency practice "designed around" response times as evidence of mastery — [MU record](https://www.muni.cz/en/research/publications/1316790).

### Inferences
- **The app's FSRS-per-card plus "zone shape context" is roughly a networked model.** Pelánek's results imply that cross-item sharing helps a little on prediction, but mostly helps for cold start and for heterogeneous learners. Expect small calibration gains, so weight implementation effort accordingly.
- **A lightweight, well-evidenced alternative to test against FSRS on the app's own logs:** a global user skill, plus per-cell difficulty from additive factors (string, fret region, pitch class, spelling), plus PFAE per-cell updates, plus a fitted time-since-last-attempt staircase. It is cheap in JavaScript (a few dozen parameters), naturally handles minute-scale lags, and is the closest published analogue to this app (fact drill, in-session repetition, target success rate).
- **Use U(n) = α/(1+βn) with α ≈ 1, β ≈ 0.06 as the template** for the app's ad-hoc shrinkage (prior weight 2) and for any Elo-style difficulty estimate. Then fit β on the app's logs.

### Gaps
- Klinkenberg et al.'s exact scoring rule was not available in the fetched abstract. It is commonly described as the "high speed, high stakes" rule: score = (2·correct − 1)·(time limit − RT)/time limit, so fast correct answers earn the most and fast wrong answers lose the most. I did **not** verify this formula in a primary source this session, so confirm it before relying on it.
- I did not fetch van der Linden's hierarchical speed-accuracy model (2007; and "Conceptual issues in response-time modeling", 2009, J. Educ. Meas. 46(3):247-272, cited by Papoušek et al. 2015). Its structure (lognormal RT with person speed τ and item time-intensity β, correlated with ability and difficulty at a second level) comes from background knowledge and is unverified here.
- DKT (deep knowledge tracing) was not researched. It is also impractical for one user's data.

---

## 4. Optimal scheduling for learning within a fixed session; in-session spacing

### Takeaway
Formal optimal-scheduling results (Reddy et al. 2016 queueing/Leitner; Tabibian et al. "Memorize") say to review at a rate tied to recall probability, and to cap the rate of introducing new items, because a phase transition makes learning collapse when it is too high. Their memory models assume cross-session timescales, however. For minute-scale scheduling, the most directly usable evidence is:
- Pelánek's empirical time-effect staircase (a large short-term boost that decays over about 10 minutes);
- SlimStampen's ACT-R approach (repeat an item just before predicted activation falls below a threshold);
- Pelánek's question-selection scoring, which penalises recently asked items with −1/t.

### Cited Findings
- **Reddy, Labutov, Banerjee & Joachims (KDD 2016), "Unbounded Human Learning"** — [arXiv 1602.07032](https://arxiv.org/abs/1602.07032):
  - It models the Leitner system as a queueing network, with a tractable heuristic approximation for optimising review rates.
  - A Mechanical Turk experiment confirmed the predicted **sharp phase transition in learning outcomes as the new-item introduction rate increases**.
  - A later critique says the heuristic lacks provable guarantees, doesn't adapt to learner performance over time, and is Leitner-specific: [Tabibian et al., arXiv 1712.01856](https://arxiv.org/abs/1712.01856).
- **Tabibian, Upadhyay, De, Zarezade, Schölkopf & Gomez-Rodriguez, "Optimizing Human Learning"** (arXiv 1712.01856; published in PNAS 2019 as "Enhancing human learning via spaced repetition optimization") — [arXiv](https://arxiv.org/abs/1712.01856):
  - It casts spaced repetition as a marked temporal point process with optimal control.
  - For two memory models, the optimal reviewing schedule "is given by the recall probability of the content to be learned".
  - This yields the online algorithm MEMORIZE, evaluated on synthetic and Duolingo data.
  - The PNAS page returned 403, so I could not verify effect sizes.
- **Time-since-last-attempt effect within sessions**: a large boost at about 1 min (about 1.4 logits), decaying to about 0.5 by about 10 min, then flat until about 1 day — [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf).
- **Pelánek et al.'s question selection** — [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf):
  - A weighted sum of three scores:
    - S_prob = P_est/P_target if P_target ≥ P_est, else (1 − P_est)/(1 − P_target);
    - S_time = −1/t, with t in seconds since the item was last asked;
    - S_count = 1/√(1+n).
  - Weights: W_prob = 10, W_count = 10, W_time = 120, set by hand.
  - In an A/B test (1.3M answers, 20k learners), adaptive target-item selection mattered less for learning than adaptive choice of distractors. "Item selection does not seem to have a great impact on learning."
- **Target-difficulty experiment** (C50/C65/C80/C95; 3.3M answers, 37k learners) — [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf):
  - Achieved success ranged only from 65% to 90%.
  - Harder practice was associated with better learning, the main difference being that C95 was worse. Attrition bias is a caveat.
  - Easier conditions improved short-term survival, while harder conditions improved return rate.
  - Self-rated "appropriate" difficulty peaked at 60-70% success for out-of-school users and around 75% for in-school users.
  - This contrasts with Jansen et al. 2013 (Math Garden: 60/75/90% targets), where the easiest condition gave the best learning, mediated by more problems solved.
- **SlimStampen / MemoryLab (van Rijn group)** — [Sense, Meijer & van Rijn 2018, Frontiers in Education](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2018.00112/full); [Mindwise summary](https://mindwise-groningen.nl/capturing-the-dynamics-of-learning-and-forgetting-through-adaptive-retrieval-practice/):
  - It uses ACT-R declarative memory equations, with a decay ("rate of forgetting") parameter per item-learner pair, initialised at 0.3 and updated after every response from both accuracy and **latency**. A response slower than predicted raises the rate.
  - The system repeats an item before the model predicts it becomes irretrievable.

### Inferences
- **The app's design mostly diverges from these models in having no explicit short-term memory component.** "R as FSRS retrievability" can't represent the steep minutes-scale boost that Pelánek measured. Options, simplest first:
  1. Add a fitted staircase boost f(t_since_last) to the logit of predicted success. Use about 6 bins (≤1 min, 1-2.5 min, 2.5-5 min, 5-10 min, 10-30 min, 30 min-3 h) and fit the bin values from logs.
  2. Use FSRS-6's same-day S update for in-session reviews.
  3. Use an ACT-R-style activation sum over past attempts (SlimStampen) for the in-session layer.
- **Within a run, add a recency penalty** like −W/t_since_last_asked, so a just-missed cell isn't re-asked while its answer is still in working memory. Then re-ask it after a short gap (an expanding retrieval idea). The app's "recent failures" weight should be counterbalanced by this penalty.
- **Treat Reddy et al.'s phase transition as a warning for the unlock rule.** Unlocking zones too fast (introducing new cells faster than review capacity) can collapse learning. Monitor "new cells introduced per session" against the share of reviews on overdue cards.
- **The 80% target (adaptive 65-92%) is within the evidence-supported band**, but the evidence conflicts. Pelánek's data favours about 65-75% for engagement and harder practice for learning, while Math Garden favoured easier practice. For a speed-fluency goal, a higher success rate may be defensible, because fluency practice needs correct retrievals to speed up. That last point is an inference, not a cited result.
- **The "every 5th run is a review" rule is a fixed heuristic.** MEMORIZE-style logic would instead schedule reviews in proportion to forgetting risk (1 − R) and interleave them continuously.

### Gaps
- Lindsey, Shroyer, Pashler & Mozer 2014 (Psychological Science, personalized review; it used a Bayesian "DASH"-like model and reported gains on a semester-long cumulative exam) was not fetched, so its numbers are unverified. DASH does appear in the benchmark table above.
- I found no primary source giving an optimal *within-session* spacing schedule at the minute scale that is proven optimal rather than heuristic.
- Effect sizes for MEMORIZE could not be retrieved (403 on PNAS).

---

## 5. Response time as a memory-strength signal; speed-accuracy scoring

### Takeaway
Response time carries real information about the *next* recall. In a large fact-drill dataset (8M answers):
- after a **correct** answer, P(next correct) falls roughly linearly from 95% (fastest per-item decile) to about 80% (slowest);
- after an **incorrect** answer, the trend reverses weakly, from about 60% to 65%.

So RT must be interpreted separately for correct and incorrect answers, and normalised per item. SlimStampen goes further and uses latency directly to update each item's forgetting rate. A small study found the resulting rate-of-forgetting predicted delayed recall very well. The app's separate speed model throws this signal away for memory scheduling.

### Cited Findings
- **Papoušek, Pelánek, Řihák & Stanislav (EDM 2015)**, slepemapy.cz, 54k students, 1,458 facts, 8M+ answers — [EDM 2015 poster](https://www.educationaldatamining.org/EDM2015/proceedings/poster562-563.pdf):
  - **Distribution.** RTs are approximately log-normal, so use the median or mean of log times.
  - **Item and question-type dependence.** RTs depend strongly on item and question type: bigger click targets are faster, and denser maps are slower. The authors therefore bin RT by **per-item percentiles**.
  - **Current answer.** Correctness vs RT is non-monotonic: very fast answers mix solid knowledge and guessing, and the highest correctness falls in the 10-20th percentile.
  - **Next answer after a correct one:** about 95% (fast) down to about 80% (slow), roughly linear.
  - **Next answer after an incorrect one:** a weaker opposite trend (slower wrong answers are followed by more correct next answers).
  - **Slower students** answer fewer questions in the same total time, report more difficulty, have lower prior skill, and return less often.
- The 60%→65% numbers for the after-incorrect case are given in [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf). That paper also notes that Mettler, Massey & Kellman 2011 used RT for adaptive scheduling but without prior knowledge, and that incorporating RT was left for future work.
- **SlimStampen rate of forgetting** (n = 66, 35 Swahili-Dutch word pairs, one 20-minute session) — [Sense et al. 2018](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2018.00112/full):
  - Mean rate 0.296 (SD 0.046), computed only over items repeated at least 3 times.
  - Correlated strongly and negatively with test scores 80 minutes and 3 days later.
  - The best delayed-recall model contained only the rate of forgetting, explaining **62.4%** of variance, vs 1.2% for working memory capacity and 1.7% for general cognitive ability.
  - Authors' caveat: small, homogeneous sample of Dutch university students.
- **SlimStampen cold start**: a 2024 abstract reports data from 140k students. Data-driven prediction of the rate-of-forgetting parameter improves early-session estimates, "especially when based on fact-specific difficulty information" — [TEAP 2024 abstract](https://coms.events/teap-2024-regensburg/data/abstracts/en/abstract_0441.html).
- **Speed-accuracy response model (SARM)**: a scoring rule combining RT and accuracy under a time limit yields a 2PL accuracy model in which the time limit sets discrimination — [Maris & van der Maas 2012 (IDEAS)](https://ideas.repec.org/a/spr/psycho/v77y2012i4p615-633.html). Generalised by van Rijn & Ali 2018 — [Cambridge record](https://www.cambridge.org/core/journals/psychometrika/article/abs/generalized-speedaccuracy-response-model-for-dichotomous-items/0C07FC8723BEDCF70A569C876DC9874C).

### Inferences
- **Highest-value change: feed RT into the memory update.** Concretely:
  1. Compute an RT residual z = (log RT − predicted log RT for this cell) / sd. Use the app's existing shrunk mean/variance model; it already does the item normalisation the literature recommends.
  2. For correct answers, map z to an FSRS grade: z < −0.5 → Easy (4), −0.5..+1 → Good (3), > +1 → Hard (2). Fit the thresholds to maximise next-answer log-likelihood on logs.
  3. For incorrect answers, keep Again (1), but optionally let fast errors (likely confusions or guesses, e.g. wrong string) be treated differently from slow errors.

  This reuses FSRS's w15 and w16 machinery, and Papoušek's data supports the direction of the effect.
- **Treat the fluency mapping as provisional.** The fixed linear mapping (0.6 s → 1, 10 s → 0) is ad hoc, not evidence-based. Make it relative to the cell's own baseline, or to the user's floor (e.g. the 10th percentile of all their correct RTs), because pitch-detection latency and fret-hand travel add item-dependent non-memory time. The geography case shows the same thing: RT depends on target size and map density.
- **Validate the coupling.** Inflating expected RT as R decays is a reasonable coupling. Check it empirically by regressing log RT on (1 − R) and the time-since-last bins.
- **Use a simplified Math-Garden-style score as one optional fluency objective** for zone mastery: credit (time limit − RT) when correct and penalise it when wrong. This rewards fast correct answers and penalises fast wrong ones, which discourages guess-spamming. The formula itself is unverified (see section 3's Gaps).
- **Expect RT to separate fast-from-slow recall better than it predicts accuracy.** The app's correct-answer rate in mature zones will be near the ceiling, so binary-outcome AUC will be low (cf. HLR's AUC of about 0.54 at p̄ = 0.86). RT is then the main remaining signal of strength.

### Gaps
- I could not retrieve the full text of Pelánek 2024 (UMUAI) on response times. Its specific recommendations (cutoffs for aberrant RTs, how to handle them) are unverified.
- I found no study of response time as a retention predictor specifically for motor/perceptual instrument skills or pitch-detection input.
- Wang & Heffernan 2012 ("Leveraging first response time into the knowledge tracing model", EDM) and Mettler et al. 2011 (ARTS, response-time-based adaptive sequencing) are cited by the papers above but were not read.

---

## 6. Evaluating and fitting the model from the app's own logs

### Takeaway
Evaluate the app the way srs-benchmark and Pelánek do:
- **Replay the log chronologically, predicting before each update**, so the evaluation is online and has no leakage.
- Score with **log loss** as the primary calibration metric, **RMSE(bins)** grouped by lag, review count and lapse count, and **AUC** for discrimination, always against a constant **AVG baseline**.
- Fit the small number of free parameters (w20, short-term bins, shrinkage β, RT-grade thresholds) by grid or coordinate search on early data and test on later data.

Report same-day/within-session and cross-day predictions separately, because they behave very differently.

### Cited Findings
- **srs-benchmark metrics and split** — [srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark):
  - Log loss.
  - RMSE(bins): reviews are grouped by interval length, review count and lapse count. Within each bin, the squared difference between mean predicted and mean actual recall is weighted by bin size, then square-rooted.
  - AUC.
  - TimeSeriesSplit with 5 folds, the first used for training only.
  - The page notes a metric exploit (RMSE-BINS-EXPLOIT reaches 0.0135 by gaming the bins). Don't rely on RMSE(bins) alone.
- **Pelánek et al.'s practice** — [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf):
  - Models run online and evaluation uses only predictions on the test portion, while training continues.
  - RMSE is the primary metric because the application uses absolute probability values; LL and AUC are also reported.
  - Meta-parameters are fitted by grid search (Elo α, β) or greedy descent (PFAE γ, δ and staircase values), with stability checked across 10 data subsets.
  - Different models' predictions were highly correlated (about 0.97), so improvements show up as small metric differences.
  - They cite Pelánek 2015, "Metrics for evaluation of student models" (JEDM 7(2)), for metric choice.
- **HLR's metrics** — [Settles & Meeder 2016](https://aclanthology.org/P16-1174/):
  - MAE, AUC and Spearman correlation of predicted vs algebraic half-life, with a 90/10 chronological split.
  - Low AUC is expected under range restriction (most answers correct).
  - Offline gains (45% lower MAE) did not straightforwardly translate into engagement: the live tests showed mixed and even opposite effects.
- **Learning outcomes need reference questions.** Pelánek et al. inserted unbiased "reference questions" (every 10th question was an open question on a random item) to measure learning curves free of adaptive-selection bias, and noted attrition bias — [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf).

### Inferences
- **A concrete evaluation harness for a client-side JavaScript app** (feasible for hundreds to tens of thousands of answers):
  1. **Log schema.** Record per answer: timestamp, cell id, spelling, correct, RT, detection confidence, run type (normal/review), and model predictions made before the update (p_correct, predicted log RT, R, S, D). Logging predictions at answer time gives free "online" evaluation without replay.
  2. **Replay engine.** Re-run any candidate model over the full log in order. This makes model variants comparable offline (A/B on history).
  3. **Metrics.** Report all of these:
     - LL and AUC overall;
     - LL split by lag bucket (< 2 min, 2-10 min, 10 min-3 h, 3 h-1 d, > 1 d), because the app mixes in-session and cross-day reviews;
     - RMSE(bins) on (lag bucket × review count × lapse count);
     - a calibration plot (10 bins of predicted p vs observed rate);
     - for the speed model, RMSE of log RT on correct answers and coverage of predicted intervals.
  4. **Baselines.** Use AVG (the global success rate), per-cell running mean, Elo (global skill + cell difficulty, U(n) = 1/(1+0.06n)), and the current app model.
  5. **Fitting.** With only a few hundred answers, fit at most about 5-10 global parameters. Use FSRS defaults for the rest, as the FSRS-7 default-params row shows default-parameter FSRS is competitive. Re-fit periodically (e.g. every 500 new answers) with the train-on-past/test-on-future split.
  6. **Learning measure.** Every Nth prompt, ask a random unlocked cell regardless of model state (a reference probe) to get an unbiased estimate of true accuracy and RT across the fretboard. Without it, adaptive selection biases every success-rate statistic toward the target rate.
- **Calibration is the key property** because the app targets an absolute success rate (about 80%). Predicted-vs-observed calibration within the 0.6-0.95 range matters more than AUC.

### Gaps
- I did not obtain the text of Pelánek 2015 "Metrics for evaluation of student models" (JEDM), which discusses metric choice in depth.
- I found no source on the minimum data needed to fit FSRS-6's 21 parameters for one user. The general expectation of overfitting with few reviews is an inference.

---

## 7. Transfer between related items: same pitch class across strings, octave shapes, twins

### Takeaway
Published learner models share information between related items in three increasingly flexible ways:
1. **Additive shared features** (HLR lexeme features; Elo concept skills);
2. **Hierarchical skills** (global + concept + item);
3. **Networked/multivariate updates** weighted by item-item correlation.

Each gave real but small prediction gains in large datasets. Sparse per-item parameters overfit, and in one case harmed users. For one user, a small hierarchy of dense factors fitted with strong regularisation is the evidence-consistent choice. The correlation-weighted network is close to what the app's "zone shape context" already does.

### Cited Findings
- **Hierarchical Elo**: P = σ(θ_l + θ_lc − d_i), with the concept skill updated at sensitivity γ. Manually specified concepts that combine two dimensions (location × type) beat single-dimension and automatic clustering on the full item set. On a small set (39 items), too many concepts hurt, and data-corrected manual concepts did best — [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf).
- **Networked Elo**: an answer on item i updates local skills of all j by c_ij·U(n)·(correct − P), with c_ij the Spearman correlation of correctness among shared learners. It yields interpretable clusters (Baltics, Balkans, "well-known countries"), and its accuracy is about equal to the hierarchical model — [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf).
- **Benefit grows with heterogeneity.** On a heterogeneous population, basic Elo had significantly higher RMSE, while the hierarchical and networked models were robust — [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf).
- **Sparse per-item features overfit; prefer dense components.** HLR lexeme-tag indicators overfit, and removing them improved retention by 12%. The authors recommend decomposing tags into denser generic component features — [Settles & Meeder 2016](https://aclanthology.org/P16-1174/).
- **Fact-specific difficulty helps cold start.** It improves early-session estimates of the rate-of-forgetting parameter in SlimStampen at 140k-student scale — [TEAP 2024 abstract](https://coms.events/teap-2024-regensburg/data/abstracts/en/abstract_0441.html).

### Inferences
- **Recommended item-family structure for fretboard cells:**
  - **Logit (or initial-D) prior** = user global skill + string effect + fret-region effect + pitch-class effect + spelling effect (♯/♭) + an "octave twin" link (fret n ↔ n+12 on the same string). Each effect has an Elo-style update with U(n) = α/(1+βn), and per-cell deviations shrink toward this prior.
  - **Twin spellings (A#/Bb)** share the positional memory: same cell, same pitch. A natural model is one shared positional stability plus a small spelling-specific offset, rather than two linked cards. Linked FSRS cards that both update fully on one answer would double-count evidence. That is inference: check how the app currently propagates.
  - **Networked propagation** (the app's similarity-weighted context) should be damped: c_ij·U(n), with c_ij either fixed by music-theory similarity or learned from the user's own error correlations once enough data exists. Pelánek's gains from this were small, so it should not dominate the per-cell evidence.
- **Run the hierarchical model's ablation on the app's logs** (with vs without each factor) as the "concept quality" test Pelánek used. Keep a factor only if held-out LL improves.
- **Likely real structure** (needs validating on logs): natural notes are easier than accidentals, low E/A strings are known better than G/B, and the 12th fret acts as a reset landmark. This is guitar-pedagogy intuition, not sourced.

### Gaps
- I found no published learner-model study for musical instrument fretboard or note-location learning, or for transfer between octave-equivalent positions. All fretboard-specific structure here is inference.
- I did not research Bayesian hierarchical alternatives (e.g. Khajah et al. 2014 latent-factor + KT; González-Brenes et al. 2014 "General features in knowledge tracing"). Pelánek et al. note they need EM/MCMC, which is "not easily adapted" to online systems — [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf).
