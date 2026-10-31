# Learning science for memorising a fixed mapping (fretboard position <-> note name) quickly and durably

Scope note: Almost all of the evidence below comes from verbal learning (word pairs, vocabulary, facts, trivia), category induction (paintings, birds), maths problems, or simple motor-sequence tasks. A guitar note-finding task is a hybrid: a *paired-associate retrieval* (note name -> fret location) followed by a *perceptual-motor response* (fretting and plucking), graded by pitch detection. Where a finding transfers only by analogy, this is flagged. App design being evaluated: runs of N prompts or timed sprints; FSRS-style per-item spaced repetition on right/wrong; separate speed model; target success ~80% (adapting 65–92%); visible queue of the next 4 notes; answer revealed after 10 s; retry until correct; every 5th run is a review run; curriculum expands from low E string, low frets.

## 1. Spacing effect: optimal lags, expanding vs uniform spacing, within-session vs across days

### Takeaway
Spacing is one of the two most robust techniques in the literature; the optimal gap grows with how long you want to remember (about 20–40% of the retention interval for a 1-week target, 5–10% for a 1-year target), and too-short gaps hurt more than too-long ones. Expanding vs uniform schedules matters much less than *how difficult the first delayed retrieval is*; across-day relearning beats piling correct retrievals into one session by a large margin.

