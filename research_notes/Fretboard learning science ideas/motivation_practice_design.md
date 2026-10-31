# Motivation, Gamification and Practice-Session Design for a Solo Fretboard Drill App

Context: "Fretboard Trainer" is a local, single-user app. The learner plays prompted notes, pitch detection grades them, difficulty adapts toward ~80% success, and the app shows run summaries and a mastery heatmap. It has no streaks, goals, levels or badges.

Source-handling note: most items below were checked in this session through web search or fetched pages. Items marked **[prior knowledge, DOI link]** are standard citations I did not re-fetch in this session. The report writer should treat them as reliable bibliographic pointers, but should not quote exact numbers from them unless they are verified.

## 1. Gamification meta-analyses: which elements help, which are neutral or harmful

### Takeaway
Gamification has small-to-medium average effects. The effect on cognitive learning (g ≈ .49) is more robust than the effects on motivation (g ≈ .36) or behaviour (g ≈ .25). Results vary widely across studies, and the elements and their context matter more than whether something is "gamified". Leaderboards and mandatory badges can lower intrinsic motivation and grades. Feedback and progress elements are the safest bets for a solo app.

### Cited Findings
- **Sailer & Homner (2020), *Educational Psychology Review* 32** (online Aug 2019):
  - Cognitive learning outcomes: g = .49 (k = 19, N = 1,686). This effect held up in the subset of methodologically rigorous studies.
  - Motivational outcomes: g = .36 (k = 16, N = 2,246).
  - Behavioural outcomes: g = .25 (k = 9, N = 951, 95% CI [.04, .46]).
  - The motivational and behavioural effects were *less stable* when only rigorous studies were kept. Heterogeneity was substantial.
  - Game fiction and social interaction were significant moderators for behavioural outcomes.
  - Sources: [Uni Augsburg OPUS record](https://opus.bibliothek.uni-augsburg.de/opus4/frontdoor/index/index/docId/109056); [full-text PDF](https://opus.bibliothek.uni-augsburg.de/opus4/files/109056/109056.pdf); [gamification-research.org summary](https://gamification-research.org/2019/08/does-gamification-of-learning-work/)
- **Koivisto & Hamari (2019), *Int. J. Information Management* 45:191–210.** Reviewed and categorised over 800 gamification papers. They described the field as having advanced "without an agenda, theoretical guidance or a clear picture" — [Tampere Univ. page](https://webpages.tuni.fi/gamification/2019/06/24/the-rise-of-motivational-information-systems-a-review-of-gamification-research/); [open PDF](https://trepo.tuni.fi/bitstream/10024/115953/2/the_rise_of_motivational_2019.pdf)
  - I did not extract the review's element-level findings (points, badges, leaderboards) in this session.
- **Hamari, Koivisto & Sarsa (2014), "Does gamification work?" (HICSS).** This is the predecessor review that Koivisto & Hamari 2019 updated. Its widely cited conclusion is that effects are mostly positive but depend on context and on the users — [prior knowledge, DOI](https://doi.org/10.1109/HICSS.2014.377); predecessor relationship confirmed at [Tampere page](https://webpages.tuni.fi/gamification/?p=1269)
- **Hanus & Fox (2015), *Computers & Education* 80:152–161.** One-semester longitudinal study, N = 80, gamified vs identical non-gamified communication course. The gamified course had a leaderboard and *mandatory* badges.
  - Students in the gamified course reported lower satisfaction and lower intrinsic motivation.
  - They also had lower final-exam scores, and intrinsic motivation mediated the effect on exam scores.
  - The authors suggested social comparison through the leaderboard, or the requirement to earn badges, as likely causes.
  - Caveat: single study, small sample.
  - Sources: [SpringerOpen critical review table](https://educationaltechnologyjournal.springeropen.com/articles/10.1186/s41239-017-0042-5/tables/13); [Academia profile](https://osu.academia.edu/MichaelHanus)

### Inferences
- For a solo, local app, the gamification elements best supported by evidence are **feedback, visible progress and goals**. Leaderboards need other people, and the one strong study of leaderboards plus mandatory badges found harm.
- **Points and XP add little** beyond the accuracy and time data the app already shows. They risk making the score, rather than fretboard knowledge, the goal.
- The cognitive effect in Sailer & Homner is the most robust result, but it is an average over heterogeneous classroom studies. It does not show that any *specific* element, such as badges, improves fretboard recall.
- If badges are added, they should be **optional, informational and tied to competence**. Examples: "all natural notes on string 5 under 2 s", or "first full-neck sweep at ≥90%". They should not be required, and they should not reward raw volume (see the overjustification effect, section 2).

### Gaps
- The full-text moderator results of Sailer & Homner for individual elements (points, badges, leaderboards, progress bars) were not extracted.
- I found no meta-analysis isolating gamification effects on *motor or musical* skill learning.

## 2. Self-determination theory and the overjustification effect

### Takeaway
Self-determination theory (SDT) predicts that experiences supporting autonomy, competence and relatedness sustain intrinsic motivation. Expected, tangible rewards contingent on the task tend to undermine free-choice intrinsic motivation (d ≈ −.28 to −.40). Informational feedback that signals competence does not have this effect. The app's design should lean on competence information rather than on rewards.

### Cited Findings
- **Deci, Koestner & Ryan (1999), *Psychological Bulletin* 125(6):627–668.** Meta-analysis of 128 experiments.
  - Rewards undermined free-choice intrinsic motivation when they were engagement-contingent (d = −.40), completion-contingent (d = −.36) or performance-contingent (d = −.28).
  - All rewards, all tangible rewards and all expected rewards also showed undermining effects.
  - Tangible rewards also reduced self-reported interest.
  - Sources: [PDF](https://home.ubalt.edu/ntygmitc/642/Articles%20syllabus/Deci%20Koestner%20Ryan%20meta%20IM%20psy%20bull%2099.pdf); [2001 follow-up, Review of Educational Research](https://journals.sagepub.com/doi/10.3102/00346543071001001)
  - The authors disputed the opposite conclusion of Cameron & Pierce (1994). This debate was historically contentious, and the "seriously flawed" characterisation is the authors' own framing — [SDT 2001 PDF](https://www.selfdeterminationtheory.org/SDT/documents/2001_DeciKoestnerRyan.pdf)
  - Same meta-analysis, [prior knowledge, not re-fetched]: positive verbal feedback tended to *enhance* intrinsic motivation, which is the basis of the "informational vs controlling" distinction in Cognitive Evaluation Theory — [PDF](https://leeds-faculty.colorado.edu/dahe7472/deci%201999.pdf)
- **Sanli, Patterson, Bray & Lee (2013), *Frontiers in Psychology* 3:611.**
  - This is a theoretical review, *not* a meta-analysis (the task brief called it one).
  - It frames self-controlled motor-learning protocols through SDT's micro-theories: Basic Needs, Cognitive Evaluation and Organismic Integration.
  - It argues that self-control supports feelings of autonomy and competence.
  - Sources: [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3576889); [PDF](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2012.00611/pdf)

### Inferences
- The app's current design (accuracy, personal-baseline timing, "faster than your usual") is already **informational competence feedback**, which the SDT evidence supports. Keep it as the core.
- **Competence:** surface clear, self-referenced progress evidence. Examples: "string 3 median time fell from 2.4 s to 1.6 s this month", or the heatmap filling in over time.
- **Autonomy:** offer meaningful choices without forcing them. Examples: which strings or regions to focus on, run length, "let the app choose" vs "I choose". See section 7 for the caveats on learning effects.
- **Relatedness:** this is weak in a solo app. Low-cost options that keep the app solo:
  - framing drills around the music the learner cares about (for example "notes you need for this song or key");
  - an exportable progress card to share with a teacher, if the learner wants to.
- **Avoid:** expected rewards for *volume*, such as "XP per prompt" or "a badge for 1,000 notes played". These are engagement- or completion-contingent rewards, the categories with the largest undermining effects.

### Gaps
- I found no direct SDT-based randomised trial of a music-practice app.
- I did not locate the 1999 effect size for positive feedback in this session.

## 3. Goals, implementation intentions, streaks, habit formation and reminders

### Takeaway
Two things have strong lab evidence: specific, proximal goals, and "if-then" implementation intentions (d ≈ .65 on goal attainment).
- Streaks reliably increase *engagement*. Duolingo's company data and Silverman & Barasch (2023) support this.
- A broken streak demotivates, and people often drop off after one.
- In habit research, a single missed day barely affects habit formation, so a design that treats one miss as catastrophic does not match the evidence.

### Cited Findings
- **Gollwitzer & Sheeran (2006), *Advances in Experimental Social Psychology* 38:69–119.**
  - Meta-analysis of 94 independent studies, more than 8,000 participants.
  - Implementation intentions had a medium-to-large effect on goal attainment, d = .65.
  - Most comparisons were against controls who had already formed goal intentions.
  - Sources: [Univ. Konstanz publication page](https://www.socmot.uni-konstanz.de/publications/implementation-intentions-and-goal-achievement-meta-analysis-effects-and-processes); [KOPS record](https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f)
  - A 2024 update (Sheeran, Listrom & Gollwitzer) reportedly covers 642 tests. That figure comes only from a secondary blog — [siliconcanals](https://siliconcanals.com/t-implementation-intentions-when-where-how-goal-achievement/)
- **Locke & Latham (2002), *American Psychologist* 57(9):705–717.** Specific, difficult goals raise performance more than "do your best" goals. Goal effects depend on feedback, commitment and task complexity, and for complex or novel tasks, learning goals can beat performance goals — [prior knowledge, DOI](https://doi.org/10.1037/0003-066X.57.9.705)
- **Duolingo's own data** (company blog, relative changes, not peer-reviewed) — [Duolingo blog, "Improving the streak"](https://blog.duolingo.com/improving-the-streak):
  - Learners who reached a 7-day streak were 2.4× more likely to return the next day.
  - An A/B test that separated the daily goal from the streak (any lesson extends the streak) produced:
    - +3.3% Day-14 retention;
    - +1% daily active learners;
    - +10.5% daily learners on a streak (+19% among new learners).
  - Fewer learners reached their daily goals without the streak's motivation.
  - Duolingo argues that "lowering the barriers to building a consistent daily habit is more important... than how much you learn each day," and the post says no learning-outcome data were reported.
- **Duolingo engineering blog:** learners who binged lessons were more likely to quit than those who paced themselves — [Making Duolingo](https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals)
- **Third-party write-up (unverified):** a streak-goal *selection* screen improved retention even though the chosen value was never used. This is attributed to the commitment effect of choosing — [Lazyweb](https://experiments.lazyweb.com/research/duolingo-streak-goals-retention). Secondary source; treat with caution.
- **Silverman & Barasch (2023), *Journal of Consumer Research* 49(6):1095–1117.**
  - Across seven studies, people shown an intact streak in their behaviour log engaged more afterwards than those shown a broken streak, regardless of their actual past behaviour.
  - People treat a logged streak as a goal in its own right.
  - The demotivating effect of a broken streak was stronger when people blamed themselves, and weaker when they could "repair" the streak.
  - Sources: [UDel repository](https://udspace.udel.edu/items/42ce576b-8e1f-429a-8541-e29e48dbcfbb); [CU Boulder news](https://www.colorado.edu/business/faculty-research/2023/04/19/or-track-how-broken-streaks-affect-consumer-decisions)
  - Barasch notes that nudges sent after a streak breaks typically fail, and people drop off — [CU Boulder](https://www.colorado.edu/business/faculty-research/2023/04/19/or-track-how-broken-streaks-affect-consumer-decisions)
- **Lally et al. (2010), *European Journal of Social Psychology*.** 96 participants performed a self-chosen daily behaviour for 84 days.
  - Time to reach about 95% of maximum automaticity averaged 66 days, among those whose data fitted the model, with a range of 18–254 days.
  - Missing one opportunity "did not materially affect the habit formation process". Repeated misses had a cumulative cost on the automaticity eventually reached.
  - Sources: [UCL news](https://www.ucl.ac.uk/news/2009/aug/how-long-does-it-take-form-habit); [BPS Research Digest](https://bps.org.uk/research-digest/how-form-habit); [paper DOI, prior knowledge](https://doi.org/10.1002/ejsp.674). The exact wording comes from secondary quotations.

### Inferences
- **Streaks raise engagement, which differs from learning.** Duolingo reports retention and active-user numbers, not learning outcomes.
  - For a fretboard app, a streak may help by getting the guitar out daily, which spacing research supports (section 5).
  - It may hurt if it rewards trivial 10-second sessions or causes anxiety.
- **If a streak is added, recommended design** (aligned with Lally and Silverman & Barasch):
  - a low bar, such as one short run per day;
  - **weekly targets** (for example "4 of 7 days") instead of strict consecutive days;
  - built-in tolerance, such as one free miss per week or a "repair";
  - neutral wording when a streak breaks ("Welcome back — your mastery map is still here"), not loss framing.
- **Prefer an opt-in practice plan to push reminders**, built as an implementation intention: "When I [pick up the guitar after dinner], I will do a 3-minute fretboard sprint."
  - The app is local with no accounts. A practice-plan prompt shown on screen at the start of a session may be enough.
  - Browser notifications, if any, should be opt-in and tied to the learner's chosen cue time.
- **Goals:** let the learner set specific, *learning-oriented*, proximal goals. Examples: "master string 4, frets 0–12, at ≥90% and <2 s", or "add 5 new positions to mastered this week". Locke & Latham suggest learning goals over raw performance goals for complex skills, and show that goals need feedback, which the app already provides.
- **Commitment ritual:** letting the learner pick a session goal before starting is cheap, and the (secondary) Duolingo evidence suggests it may help on its own.

### Gaps
- I found no peer-reviewed study of Duolingo's streak or its effect on *learning*.
- I found no evidence on reminders or notifications in music-practice apps, and no notification-fatigue data for small solo apps.
- I did not verify the Lally original for whether "missing one day" referred to one day only.

## 4. Progress visualisation and feedback presentation (KR/KP, frequency, self-referenced vs normative)

### Takeaway
The classic "guidance hypothesis" says that giving feedback after every trial creates dependence and that reduced frequency aids retention. It has replicated poorly, and a pre-registered meta-analysis found no significant change from immediate to delayed retention for reduced-frequency feedback. For the Fretboard Trainer, where feedback is binary (right or wrong note), immediate correctness feedback is not shown to be harmful. Self-referenced comparisons, like the existing "vs your usual", fit SDT's competence and informational principles.

### Cited Findings
- **Salmoni, Schmidt & Walter (1984), *Psychological Bulletin* 95(3).** Origin of the guidance hypothesis: frequent knowledge of results (KR) aids performance during practice but can impair retention — [prior knowledge, DOI](https://doi.org/10.1037/0033-2909.95.3.355)
- **Pre-registered multivariate meta-analysis** comparing 100% feedback with reduced-frequency feedback (*Journal of Exercise, Movement, and Sport*, SCAPPS abstract): it "fails to detect significant change from immediate to delayed retention" — [SCAPPS](https://www.scapps.org/jems/index.php/1/article/view/2529). I could not obtain the full effect sizes.
- **Mixed replication record.**
  - Several studies showed advantages for reduced frequency, but "a number of other studies failed to replicate these findings".
  - Wulf & Shea (2004) concluded there was little evidence that feedback after every trial creates dependence.
  - A 2024 postural-control study (0/33/67/100% groups) found only the 67% group improved at retention, but saw no transfer differences.
  - Source: [Sensors/PMC 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10933749/)
- **Self-controlled feedback scheduling** (learner requests feedback) is part of the self-controlled literature. Its benefits have shrunk to near zero after bias correction (see section 7) — [McKay et al. 2022](https://conferences.lnu.se/index.php/metapsychology/article/view/2803)
- **Wulf & Lewthwaite (2016), OPTIMAL theory, *Psychonomic Bulletin & Review* 23(5):1382–1414.**
  - Claims that "enhanced expectancies" help learning, for example positive normative feedback or feedback after good trials.
  - The bias-corrected reanalysis (McKay et al. 2023) suggests these benefits were substantially exaggerated by reporting bias (section 7).
  - Sources: [Wulf & Lewthwaite 2021 Current Directions PDF](https://gwulf.faculty.unlv.edu/wp-content/uploads/2021/11/Wulf_Lewthwaite_OPTIMAL_Current_Directions_2021.pdf); [McKay et al. 2023 PDF](https://raw.github.com/cartermaclab/carterlab-papers/main/2023_mckay-etal_the-combination-of-reporting-bias-and-underpowered-study-designs-has-substantially-exaggerated-the-motor-learning-benefits-of.pdf)

### Inferences
- **Fretboard naming is largely a memory and retrieval task.** It is mapping note names to positions, closer to verbal or associative learning than to fine motor control. So the motor-learning KR-frequency literature transfers only partially.
  - In retrieval-practice research, immediate correct-answer feedback after errors is generally beneficial. This is from general knowledge; it is not cited here and other researchers' notes may cover it.
  - Recommendation: **keep immediate right/wrong feedback.** On an error, show the correct position, or the note that was actually played, briefly.
- **Optional "exam mode" or "no-feedback sprint":** feedback withheld until the end of the run. It gives the learner an honest retention check and reduces reliance on the app's cues. Do not claim it improves learning by itself; the guidance-hypothesis evidence is mixed.
- **Knowledge of results vs knowledge of performance.**
  - *KR* is correct/incorrect plus response time.
  - *KP-like* information covers *how* it went wrong: wrong octave, a semitone off (sharp/flat confusion), a neighbouring string, or the right note in a different position.
  - The pitch detector can report the error pattern. Error-type summaries ("you often play one fret too high on string 2") are actionable, diagnostic feedback rather than a bare score.
- **Self-referenced over normative.** The app's "faster than your usual" fits informational competence support without social-comparison risks (Hanus & Fox). Avoid invented "average user" norms. The OPTIMAL-style "you're better than most" manipulations have weak evidence once bias is corrected, and the norm would be fabricated in a solo app.
- **Mastery heatmap:** a strong competence signal. Suggestions:
  - show *change* over time (a "then vs now" toggle, or a weekly delta);
  - distinguish "not yet practised" from "weak" so beginners do not see a sea of red;
  - visually mark items whose strength is probably decaying (section 8).

### Gaps
- I did not obtain the effect sizes or moderators of the reduced-frequency meta-analysis.
- I found no study of mastery-heatmap or dashboard visualisations specifically on learning outcomes.
- I found no direct evidence on "personal best" displays in skill apps.

## 5. Flow, optimal challenge, the "85% rule" and dynamic difficulty adjustment

### Takeaway
Wilson et al. (2019) derive an optimal training accuracy of about 85% (error ≈ 15.87%), *for gradient-descent learners on binary classification with Gaussian noise*. The optimum shifts to about 82% for Laplacian noise and 75% for Cauchy noise. No human experiments were run, and the link to flow is presented as an untested prediction. The app's ~80% target falls within this plausible range. The "rule" should be treated as a principle (a sweet spot of difficulty exists), not a precise constant for human fretboard learning.

### Cited Findings
- **Wilson, Shenhav, Straccia & Cohen (2019), *Nature Communications* 10:4646.**
  - Optimal training error ≈ 15.87% for SGD-trained binary classifiers. Training at this error rate yields exponentially faster learning than fixed difficulty.
  - The result was tested in Perceptrons, a two-layer MNIST network and a model of monkey perceptual learning.
  - The optimum depends on the noise distribution: about 18.4% error under Laplacian noise and 25% under Cauchy noise.
  - The authors list limitations: binary tasks only, batch training not analysed, an assumption that learning changes only noise precision, and no applicability to Bayesian learners with perfect memory.
  - They note that staircases are often set to 80–85% accuracy.
  - On flow, they propose it would be "interesting to test whether these subjective measures of engagement peak" at maximal learning. This is untested.
  - Sources: [PMC full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579); [Arizona record](https://experts.arizona.edu/en/publications/the-eighty-five-percent-rule-for-optimal-learning/)
  - In press coverage, the lead author said the specific percentages matter less than the principle that a sweet spot exists — [Neuroscience News](https://neurosciencenews.com/learning-optimized-15171/)

### Inferences
- **Keep the ~80% target** but treat it as a band, for example 75–85%, not an exact setpoint. Fretboard recall is not binary classification with Gaussian noise. Pitch-detector misreads and motor slips add heavier-tailed "noise", which per Wilson's own analysis shifts the optimum toward *lower* accuracy.
- **Separate difficulty dimensions.** Accuracy is one target; speed (the time limit) is another. A sensible policy:
  - adapt *item selection*, introducing new or weak positions, to hold accuracy near 80%;
  - adapt *time pressure* separately once accuracy on an item is high.
- **Engagement vs learning trade-off.** Some learners find 80% frustrating and quit. An optional "confidence warm-up" — a short block of mastered items at the start, or a closing run of strong items — may help session satisfaction. It costs little learning time.
  - This is an inference. I found no source testing warm-ups specifically.
- Showing the learner *why* difficulty is set this way may reduce frustration and supports autonomy: "the app aims for about 4 out of 5 right — that's where you learn fastest".

### Gaps
- I found no human experiments directly validating 85% as optimal for skill or associative learning.
- I did not retrieve dynamic difficulty adjustment (DDA) studies in games or education (for example Elo/IRT-based adaptivity versus fixed curricula), nor Csikszentmihalyi's primary flow work. Both remain gaps in these notes.

## 6. Deliberate practice in music, practice diaries, session length and frequency

### Takeaway
Deliberate practice matters, but much less than Ericsson's account implied. It explains about 21% of the variance in musical performance in Macnamara et al. (2014), and about 18% in sports, dropping to about 1% among elite athletes in the 2016 follow-up. The estimate is contested: Platz et al. (2014) reported r ≈ .61 after correcting for unreliability. Spacing practice across days beats massing it, including for song memory. Most of what deliberate-practice theory recommends — specific goals, immediate feedback, work on weaknesses, repetition with refinement — is already built into this app.

### Cited Findings
- **Macnamara, Hambrick & Oswald (2014), *Psychological Science*.**
  - 88 studies, N = 11,135.
  - Variance in performance explained by deliberate practice: 26% games, **21% music**, 18% sports, 4% education, <1% professions.
  - Sources: [Princeton news](https://www.princeton.edu/news/2014/07/03/becoming-expert-takes-more-practice); [ScienceDaily](https://www.sciencedaily.com/releases/2014/07/140716123835.htm)
- **Follow-up commentary** (Hambrick et al., "Facing facts about deliberate practice"): about one-third of *reliable* variance, around 30% for music — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4101876/)
- **Platz et al. (2014), music-specific meta-analysis:** corrected r ≈ .61. They dispute the linear-model reliance — [Frontiers commentary](https://www.frontiersin.org/articles/10.3389/fpsyg.2014.00751/full)
- **Macnamara, Moreau & Hambrick (2016), *Perspectives on Psychological Science*.** Sports meta-analysis: about 18% of variance overall, about 1% among elite performers — [prior knowledge, DOI](https://doi.org/10.1177/1745691616635591)
- **Katz et al. (2021), *Cognitive Research: Principles & Implications*.**
  - Re-study of a song after 2 days or 1 week beat re-study after 10 minutes on a 3-week test.
  - 2 days and 1 week were similar.
  - The benefit was clearer for lyrics than for melody.
  - Sources: [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8665960/); [Springer](https://link.springer.com/article/10.1186/s41235-021-00345-7)
  - A 2025 *Psychology of Music* melodic-recall spacing result (Katz & Wiseheart) is reported only by a blog and is unverified — [blog](https://djwillgill.com/how-to-memorize-band-music-quickly-research-backed-methods/)
- **Duolingo (company data):** "binge" learners quit more than paced learners — [Making Duolingo](https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals)

### Inferences
- **Practice is a large but not dominant factor, so avoid hype.** The app should not promise "10,000 hours" style outcomes. It *can* honestly claim that it uses the features deliberate-practice theory values most: targeted weaknesses, immediate feedback and adaptive challenge.
- **Short, frequent, spaced sessions fit both the spacing evidence and habit formation.** For example:
  - default session presets of about 3–10 minutes (a few runs);
  - a soft "good stopping point" message after about 10–15 minutes;
  - instead of an endless "one more run" loop, the end-of-run screen can say "Nice — come back tomorrow; X positions are due for review".
  - This is an inference. I found no fretboard-specific study of optimal session length.
- **Practice diary / reflection:** an optional one-line note per session ("what felt hard?") plus automatic logging. This mirrors practice-diary methods and supports metacognition. The automatic log already exists as "recent runs".
- **Interleave, don't block:** mix strings and regions within a run once the basics are known. This is from the general interleaving literature, not verified here. It feels harder, and accuracy during practice may drop, while retention improves. That is another case where in-session metrics mislead (section 8).

### Gaps
- I found no rigorous study on optimal session length or frequency for instrumental skill practice, and none on fretboard learning specifically.
- I did not retrieve primary studies of practice diaries.
- I did not retrieve microlearning meta-analyses.
- Ericsson's original 1993 paper and his rebuttals were not fetched.

## 7. Self-controlled practice: original claims and replication problems

### Takeaway
Earlier literature (Wulf, Lewthwaite; OPTIMAL theory) reported robust motor-learning benefits from letting learners choose practice parameters. Bias-corrected meta-analyses now suggest the effect is small, uncertain and possibly null. Letting learners choose is still reasonable for *motivation, enjoyment and autonomy*, but should not be marketed as a learning booster.

### Cited Findings
- **McKay, Yantha, Hussien, Carter & Ste-Marie (2022), *Meta-Psychology*.**
  - Naive random-effects estimate: g = .44 (k = 52, N = 2,061, 95% CI [.31, .56]).
  - Publication status was a significant moderator: only published studies showed a benefit.
  - After bias correction, the benefit is "small and not currently distinguishable from zero".
  - Title: "underpowered, biased, and lacking evidential value".
  - Sources: [Meta-Psychology](https://conferences.lnu.se/index.php/metapsychology/article/view/2803); [PDF](https://raw.github.com/cartermaclab/carterlab-papers/main/2022_mckay-etal_meta-analytic-findings-of-the-self-controlled-motor-learning-literature-underpowered-biased-and-lacking-evidential-value.pdf)
- **McKay et al. (2023), *International Review of Sport and Exercise Psychology*.**
  - Robust Bayesian reanalysis of the self-controlled and enhanced-expectancies literatures.
  - Reporting bias substantially exaggerated the benefits; the true effects are small, uncertain and potentially null.
  - Average statistical power across studies was estimated at **6%**.
  - Source: [PDF](https://raw.github.com/cartermaclab/carterlab-papers/main/2023_mckay-etal_the-combination-of-reporting-bias-and-underpowered-study-designs-has-substantially-exaggerated-the-motor-learning-benefits-of.pdf)
- **"Inconvenient findings for the 'optimal' theory of motor learning":** a critical paper on OPTIMAL theory — [SCAPPS](https://www.scapps.org/jems/index.php/1/article/view/1796)
- **OPTIMAL theory (Wulf & Lewthwaite 2016):** posits enhanced expectancies, autonomy support and external focus of attention as learning enhancers — [Wulf & Lewthwaite 2021 PDF](https://gwulf.faculty.unlv.edu/wp-content/uploads/2021/11/Wulf_Lewthwaite_OPTIMAL_Current_Directions_2021.pdf); [Sanli et al. 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3576889)

### Inferences
- **Offer choice for the right reasons:** run length, which strings, sprint vs fixed N, "app picks" vs "I pick". The justification is enjoyment, autonomy and fit to the learner's goals, not expected learning gains.
- **Default to the adaptive scheduler,** with learner choice layered on top, for example "focus on strings 5–6 today" within adaptive item selection.
  - Unconstrained self-choice can drift toward comfortable, already-known items, an inference from the stability bias in section 8.
  - Gentle nudges like "you haven't visited frets 9–12 in 2 weeks" help.

### Gaps
- I found no studies of self-controlled practice in associative or memory tasks resembling fretboard note-finding.
- External focus of attention was not examined for replication status in this session. McKay et al. 2023 covered enhanced expectancies, not external focus.

## 8. Calibration, metacognition and showing forecasts of forgetting

### Takeaway
Learners show a "stability bias": they expect their memory to stay as it is now, neglecting both future learning and future forgetting. Their judgments of learning rely on how easy processing feels right now. They are insensitive to forgetting unless retention intervals are made salient. This supports explicitly showing decay forecasts and due-for-review items. Fluency during massed or blocked practice inflates confidence, so in-session accuracy should not be presented as mastery.

### Cited Findings
- **Kornell & Bjork (2009), *Journal of Experimental Psychology: General*.** Learners predicted little or no gain from extra study trials, despite large actual gains — the "stability bias" — [PDF](https://web.williams.edu/Psychology/Faculty/Kornell/Publications/Kornell.Bjork.2009.pdf)
- **Koriat, Bjork, Sheffer & Bar (2004), *Journal of Experimental Psychology: General*.**
  - Predictions did not reflect forgetting across retention intervals unless participants estimated recall for *several* intervals.
  - Judgments rely on processing ease during encoding.
  - Sources: [PDF](https://newiipdm.haifa.ac.il/wp-content/uploads/2015/05/2004-KoriatBjork-ShefferBar-JEPG.pdf); [Nussinson review](https://www.openu.ac.il/Lists/MediaServer_Documents/PersonalSites/DrRavitNussinson/Nussinson_Learning_Memory2013.pdf)
- **Bjork, Dunlosky & Kornell (2013):** when forgetting was made salient, participants became sensitive to retention interval; without prompting they were insensitive. As summarised in [Nussinson 2013](https://www.openu.ac.il/Lists/MediaServer_Documents/PersonalSites/DrRavitNussinson/Nussinson_Learning_Memory2013.pdf)
- **Kornell, Rhodes, Castel & Tauber (2011), *Psychological Science*.** Linked the stability bias to an ease-of-processing heuristic — [PDF](https://castel.psych.ucla.edu/wp-content/uploads/sites/111/2016/11/The-Ease-of-Processing-Heuristic-and-the-Stability-Bias-Psych-Science-Kornell-Rhodes-Castel-Tauber-2011.pdf)
- **Kornell & Bjork (2008), *Psychological Science*.** Spaced (interleaved) study of painters' styles improved category learning, yet most participants *believed* massed study had worked better — [prior knowledge, DOI](https://doi.org/10.1111/j.1467-9280.2008.02127.x)

### Inferences
- **Show forecasts, not just snapshots.** Based on time since last correct and the item's history, show a "likely fading" layer on the heatmap, or a count like "12 positions due for review". This makes forgetting salient, which counters the stability bias per Koriat et al.
  - Keep forecasts honest and probabilistic ("may be fading"), not falsely precise ("you'll forget X tomorrow").
  - The underlying memory model, such as spaced-repetition half-lives, is likely covered by other researchers.
- **Calibration exercise (optional):** before a run, ask "How many of 20 do you expect to get right?" and compare with the actual score afterwards.
  - Over time, show a calibration trend ("your predictions are getting more accurate").
  - This builds metacognition at little cost.
  - Inference: I found no study testing this in a music app.
- **Separate "in-session performance" from "retained mastery" in the UI.** Mastery could require success across ≥2 separate days. This prevents the heatmap from turning green after one massed session, which is a fluency illusion.
- **Explain desirable difficulties.** When interleaving or spacing makes runs feel harder, a one-line note ("mixed practice feels harder but sticks better") can pre-empt the learner's belief that massed practice works better (Kornell & Bjork 2008).

### Gaps
- I found no studies on showing learners explicit forgetting forecasts in apps, or on whether such forecasts change study behaviour or outcomes.
- I found no calibration-training studies in music practice.

## Cross-cutting summary: engagement-boosting features that may hurt learning (warnings)

These are inferences from the findings above.

- **Volume-based points, XP, badges or levels:** these are engagement- or completion-contingent rewards, which undermine intrinsic motivation (Deci et al. 1999, d ≈ −.36 to −.40). They also reward binge play over spaced practice (Duolingo binge finding; spacing evidence).
- **Strict consecutive-day streaks with loss framing:** these boost short-term engagement (Duolingo, Silverman & Barasch), but a broken streak triggers drop-off. They may encourage trivial sessions that just "keep the streak". Lally shows single misses do not matter for habits.
  - Mitigations: weekly targets, freezes or repair, a minimum meaningful session.
- **Leaderboards or normative comparisons:** these are not applicable in a solo app. The evidence from Hanus & Fox 2015 is negative, and fake norms would be dishonest.
- **Showing in-session accuracy as "mastery":** fluency illusions and stability bias inflate confidence. Require evidence across days.
- **Making sessions too easy to keep users happy:** this drifts away from the challenge sweet spot (Wilson 2019) and from targeted deliberate practice.
- **Over-claiming learning benefits of choice or "positive expectancy" feedback:** the bias-corrected evidence is near null (McKay 2022/2023). Offer choice for autonomy and enjoyment only.

Recommended additions, ranked by evidence-to-cost ratio (inferences):
1. Due-for-review and decay layer on the heatmap, plus a "mastered = correct on ≥2 separate days" rule.
2. Optional learning-oriented session and weekly goals, plus an implementation-intention practice-plan prompt.
3. Error-type diagnostic feedback (semitone, octave, adjacent string).
4. A forgiving weekly-consistency tracker, not a strict streak.
5. Gentle session-length guidance and a "come back tomorrow" end screen.
6. Optional calibration prompt and a no-feedback exam mode.
7. Competence-based, optional milestones ("first full-neck sweep ≥90%") instead of volume badges.
