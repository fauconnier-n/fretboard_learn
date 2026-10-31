# Make every fretboard retrieval effortful, spaced and timed

The fastest durable route to knowing the fretboard is the one the app is already built around: **short, daily sessions of effortful recall on the real instrument, spaced across days, with immediate correction after a miss**. **This version lists only the ideas not yet built.** Everything else from the original 19-item backlog is implemented and documented, with its reasoning, in [docs/learning-algorithm.md](../docs/learning-algorithm.md). Three ideas remain: a guess-first zone introduction, fading the zone highlight for mature zones, and relational, ear and singing tasks that make the knowledge usable in real playing. One caveat runs through everything below: **almost no controlled research studies fretboard note learning directly**. Most of the evidence comes from verbal paired-associate learning, Anki flashcards, laboratory motor tasks and a handful of small piano and clarinet studies, so the app's own DuckDB logs are the best place to confirm what transfers.

## Spaced, effortful retrieval across days beats more reps today

Two techniques stand far above the rest. A 10-technique review of learning strategies rated only **practice testing and distributed practice as "high utility"**. Interleaving was rated "moderate", and rereading and highlighting "low" ([APS](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)). Testing beats restudy by about **g = 0.50**, with larger benefits for recall tests than recognition tests and at delays of a day or more ([Rowland 2014](https://courseware.epfl.ch/assets/courseware/v1/fdde2f0aa590bf3b1324077a6bf1540c/asset-v1%3AEPFL%2BDEMO%2B2020%2Btype%40asset%2Bblock/Rowland2014-meta-analysis.pdf)). Playing a named note on a real guitar is a production (recall) test, which is the stronger format. The app's basic premise is sound.

Spacing has a shape worth knowing. In a study of more than 1,350 people, the best gap between study sessions was **about 20–40% of the retention interval for a one-week test, but only 5–10% for a one-year test** ([Cepeda et al. 2008](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf)). Gaps that are too short hurt more than gaps that are too long ([YFile](https://www.yorku.ca/yfile/?p=9454)). Whether the schedule expands or stays even matters less than making the *first* delayed retrieval genuinely hard. With vocabulary pairs, expanding schedules won at 10 minutes, but equal spacing won at 2 days, and the key factor was delaying the first retest ([Karpicke & Roediger 2007](https://profiles.wustl.edu/en/publications/expanding-retrieval-practice-promotes-short-term-retention-but-eq/)). Expanding schedules do help when there is a lot of interference between trials ([Storm, Bjork & Storm 2010](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/Storm_Bjork_Storm_2010.pdf)). The practical rule for the app: within a session, re-ask an item after a moderate gap, not immediately. Across sessions, let due dates drive review.

Effort is the active ingredient. **Difficult but successful retrievals improve memory more than easy ones**, and requiring more correct recalls within one session gives diminishing returns ([Pyc & Rawson 2009 summary](https://blogs.oregonstate.edu/osuteaching/?p=2124)). "Successive relearning" combines these findings. You practise each item until it is correct once per session, re-test misses *later in the same session*, and repeat across sessions. Recalling an item correctly once in each of three spaced sessions has been reported to more than double one-week recall compared with three correct recalls in one session, roughly 68% vs 26% (secondary figure) ([Dunlosky et al. guide](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf); [Rawson & Dunlosky 2022](https://journals.sagepub.com/doi/full/10.1177/09637214221100484)). Massed extra practice looks good on the day and then fades. In a maths study, six extra problems in one session had no effect on test scores 1 or 4 weeks later, while spreading the same practice across sessions had an "extremely large" benefit at 4 weeks ([Rohrer & Taylor 2006](https://digitalcommons.usf.edu/psy_facpub/1768)). For the app, this means a sprint today matters less than the same sprint spread over three days.

Failing is fine if the answer arrives promptly. When people tried to answer questions they were almost certain to get wrong, the attempt still produced better later recall than simply reading the answer ([Kornell, Hays & Bjork 2009](https://pubmed.ncbi.nlm.nih.gov/19586265/)). But the benefit depends on **immediate feedback; with delayed feedback it mostly disappeared** ([Hays, Kornell & Bjork](https://sites.lifesci.ucla.edu/psych-bjorklab/wp-content/uploads/sites/13/2016/07/Hays_Kornell_RBjork_inpress.pdf)). Errors made with high confidence are corrected especially well once feedback arrives (the hypercorrection effect) ([PMC3079415](https://pmc.ncbi.nlm.nih.gov/articles/PMC3079415)). The app's instant green/red grading is the right default. The real question is what happens after a red.

Session structure should follow the same logic. Postal workers learning to type were **most efficient with one 1-hour session per day and least efficient with two 2-hour sessions per day** ([Baddeley & Longman 1978](https://Www.Gwern.net/doc/psychology/spaced-repetition/1978-baddeley.pdf)). That figure is an upper bound for an intensive skill; a 12-item zone needs far less. Sleep-dependent "offline gains" in finger-sequence learning were once headline news ([Walker et al. 2002](https://walkerlab.berkeley.edu/reprints/Walker%20et%20al._Neuron_2002.pdf)). Later meta-analytic work argued they are largely an artefact of confounds and publication bias ([SUNY](https://researchconnect.suny.edu/en/publications/sleep-does-not-enhance-motor-sequence-learning/); [Frontiers in Neurology 2015](https://www.frontiersin.org/journals/neurology/articles/10.3389/fneur.2015.00241/pdf)). So don't build features around sleep. Do schedule the first review of new positions for the next day, which spacing supports anyway.

Speed deserves its own target. Instance theory holds that automaticity means retrieving stored past responses directly. It predicts that both mean answer time and its variability fall as power functions of practice, provided the stimulus-response mapping stays consistent ([Logan 1988](https://pcl.sitehost.iu.edu/rgoldsto/courses/cogscilearning/loganautomaticity.pdf)). A competing account frames the speed-up as a switch from an *algorithm* to direct retrieval ([Rickard 1997](https://rickardlab.ucsd.edu/pdf/Rickard1997.pdf)). On guitar, the algorithm is "count up from the open string" or "octave of the E-string note". A sudden drop in an item's answer time is the signature of that switch. Fluency-based teaching (precision teaching) treats speed plus accuracy as the goal, but even its main proponent asks for more controlled research ([Binder 1996](https://pmc.ncbi.nlm.nih.gov/articles/PMC2733609)). Timed sprints are a good automaticity and engagement tool, not a proven retention booster.

## One current feature could ask for more effort

### The zone preview (mild conflict: make it a guess-first introduction)

Showing the natural notes before the run is a study phase with a strong cue. For zones the learner already partly knows, a "guess first, then reveal" trial is better aligned with the pretesting evidence ([Kornell et al. 2009](https://pubmed.ncbi.nlm.nih.gov/19586265/)). The preview still makes sense for a brand-new zone, where the learner can't compute anything. Showing naturals first also matches teacher advice to anchor on naturals ([Serna, Dummies](https://dummies.com/article/academics-the-arts/music/instruments/guitar/getting-to-know-the-notes-on-a-guitar-fretboard-162886)). So show the preview only when a zone has unseen positions, and make it skippable. **Evidence: indirect (trivia and verbal). Impact: small-medium. Effort: small.**

## Fade the guidance, then widen the tasks

The always-visible zone highlight is a guidance aid. The guidance hypothesis says constant guidance breeds dependence, but its replication record is poor: one review concluded there is **little evidence that feedback after every trial creates dependence** ([Frontiers 2010](https://www.frontiersin.org/articles/10.3389/fpsyg.2010.00190/full)). So keep right/wrong feedback on every trial. Fading the *spatial* cue for mature zones is a plausible but untested next step: shrink the highlight, delay it, or eventually ask "find any G on strings 4–6". On-screen inlay dots are fine to keep, since they exist on the real guitar. **Evidence: weak. Impact: small-medium. Effort: medium.**

Real playing needs more than naming notes in both directions (both are now built). Next come relational tasks the pitch detector can already check: play the octave on another string, play a major 3rd above this C, play the R-3-5 of a triad inside the zone, play changes Solo-style ([Solo app](https://apps.apple.com/us/app/-/id1537057699)). Ear tasks should be *relative*, played against a reference tone. Adult absolute-pitch training works well for only a subset of people; most improve modestly ([Van Hedger et al. 2019](https://www.biorxiv.org/content/10.1101/325050v2.full)). A "sing it, then play it" mode uses the same pitch tracker. It is well motivated, because inner hearing was one of four predictors that together explained **59.6% of the variance in piano sight-reading** ([Kopiez & Lee](https://edisciplinas.usp.br/pluginfile.php/5556036/mod_resource/content/0/Artigo-KopiezLee-DynamicModelSightReading-2006.pdf)). But that is correlational piano evidence, not a training study. No study shows that isolated fretboard naming transfers to improvising or reading, so an occasional untrained "transfer probe" (a new zone, a short melody spelled in note names) would let the logs answer that for this learner. **Impact: high for real-world use, unproven for recall speed. Effort: large.**

## The ranked backlog

Effort: small = about a day or less; medium = a few days; large = a week or more. Evidence strength is relative to fretboard learning: "indirect" means the source task differs, for example verbal pairs, flashcards or lab motor tasks.

| # | Idea | Changes an existing feature? | Evidence | Impact | Effort |
|---|---|---|---|---|---|
| 14 | Guess-first introduction; preview only for unseen zones | Yes: zone preview | Indirect (trivia) | Small-med | Small |
| 18 | Fade zone highlight for mature zones (fading of note-name labels is built, see the algorithm doc) | Yes: highlight | Weak | Small-med | Medium |
| 19 | Relational, relative-ear and sing-then-play modes; transfer probes (relational part built: Intervals tab; ear and singing not planned) | New | Indirect (piano correlational) | High for real playing, unproven | Large |

## Ideas kept for later

Discussed on 2026-11-01 and kept, but not planned for now.

**Ear and reading** (the app stays a fretboard trainer, not an ear-training app):
- hear a tone, then name it or find it on the neck;
- hear a reference note, then play an interval above it;
- sing the note, then play it, with the pitch tracker checking both;
- read a note from a staff or from tab and play it;
- short 2–4 note sequences given as names;
- play the changes of a short progression;
- a drone or backing chord under a run, with prompts drawn from notes that fit the chord.

**Feedback that sounds like music:**
- each right answer plays its own note, so a run sounds like playing;
- right answers build a short tune across the run, finished by a clean run;
- light feedback when an answer beats your fast end ("fastest G yet");
- varied wording of feedback;
- a ghost of your previous times on the same zone, as markers to beat.

**To explain further before deciding:**
- **Odd one out:** three positions are marked, two carry the same note name (for example G on the low E string fret 3 and G on the D string fret 5) and one does not; you click the odd one. It trains octave and unison shapes without the guitar.
- **True or false:** a position is marked with a name, right or wrong half the time; you answer yes or no quickly. Very fast checking that suits the phone; weaker than recall, so it would be a warm-up, not the main task.
- **Blind board:** like a usual run, but the zone is not highlighted: only the note name is shown and any position of that pitch in a wider area counts. It removes the box as a cue once a zone is mastered.
- **Derive from a landmark:** "From fret 5 on the A string (D), go up a tone": the prompt names a landmark and a step, and you play the result. It practises the counting strategy explicitly, as a bridge for positions not known by heart yet.
- **G→B shift drill:** prompts that only cross from the G string to the B string (octave and unison shapes that shift by one fret there), so the one irregular string pair gets its own practice.

**Controlling the app from the guitar** (ideas, not built):
- a muted strum (a burst of noise with no clear pitch) starts the next run or moves on;
- two quick muted strums stop a run;
- a natural harmonic at the 12th fret of the low E (a very pure tone) confirms or skips;
- low open E held for a second opens the next run, high open e repeats the prompt;
- the volume knob: a swell from silence (onset without a pitch) as "ready".
The pitch detector already measures loudness and pitch clarity, so a strum (loud, low clarity) and a harmonic (very high clarity) can be told apart from a played note; each would need a short calibration on the user's guitar.

## Conclusion

With 16 of the 19 ideas in place, the app follows the strongest findings in learning science: effortful recall, prompt feedback, delayed re-tests, due-driven review and answer time feeding memory, checked against its own logged predictions. What remains is fading the guidance and widening the tasks towards real playing. The app is also in an unusual position. Almost all of this evidence is borrowed from word pairs, flashcards, putting greens and clarinets, and a single learner's timestamped, pitch-verified logs in DuckDB can test whether it transfers to the fretboard. That includes whether the G–B offset causes more errors, whether high e comes free after low E, and whether the queue affects next-day recall. Treat each recommendation as a hypothesis to check against next-day data, not as settled fact.