### Cited Findings
- Cepeda, Vul, Rohrer, Wixted & Pashler (2008), >1,350 participants, gaps up to 3.5 months, final tests up to 1 year later: final performance first rose then slowly fell as the inter-study gap grew; the optimal gap was ~20–40% of a 1-week test delay but only ~5–10% of a 1-year delay. The authors concluded that many educational practices are "highly inefficient" given this gap x delay interaction — [Cepeda et al. 2008, Psych Science (PDF)](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf); [PubMed 19076480](https://pubmed.ncbi.nlm.nih.gov/19076480/)
- Coverage of the same study notes that gaps that are too short hurt retention more than gaps that are too long (the ridgeline is asymmetric) — [York University YFile](https://www.yorku.ca/yfile/?p=9454)
- Cepeda et al. (2006) "Distributed practice in verbal recall tasks" is the companion quantitative review/meta-analysis of the spacing literature (verbal recall only) — [Cepeda et al. 2006, Psych Bulletin (PDF)](https://www.yorku.ca/ncepeda/publications/PRC2006.pdf)
- Dunlosky et al. (2013, PSPI) reviewed 10 techniques and rated only two as "high utility": practice testing and distributed practice; interleaved practice, elaborative interrogation and self-explanation were rated "moderate"; rereading, highlighting, summarisation "low" — [APS press release](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)
- Karpicke & Roediger (2007): with vocabulary word pairs, expanding retrieval (short first lag, growing lags) gave better retention at 10 minutes, but equally spaced retrieval gave better retention 2 days later; the critical factor was delaying the *first* retrieval (making it harder), while expanding the later intervals had little effect on long-term retention — [WUSTL profile](https://profiles.wustl.edu/en/publications/expanding-retrieval-practice-promotes-short-term-retention-but-eq/); [PDF](https://Www.Gwern.net/doc/psychology/spaced-repetition/2007-karpicke.pdf)
- The expanding-vs-uniform literature is mixed: Storm, Bjork & Storm (2010) found an expanding advantage when there was substantial forgetting/interference between trials, arguing the 2007 conclusion was too general — [Storm, Bjork & Storm 2010 (PDF)](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/Storm_Bjork_Storm_2010.pdf); [SuperMemo wiki summary](https://supermemo.guru/wiki/Karpicke:_Expanding_retrieval_schedules_produced_mixed_results)
- Pyc & Rawson (2009, "Testing the retrieval effort hypothesis"): longer within-session lags between practice trials made retrieval harder but produced higher final-test performance; raising the number of correct recalls required before dropping an item showed diminishing returns — [summary of Pyc & Rawson 2009](https://blogs.oregonstate.edu/osuteaching/?p=2124); [Matuschak notes](https://notes.andymatuschak.org/z5zckzyAM1DwEQqt94qMpsd)
- Successive relearning (Rawson & Dunlosky): items are practised until correct within a session (wrong items are restudied and *re-tested later in the same session*), then relearned in later sessions. Recalling each item correctly once in each of three spaced sessions produced more than twice the recall of three correct recalls in a single session (reported as ~68% vs ~26% at one week; secondary source) — [Dunlosky et al. successive relearning guide (PDF)](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf); [Rawson & Dunlosky 2022, Current Directions](https://journals.sagepub.com/doi/full/10.1177/09637214221100484); [retrievalpractice.org](https://www.retrievalpractice.org/archive/2018/successive-relearning)
- Rohrer & Taylor (2006), maths: spacing the same practice problems across sessions had no benefit at a 1-week test but an "extremely large" benefit at a 4-week test — [USF Scholar Commons](https://digitalcommons.usf.edu/psy_facpub/1768); [APS Observer, Temporal spacing and learning](https://www.psychologicalscience.org/observer/temporal-spacing-and-learning)
- Kang (2016) policy review: spaced practice is a low-cost route to learning efficiency, and adding tests to spaced practice increases the benefit — [Kang 2016, Policy Insights BBS](https://journals.sagepub.com/doi/10.1177/2372732215624708)

### Inferences
- The FSRS-style per-item scheduler is well aligned with the evidence; its main job is to make sure items reappear *across days*, not only within a session. Successive relearning suggests a simple session rule: each due item needs ~1 correct retrieval per session (not several), with misses re-tested later in the same session.
- For a fretboard learner who wants to remember for months/years, across-day gaps of days to weeks are optimal by Cepeda's ridgeline; within-session "relearning" lags should be long enough that the item is not still in working memory (several intervening prompts rather than immediately).
- Within a session, prefer that a newly introduced or missed item is re-asked after a *moderate* lag (e.g. 3–8 intervening prompts), not immediately and not with a tiny fixed lag. Don't obsess over exact expanding vs uniform intra-session schedules; the evidence is mixed and the effect small compared to having *some* delay.
- "Every 5th run is a review run" is consistent with spacing, but the scheduler's due dates should decide what gets reviewed; a fixed cadence is a reasonable heuristic, not an evidence-based constant.
- Speed-training reps that are massed in one session (sprints) will look good immediately but, per Rohrer & Taylor, may not show durable benefit; durable speed comes from spreading sprints across days.

### Gaps
- No spacing study found on fretboard/instrument note-location learning specifically; the ridgeline numbers come from verbal facts and may not transfer exactly to perceptual-motor recall.
- Exact optimal within-session lag for a 12-item zone was not found; Pyc & Rawson used verbal pairs.
- I did not retrieve Cepeda 2006's pooled effect sizes in this session (the PDF link is provided for the writer).

## 2. Retrieval practice / testing effect; do preview queues, hints or cues reduce retrieval effort?

### Takeaway
Testing beats restudy by roughly half a standard deviation (g ~ 0.50), more with feedback, more for recall than recognition, and more at delays of >= 1 day. Benefits scale with retrieval *effort* (difficult-but-successful retrievals help most); strong cues and premature hints reduce that benefit, while gradually fading cues can help when items are very hard. The visible 4-note queue most likely lets learners pre-retrieve covertly, which (a) shortens effective lag and (b) contaminates answer-time measurement.

### Cited Findings
- Rowland (2014) meta-analysis, 159 effect sizes from 61 studies: mean testing effect g = 0.50 vs restudy; larger with recall than recognition initial tests and for retention intervals >= 1 day. A secondary source reports g ~0.73 with feedback vs ~0.39 without (not verified against the paper) — [Rowland 2014 (PDF)](https://courseware.epfl.ch/assets/courseware/v1/fdde2f0aa590bf3b1324077a6bf1540c/asset-v1%3AEPFL%2BDEMO%2B2020%2Btype%40asset%2Bblock/Rowland2014-meta-analysis.pdf); [studycardsai summary (secondary)](https://studycardsai.com/blog/active-recall-statistics)
- Reviews put testing effects at g ~0.50–0.61 across Rowland (2014) and Adesope et al. (2017) — [Frontiers in Psychology 2018](https://frontiersin.org/articles/10.3389/fpsyg.2018.02412/full)
- Retrieval effort hypothesis (Pyc & Rawson 2009): difficult but successful retrievals benefit memory more than easy successful ones; harder retrievals took longer and predicted better later recall — [Oregon State summary](https://blogs.oregonstate.edu/osuteaching/?p=2124)
- Cue strength: with weak cues, retrieved items outperformed elaboratively studied items on the final test; with strong cues there was no significant difference (2022 ERP study). A 2014 study found weak-cue testing did not differ from restudy immediately but was significantly better two days later — [J. Psychological Science (ECNU) 2022](https://jps.ecnu.edu.cn/EN/Y2022/V45/I5/1106); [Psych Dev & Ed 2014](https://devpsy.bnu.edu.cn/CN/Y2014/V30/I6/609)
- Diminishing-cues retrieval practice (progressively fewer letters/cues) helps under very difficult learning conditions and is as effective as standard retrieval practice when strong testing effects are already present; adaptive-cue versions raise retrieval demands as items become better learned — [Psychonomic Society featured content](https://featuredcontent.psychonomic.org/sherlock-holmes-and-mrs-h____n-the-mystery-of-diminishing-cues-retrieval-practice/); [Illinois Experts: diminishing cues](https://experts.illinois.edu/en/publications/diminishing-cues-retrieval-practice-a-memory-enhancing-technique-/); [Illinois Experts: scaffolding retrieval practice](https://experts.illinois.edu/en/publications/techniques-for-scaffolding-retrieval-practice-the-costs-and-benef/)
- Covert (silent, unarticulated) retrieval benefits retention as much as overt retrieval for simple materials such as word pairs and categorised lists (Smith, Roediger & Karpicke 2013); a meta-analysis (Sundqvist et al. 2017) found only a tiny overt advantage (d = 0.07); complex material may favour overt — [Educational Psychology Review 2025](https://link.springer.com/article/10.1007/s10648-025-10040-4); [Tauber et al., WUSTL](https://profiles.wustl.edu/en/publications/does-covert-retrieval-benefit-learning-of-key-term-definitions/)

### Inferences
- **Visible 4-note queue (conflict, moderate):** Because covert retrieval is roughly as effective as overt retrieval for simple pairs, seeing "Bb, F#, D, A" coming up likely triggers silent retrieval of their positions *before* each trial. This (1) shortens the effective retrieval lag to near zero when the trial arrives, turning the graded trial into an easy, already-retrieved response (lower retrieval effort -> less learning per trial, per Pyc & Rawson), and (2) makes measured answer time understate true retrieval latency, biasing the speed model and the FSRS difficulty signal. Recommendation: hide the queue by default, or show only the *current* prompt; optionally offer the queue as a "warm-up/scaffold" mode for brand-new items only, and exclude queued-preview trials from speed statistics.
- A queue of 1 (next item only) is a possible compromise if the queue exists for motor-planning reasons (hand repositioning), but the item should be judged as cued.
- Graded hints are evidence-compatible if they are *faded*: e.g. for a new item, first show string, then nothing; or reveal string after a few seconds and full position after longer. Strong hints from the start should be avoided for items the learner can already partly retrieve.
- Recall (play it on the guitar) is the right test format; it is a production/recall test, which Rowland found beats recognition.

### Gaps
- No study found that directly tests a *visible upcoming-items queue* in drill software; the inference rests on covert-retrieval and retrieval-effort findings from verbal materials.
- Unknown whether motor pre-planning (moving the hand toward the next note) has its own benefit that would justify the queue; no source found.

## 3. Interleaving vs blocking — when it helps and when not

### Takeaway
Interleaving has a moderate average benefit (g = 0.42) but it is driven by *discrimination* between confusable categories; it helps most when items are similar between categories and less similar within, and can hurt or vanish for dissimilar or simple materials. Learners consistently (and wrongly) believe blocking works better.

### Cited Findings
- Brunmair & Richter (2019) multilevel meta-analysis, 59 studies, 238 effect sizes, 158 samples: overall interleaving effect Hedges' g = 0.42; stronger when material is more similar between categories, less similar within categories, and more complex; maths tasks g = 0.34. Interleaving "can effectively foster inductive learning but the setting and the type of learning material must be considered" — [Brunmair & Richter 2019 manuscript (PDF)](https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf)
- Kornell & Bjork (2008): interleaved study of painters' styles produced better identification of new paintings than blocked study, yet most participants believed blocking helped more. Kang & Pashler (2012) found interleaving helped induction while temporal spacing alone did not, supporting a discriminative-contrast account — [Kang & Pashler / Kornell & Bjork summary, Memory & Cognition](https://www.springermedizin.de/article/10.3758/s13421-012-0272-7); [Richter et al. 2022 preprint](https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2022/Richter_et_al__2022__ZEPP_Interleaved_Learning_preprint.pdf)
- A systematic review of interleaving in education (Firth et al. 2021) is available for further detail — [Firth et al. 2021 (PDF)](https://strathprints.strath.ac.uk/75711/7/Firth_etal_RE_2021_A_systematic_review_of_interleaving.pdf)
- Motor-learning analogue (contextual interference): random/interleaved practice of motor variants yields better retention/transfer than blocked practice. Brady (2004) meta-analysis (61 studies, 139 effect sizes): effect ~0.57 in basic lab research but only ~0.19 in applied settings; larger in adults than children. Czyż et al. (2024) meta-analysis on transfer: adults SMD = 0.54, older adults 1.28, young participants 0.12 — [Brady 2004 (PDF)](https://www.gwern.net/docs/spaced-repetition/2004-brady.pdf); [Czyż et al. 2024, Frontiers](https://frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1377122/full)

### Inferences
- The fretboard has genuinely confusable pairs: enharmonics (A#/Bb), adjacent semitones (F vs F#), notes one fret apart on the same string, and same-note positions on different strings. Interleaving is most valuable exactly for these discriminations; the app's zone design (all 12 pitch classes, shuffled) already interleaves within a zone — consistent with the evidence.
- Consider deliberately *pairing confusables* (e.g. F then F#; notes the learner has confused before, from error logs) in the order, which mirrors the "similar between categories" moderator.
- Blocking may still be useful for the very first exposure to a new string region (a short blocked introduction, then rapid interleaving), since the interleaving advantage is weaker for simple materials and novices; evidence here is mixed rather than strong.
- Expect learners to rate interleaved runs as harder and less effective; the UI should show long-term progress (retention at the next session) rather than in-session accuracy, to counter the metacognitive illusion.

### Gaps
- Note-name mapping is not classic category induction (each note is a single fixed response), so the g = 0.42 is an imperfect analogue; I found no interleaving study on instrument note mapping.

## 4. Desirable difficulties, errorful learning, feedback timing, hypercorrection, and when to reveal the answer

### Takeaway
Attempting retrieval and failing *still* improves learning, provided the correct answer follows promptly. Immediate corrective feedback is the safe default for failed retrievals; delayed feedback can help in some lab settings but is fragile. Confident errors are especially well corrected after feedback, so flag and revisit them.

### Cited Findings
- Kornell, Hays & Bjork (2009): when participants were nearly certain to fail (fictional trivia, weak associates), attempting an answer before seeing it produced better later recall than simply reading question+answer; "taking challenging tests—instead of avoiding errors—may be one key to effective learning" — [PubMed 19586265](https://pubmed.ncbi.nlm.nih.gov/19586265/)
- The failed-retrieval benefit depends on feedback being given — [Glessmer 2014 commentary](https://mirjamglessmer.com/2014/09/03/does-getting-it-wrong-help-or-hinder-future-learning/)
- Hays, Kornell & Bjork (2012): failed tests followed by *immediate* feedback beat presentation-only; failed tests with *delayed* feedback mostly did not — [Hays, Kornell & Bjork manuscript (PDF)](https://sites.lifesci.ucla.edu/psych-bjorklab/wp-content/uploads/sites/13/2016/07/Hays_Kornell_RBjork_inpress.pdf)
- Errorful translation practice in foreign-language learning did not lower accuracy relative to errorless practice — [RUG, Effects of making errors in learning a foreign language](https://research.rug.nl/en/publications/effects-of-making-errors-in-learning-a-foreign-language/)
- Feedback timing is mixed: Kulik & Kulik (1988; 53 studies) found the delay-retention advantage mainly in lab test conditions and generally absent in classroom conditions (secondary report); a classroom longitudinal study found robust benefits at all intervals only with immediate feedback; Smith & Kimball found delayed feedback increased correct-response perseveration, linking it to spacing — [Smith & Kimball 2010 manuscript (PDF)](https://www.ou.edu/memorylab/pdfs/SmithKimball_2010_LearningFromFeedback_ms.pdf); [Butler, Karpicke & Roediger, type & timing of feedback](https://profiles.wustl.edu/en/publications/the-effect-of-type-and-timing-of-feedback-on-learning-from-multip/)
- Hypercorrection: errors made with high confidence are more likely to be corrected after feedback than low-confidence errors (Butterfield & Metcalfe 2001; replicated many times); attributed to surprise driving attention to feedback; delaying feedback does not eliminate it (Fazio & Marsh 2010) — [PMC3079415](https://pmc.ncbi.nlm.nih.gov/articles/PMC3079415); [Duke: Understanding the hypercorrection effect](https://dukespace.lib.duke.edu/items/d6ab09ca-f55c-4efb-9d32-2788bc5838b2)
- Successive relearning protocol: an incorrect item's answer is studied and the item is re-tested *later* in the session, not immediately — [Dunlosky et al. guide (PDF)](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf)

### Inferences
- **Wrong answers (pitch detection says wrong note):** give immediate feedback showing the correct position (and ideally what was played), since failed retrieval + immediate feedback is the evidence-supported combo. The app's immediate right/wrong grading fits.
- **Retry-until-correct (conflict, mild):** retrying *immediately* after the correct position has been shown is essentially copying from short-term memory — little retrieval effort, inflates "correct" counts, and gives the scheduler a misleading success signal. Better: after a miss + reveal, require one immediate play-along (motor encoding, ungraded), then re-insert the item 3–8 prompts later for a genuine graded retrieval (successive-relearning style). Grade the item on its *first* attempt only.
- **10 s reveal (conflict, mild-to-moderate):** For most well-practised items, retrieval succeeds within 1–3 s; if nothing comes after ~4–6 s, further waiting mostly adds frustration and session time, and the error-benefit research shows the *attempt* (not a long one) plus prompt feedback is what matters. Consider an adaptive timeout (e.g. ~2–3x the learner's median RT for that item, clamped ~4–8 s), or a "give up/show me" control so learners can request the answer early (which counts as a miss). Keep the reveal immediate after a wrong note.
- **Hypercorrection:** a fast wrong answer (high implicit confidence) is a good proxy for a confident error; optionally ask for confidence or use RT. Such items deserve a prompt revisit and confusion-pair interleaving.
- Do not use delayed feedback (e.g. end-of-run summaries) as the *only* feedback for failed retrievals; end-of-run summaries are fine as a supplement.

### Gaps
- No source found giving an evidence-based optimal "retrieval attempt duration" before revealing an answer; the 10 s vs 5 s question is unresolved by direct evidence.
- Butler, Karpicke & Roediger (2007) specific results (delayed feedback advantage on multiple-choice) could not be verified in this session.

## 5. Overlearning, automaticity and fluency training (speed as a goal)

### Takeaway
Massed overlearning in a single session produces short-lived benefits; extra reps beyond first correct recall show diminishing returns. However, speed matters for automaticity: instance theory predicts RT (and its variability) falls as a power function with consistent practice, and precision teaching treats speed + accuracy (fluency) as the target — though its claims of superior retention are largely from applied, weakly controlled studies.

### Cited Findings
- Rohrer & Taylor (2006): 216 students, 3 vs 9 practice problems in one session; the 6 extra problems (overlearning) had no effect on test scores 1 or 4 weeks later; overlearning boosts short-term performance but the benefit diminishes sharply over time — [USF Scholar Commons](https://digitalcommons.usf.edu/psy_facpub/1768); [APS Observer](https://www.psychologicalscience.org/observer/temporal-spacing-and-learning)
- Pyc & Rawson (2009): raising the within-session criterion (more correct recalls before dropping an item) gives diminishing returns on the final test — [Oregon State summary](https://blogs.oregonstate.edu/osuteaching/?p=2124)
- Logan (1988) instance theory: automaticity = direct retrieval of stored episodes of past responses, which only develops with practice in a *consistent* stimulus-response environment; predicts power-law speed-up and a power-law drop in RT standard deviation with the same exponent — [Logan 1988 (PDF)](https://pcl.sitehost.iu.edu/rgoldsto/courses/cogscilearning/loganautomaticity.pdf); [Power law of practice (Wikipedia, overview)](https://en.wikipedia.org/wiki/Power_law_of_practice)
- Competing account: Rickard (1997) found results inconsistent with instance theory but consistent with component power laws (CMPL), where the shift from algorithmic (e.g. counting up frets from a reference) to direct retrieval drives the speed-up — [Rickard 1997 (PDF)](https://rickardlab.ucsd.edu/pdf/Rickard1997.pdf)
- Binder (1996): fluency = accuracy plus speed; precision-teaching literature links high response frequencies to retention, endurance, stability (resistance to distraction), and application (RESA); Binder himself "invites further controlled research" — [Binder 1996, PMC2733609](https://pmc.ncbi.nlm.nih.gov/articles/PMC2733609); [ASAT synopsis of precision teaching](https://asatonline.org/research-treatment/research-synopses/precision-teaching-and-fluency-building/)
- Terminology and outcome definitions vary across precision-teaching papers (REAPS, RESAA), making comparison hard — [Kubina 2005 (PDF)](https://centralreach.com/wp-content//uploads/2019/04/2005b-Kubina.pdf)

### Inferences
- A separate speed model is justified: for a mapping that must eventually be used in real time (reading music, improvising), the goal is the transition from *computing* a note (count frets from the open string / a landmark) to *direct retrieval*. In CMPL terms, a sudden drop in an item's RT marks the strategy shift; this could be detected and used as a "mastered" signal distinct from mere correctness.
- RT variability is a useful extra metric: instance theory predicts SD falls with mean RT; an item with low mean but high variance may still be computed sometimes.
- Do not make learners repeat already-correct items many times within a session (overlearning); instead, spread speed practice across days and use speed thresholds (e.g. median RT under a target) as part of the "graduation" criterion.
- Timed sprints are fluency-building in the precision-teaching sense. They are reasonable but the evidence for their *superiority* over equal amounts of accuracy-focused spaced practice is weak/practice-confounded; treat as engagement and automaticity tools, not a proven retention booster.
- Consistency matters for automatisation: the same note name -> same position mapping should be practised consistently; but note that the fretboard has multiple positions per note — automaticity should be built per zone (consistent within a zone), which the zone design supports.

### Gaps
- Could not retrieve controlled comparisons (e.g. Doughty, Chase & O'Shields 2004) of fluency vs accuracy-only training with practice time equated; flagged as weak/mixed evidence.
- No data on what RT constitutes "automatic" note retrieval on guitar.

## 6. Sleep, consolidation, session length, massed vs distributed sessions

### Takeaway
Short, daily sessions beat long, concentrated ones (classic typing study: 1 h/day most efficient, 2x2 h/day least). Sleep-dependent "offline gains" in motor sequences were widely reported but are now contested as partly artefactual; regardless of mechanism, spreading practice over days is supported.

### Cited Findings
- Baddeley & Longman (1978): postal workers learning to type with 1 or 2 h sessions, once or twice a day; one 1-h session per day was most efficient per hour of training; two 2-h sessions per day least efficient; speed loss ~30% at 1–9 month retention tests — [Baddeley & Longman 1978 (PDF)](https://Www.Gwern.net/doc/psychology/spaced-repetition/1978-baddeley.pdf); [Learning Scientists blog](https://www.learningscientists.org/blog/2018/11/15-1)
- Walker et al. (2002, Neuron): overnight improvement in a finger-tapping sequence occurred after sleep but not after an equivalent waking period; >50% of variance in overnight gain explained by stage 2 sleep late in the night — [Walker et al. 2002 (PDF)](https://walkerlab.berkeley.edu/reprints/Walker%20et%20al._Neuron_2002.pdf)
- Walker et al. (2003): doubling initial training did not change the amount of subsequent sleep-dependent gain; most gain appears after the first night — [Learning & Memory 2003](https://learnmem.cshlp.org/content/10/4/275.short)
- Counter-evidence: a probabilistic serial reaction-time study found no sleep enhancement (2007); Pan & Rickard (2015, Psychological Bulletin) meta-analysed finger-sequence studies and argued there is little room for sleep-specific consolidation once confounds are controlled; Rickard, Pan & Gupta (2022) argued severe publication bias contributes to "illusory" sleep consolidation; Adi-Japha & Karni (2016) disputed the meta-analysis — [SUNY: Sleep does not enhance motor sequence learning](https://researchconnect.suny.edu/en/publications/sleep-does-not-enhance-motor-sequence-learning/); [Haifa: Comment on Pan & Rickard](https://cris.haifa.ac.il/en/publications/comment-time-for-considering-constraints-on-procedural-memory-con/); [Frontiers in Neurology 2015](https://www.frontiersin.org/journals/neurology/articles/10.3389/fneur.2015.00241/pdf)
- Sleep-related improvements in sequential finger skills were replicated in an independent study but not for timing-pattern or force tasks — [J. Human Kinetics 2008](https://johk.pl/?p=1590)

### Inferences
- Design for frequent short sessions (e.g. 10–20 min daily) rather than long weekend sessions; nudge users with a daily cadence. The 1 h/day typing result is an upper bound for an intensive motor-cognitive skill; for a 12-item-per-zone mapping, shorter sessions are likely enough.
- Do not promise "sleep magic"; but do schedule the first review of new items for the next day (which also fits spacing evidence).
- If the app shows within-session speed curves, warn that next-day performance is the meaningful metric.

### Gaps
- No evidence found on optimal session length for note-name / fretboard drills specifically; Baddeley & Longman is the closest perceptual-motor analogue and is small and old.

## 7. Cognitive load, chunking, transfer-appropriate processing, encoding variability, elaborative encoding / mnemonics

### Takeaway
Evidence here is mostly indirect for this task. Variable/random practice (contextual interference) aids transfer in motor learning; elaboration and self-explanation are rated only "moderate" utility; structured relational knowledge of the fretboard (octave shapes, landmarks) is plausible but I found no direct experimental evidence on fretboard mnemonics in this session.

### Cited Findings
- Contextual interference (random vs blocked motor practice) improves retention/transfer: Brady (2004) effect ~0.57 in lab, ~0.19 in applied studies; Czyż et al. (2024) transfer SMD 0.54 in adults — [Brady 2004 (PDF)](https://www.gwern.net/docs/spaced-repetition/2004-brady.pdf); [Czyż et al. 2024](https://frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1377122/full)
- Elaborative interrogation and self-explanation rated moderate utility; rereading low (Dunlosky et al. 2013) — [APS press release](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)
- Rowland (2014) found limited support for semantic-elaboration explanations of the testing effect — [Rowland 2014 (PDF)](https://courseware.epfl.ch/assets/courseware/v1/fdde2f0aa590bf3b1324077a6bf1540c/asset-v1%3AEPFL%2BDEMO%2B2020%2Btype%40asset%2Bblock/Rowland2014-meta-analysis.pdf)
- Logan (1988): automaticity develops only with consistent mapping; inconsistent practice environments impede automatisation — [Logan 1988 (PDF)](https://pcl.sitehost.iu.edu/rgoldsto/courses/cogscilearning/loganautomaticity.pdf)
- Rickard (1997) CMPL: performance shifts from an algorithm (computing the answer) to direct retrieval — [Rickard 1997 (PDF)](https://rickardlab.ucsd.edu/pdf/Rickard1997.pdf)

### Inferences
- Relational strategies (octave shapes, "5th fret = next string", landmarks at frets 3/5/7/12) function as the *algorithm* in CMPL terms: useful scaffolds early, which should be replaced by direct retrieval. The app could teach these as optional hints/explanations in the reveal (e.g. "F on A string = octave of F on low E, 2 frets up, 2 strings over"), then rely on speed thresholds to push toward direct retrieval.
- Encoding variability: once a note is learned in one zone, practising it in different zones / strings is a form of variable practice that should aid transfer (contextual-interference analogue). The expanding curriculum provides this; consider mixing previously learned zones into later runs rather than retiring them.
- Transfer-appropriate processing: the real-world use is producing a note on the instrument given a name (or reading notation), and the reverse (naming a note under the finger). Practising both directions (position -> name) is likely needed for full fluency; the app currently trains only name -> position.
- Cognitive load: a 12-position zone is manageable; adding many new items at once to a novice risks overload, so introduce a few new items per session (the scheduler's "new card" limit).

### Gaps
- No experimental study found on fretboard-specific mnemonics or pattern-based encoding vs rote drilling.
- No sourced evidence on directional asymmetry (name->position vs position->name) for this kind of mapping; the transfer-appropriate-processing claim is an inference.
- Chunking evidence (e.g. learning octave shapes as chunks) not retrieved this session.

## 8. The "85% rule" and optimal difficulty

### Takeaway
Wilson et al. (2019) show mathematically that for gradient-descent learners on binary classification tasks, ~85% training accuracy (15.87% error) maximises learning rate; the authors stress the principle (a sweet spot exists) over the exact number, and the result is for discrimination learning, not recall-based spaced repetition. The app's ~80% target (65–92%) is in a reasonable range but the justification should rely on retrieval-effort and spacing evidence as much as on the 85% rule.

### Cited Findings
- Wilson, Shenhav, Straccia & Cohen (2019, Nature Communications 10:4646): optimal training error ~15.87% (accuracy ~85%) for stochastic gradient-descent learning, shown for artificial and biologically plausible neural networks on simple tasks such as two-category classification — [PMC6831579](https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579); [IDEAS/RePEc](https://ideas.repec.org/a/nat/natcom/v10y2019i1d10.1038_s41467-019-12552-4.html)
- Wilson cautions the specific percentage matters less than the principle, and the work covers simple tasks with clear right/wrong answers, not school grades — [Psychology Today interview](https://www.psychologytoday.com/us/blog/brain-waves/201911/the-right-level-of-struggle-for-learning)
- Spacing that makes retrieval harder (but still successful) improves long-term retention (Pyc & Rawson 2009; Karpicke & Roediger 2007) — [Oregon State summary](https://blogs.oregonstate.edu/osuteaching/?p=2124); [Karpicke & Roediger 2007](https://profiles.wustl.edu/en/publications/expanding-retrieval-practice-promotes-short-term-retention-but-eq/)

### Inferences
- An ~80–90% session success target is defensible; letting it drift to 65% risks frustration and many failed retrievals (still learning-positive with immediate feedback, but motivationally costly). The 92% upper end may be too easy for learning efficiency within a session, though high success is acceptable for long-interval reviews.
- With spaced repetition, success rate is largely *determined by the scheduler's desired retention*; the difficulty-adaptation should probably act on the mix of new vs due items and on speed targets rather than by artificially advancing/delaying reviews.
- Count only first attempts (not post-reveal retries) toward the success rate, or the measured success rate will be inflated (see Section 4).

### Gaps
- No empirical human study found confirming 85% as optimal for human paired-associate recall; the rule is a theoretical result for classifier learning.

## 9. Pretesting, confidence judgements / metacognition, self-explanation

### Takeaway
Guessing before being taught (pretesting / errorful generation) helps when followed by immediate feedback. Learners' metacognitive judgements are biased toward easy, fluent, blocked practice; confidence ratings can be leveraged via hypercorrection. Self-explanation is of moderate utility and probably marginal for a pure mapping task.

### Cited Findings
- Unsuccessful retrieval attempts (essentially pretests on items not yet known) enhance later learning when followed by the answer — [Kornell, Hays & Bjork 2009, PubMed](https://pubmed.ncbi.nlm.nih.gov/19586265/)
- With immediate feedback this works; with delayed feedback mostly not — [Hays, Kornell & Bjork (PDF)](https://sites.lifesci.ucla.edu/psych-bjorklab/wp-content/uploads/sites/13/2016/07/Hays_Kornell_RBjork_inpress.pdf)
- Learners judged blocked study as more effective even though interleaving produced better performance (metacognitive illusion) — [Kang & Pashler / Kornell & Bjork summary](https://www.springermedizin.de/article/10.3758/s13421-012-0272-7)
- Hypercorrection: high-confidence errors are corrected more often after feedback — [PMC3079415](https://pmc.ncbi.nlm.nih.gov/articles/PMC3079415)
- Self-explanation and elaborative interrogation rated moderate utility (Dunlosky et al. 2013) — [APS press release](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)

### Inferences
- New items could be introduced by a "guess first" trial (play where you think Bb is in this zone) followed by immediate reveal, instead of showing the position first; for the fretboard this is cheap and evidence-aligned, especially when the learner can partly compute it from known landmarks.
- Optional confidence/JOL input is probably not worth the friction per trial; RT and error type serve as implicit confidence signals. A periodic "predict your score" prompt before review runs could calibrate users and show the value of spaced/interleaved practice.
- Present progress as next-day retention and speed trends to counter the illusion that easy, massed practice is working.

### Gaps
- Pretesting effects on perceptual-motor mappings were not found; the evidence is from verbal/trivia materials.
- No source found on whether explicit JOL prompts improve learning in drill apps (vs just measuring calibration).
