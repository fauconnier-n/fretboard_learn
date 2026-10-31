# How Fretboard Trainer decides what to ask

This document describes the learning algorithm as it is implemented, and why each part is there. The research behind it is in `research_notes/`. [reports/Fretboard learning science ideas.md](../reports/Fretboard%20learning%20science%20ideas.md) now lists only the ideas **not yet** built.

One caveat applies throughout. Almost no research studies fretboard note learning directly. Most evidence comes from word-pair memory tests, flashcards (Anki), lab motor tasks, and small piano and clarinet studies. Every answer is therefore logged with the model's prediction made just before it, so the app's own data can check each choice (section 10).

Code: `js/srs.js` (model and selection), `js/quiz.js` (run flow), `js/stats.js` (display), `js/modelcheck.js` (model check), `js/storage.js` (logs; column docs in `TABLES`).

## 1. What is learnt: items

- **Play the note** (name → position): an item is a position plus a spelling. A natural note has one item, for example `1:3` (A string, fret 3 = C). A sharp/flat position has two linked items, `1:1:s` (A#) and `1:1:f` (Bb), because recognising "Bb" and "A#" are separate retrievals.
- **Name the note** (position → name): one item per position, `1:3:r`. Either spelling of an accidental is accepted.
  *Why:* reading tab and recognising notes under the fingers both need position → name, while playing a named note trains only the other direction. Competing apps (JustinGuitar Note Trainer) offer both. Transfer between directions is not guaranteed, so they are learnt separately. The "name" model starts from what is known about playing that position.
- **Twin link:** an unseen spelling borrows 85% of what is known about its twin. Only the asked item is updated by an answer, so evidence is never counted twice.
- When an accidental comes up, the spelling leans towards the weaker one (25–75%), judged on both memory and speed.

## 2. Memory: FSRS-6

Each item has a memory card: stability **S** (days until recall probability falls to 90%), difficulty **D** (1–10), and the time of the last answer.

- **Forgetting curve:** R = (1 + F·t/S)^−decay, with F chosen so R = 90% when t = S. The decay starts at the FSRS-6 default 0.1542 and **can be fitted to your own answers** (section 10).
  *Why:* on the open benchmark of about 10,000 Anki collections, FSRS-6 predicts recall clearly better than the FSRS v4 curve the app used before (log loss 0.3460 vs 0.3726).
- **Updates** use the FSRS-6 formulas and default parameters: start values by grade, difficulty change with mean reversion, stability growth after success, post-lapse stability after a miss.
- **Same-day answers** use FSRS-6's short-term rule: S' = S·e^(0.5425·(G−3+0.0912))·S^−0.0658, never below S after a Good or Easy answer.
  *Why:* the app asks the same note several times within minutes. Under the long-term formula, quick repeats could look like durable memory. In a test, six right answers in a row in one session left S unchanged.

## 3. Grades: right/wrong plus answer time

| Grade | When |
|---|---|
| 1 Again | wrong, time-out, or "Show me" |
| 2 Hard | right, but clearly slower than expected for this item |
| 3 Good | right, about as fast as expected |
| 4 Easy | right, clearly faster than expected |

The answer's log time is compared with the item's expected log time (section 4) as a z-score, using the item's own spread, or your overall spread while it has fewer than 3 times. Easy is z < −0.5, Good is up to z ≤ 1, Hard is above that. A first sighting is capped at Good.

*Why:* in 8 million fact-drill answers (Papoušek et al. 2015), a fast right answer was followed by a right one about 95% of the time, a slow one about 80%. Near 90% accuracy, time is the only signal left that still varies. Comparing with each item's own expected time removes hand travel and position effects that have nothing to do with memory.

## 4. Speed

- **Per item:** a running mean and variance of log answer time. The first answers are averaged; later ones count 25% each. Expected time grows as memory fades: ×(1 + 0.8·(1−R)).
- **Priors while an item has few answers:** pulled towards the same note name on other positions, then towards the **shared factors** (section 5).
- **Your own speed scale:** the speed score is 1 at your fast end and 0 at 10 s. Your fast end is a running estimate of the 10th percentile of your right answers. Stats → "Your fast end" shows it.
  *Why:* hand travel and pitch-detector latency add time unrelated to memory, so a fixed 0.6 s ceiling would rate everyone with a slower setup as never fluent.
- **Spread:** a large spread means a note is sometimes still being worked out (counting frets, finding the octave) rather than recalled. Erratic items get extra practice, and "Slowest positions" marks them.
  *Why:* instance theory (Logan 1988) predicts that both mean time and spread fall as recall becomes automatic.
- **Excluded from speed:** wrong answers, and answers given while the next-notes queue was visible (`attempts.queue_shown`), because seeing the next notes in advance lets you recall them early.

## 5. Shared factors: what positions have in common

The app keeps four small sets of effects, learnt Elo-style from every answer:
- string;
- fret region (0–4, 5–8, 9–11, with frets n and n+12 sharing one);
- natural or accidental;
- spelling.

Each effect adjusts both the chance of a right answer and the typical log time. The step size shrinks with experience, 1/(1+0.06n).

- They feed the prior for **never-played positions** (once 20+ answers exist) and the **speed prior** for items with few answers.
- *Why:* with one learner's data, per-position parameters overfit. Duolingo's per-word weights did, and removing them raised daily activity by 12% in a 3.3-million-student test. A few dense factors share evidence instead. Expect modest gains: Pelánek's similar models beat plain Elo by small margins.
- The **zone-shape context** (the same note can be weaker in some shapes) is damped: at most ±0.2 and only with plenty of similar past answers, so it never outweighs an item's own record.

## 6. Curriculum: where new material comes from

- **Order:** low E first, then A, then the others. **High e mirrors low E** (same notes, same frets): its starting estimate and reachability use what you know on low E.
- **Octave shapes:** a never-played position's prior includes the same note on other strings within 4 frets, the shapes guitarists use to jump between strings, which cross the B string with a one-fret shift.
- **Landmarks and naturals first:** inside a zone, new positions on landmark frets (open, 3, 5, 7, 9, 12…) come up more. On a string you have never played, accidentals come up less at first.
- *Why:* this is the consensus of guitar teachers (JustinGuitar, Desi Serna), not tested in studies: learn the naturals on strings 6 and 5 anchored to the dots, then reach other strings through octave shapes. A blocked start followed by quick mixing also fits motor-learning results: interleaving helps less for novices (Brady 2004).
- **Unlocking:** a zone is a candidate when at least half its positions are reachable: played, a starter position, next to a known one, or mirrored from a known string.

## 7. Choosing a zone: due reviews first

- An item is **due** when its recall probability has fallen below 85%.
- **With 8 or more due items, the run is a review:** only zones whose positions you have all played, and that contain due items, are candidates. They are picked mainly by how many due items they hold. No new material is offered until the backlog is down.
- **Otherwise:** the zone whose predicted success is closest to the target rate is favoured, with a bonus for due items it contains, some randomness, and no near-repeat of the previous zone's shape.
- *Why:* review should follow each item's recall probability, not a calendar (Tabibian et al.). The app used to make every 5th run a review. A queueing analysis of flashcard learning (Reddy et al. 2016) found that learning collapses abruptly when new items arrive faster than reviews can absorb them, hence the backlog gate.

### Target success rate

The target starts at 80% and **stays within 75–85%**: it moves down 2 points after a run at 90%+ (harder zones), up 3 points below 70%, and otherwise drifts back to 80%.

*Why:* the "85% rule" (Wilson et al. 2019) is a result for machine classifiers. Under noisy conditions like pitch-detector misreads it shifts to about 75–82%. In real fact-drill data, harder targets went with better learning and the easiest target was worst (Pelánek et al. 2017).

**Speed pressure** adapts separately (0.5–1.5): up after a run at 85%+ (more weight on slow items), down below 70%. Being accurate but slow should push speed work, not harder zones.

## 8. Inside a run

### Which position

Each position in the zone gets a weight from:
- how likely you are to miss it, and closeness to the target rate;
- how much it needs speed work (scaled by speed pressure);
- **how due it is** (memory below 85%);
- whether it was missed earlier in this run;
- **confusions:** if you have played note B when asked for note A (or the reverse), B gets a boost right after A is asked;
- landmark and natural bonuses for new positions (section 6).

Then a recency penalty, 1 − e^(−gap/3), where gap is the number of prompts since that position was asked. Never twice in a row, and at most about 25% of a run on one position.

*Why confusions:* interleaving helps most when it forces you to tell similar things apart (meta-analysis g = 0.42, Brunmair & Richter 2019). The app's own wrong-note log says which notes you mix up.

### Check-up prompts

Every 10th prompt is a **random** position of the zone, not chosen by the model (`attempts.probe`). The run summary and Stats show how many of these you got right.

*Why:* in an adaptive app, every success rate is pulled towards the target by design, so random prompts are the only honest measure of what you know. Pelánek's team used the same trick.

### After a miss

1. The answer is shown straight away, with the **kind of mistake**: right name but wrong octave, one or two frets too high or low (`attempts.error_type`).
2. **A structural hint** shows how to work the note out: the nearest landmark fret on the same string, and the same note through an octave shape two strings away, with the B-string shift when it applies. The hint stops once the position is mastered.
3. If "After a miss, play the note once" is on (default), you play (or name) it once, ungraded.
4. The note comes back 3–8 prompts later as a graded re-test.

*Why:* the benefit of a failed attempt depends on immediate feedback (Kornell, Hays & Bjork 2009). Successive relearning (Rawson & Dunlosky) re-tests a miss later in the session rather than right away. The hint is the "algorithm" (Rickard 1997) that direct recall later replaces, which is why it stops once the position is mastered. Saying how an answer was wrong, not just that it was wrong, borrows the motor-learning idea of feedback on the performance as well as the result. Applying it here is an inference.

### When the answer is shown

If you play nothing, after about 2.5× the expected time for that note (4–8 s), or the "longest wait" setting if shorter. **Show me** (or H) does the same at any time. Both count as a miss (`attempts.show_me`). No study gives an optimal wait; these numbers are a reasoned choice to check against the logs.

### The next-notes queue (off by default)

The next 4 prompts are picked in advance but shown only if Settings → Practice → "Show the next notes in advance" is on. Silent recall works almost as well as playing (meta-analysis d = 0.07), so a visible queue lets you recall notes early and makes the graded answer easy. Answers given with the queue on are left out of the speed model.

### Note names on the board (cues)

Settings → Practice → "Note names on the board during a run": **Fade** (default), None, All, Naturals only, or Landmark frets only. Name-the-note runs never show names (the other 11 labels would give the answer by elimination).

In **Fade** mode (`js/cues.js`) each position of the zone gets a name label by how well you know it, using the same recall chance the zone picker uses:
- below 0.55: the label shows;
- 0.55 to 0.7: only naturals and landmark frets (0, 3, 5, 7, 9, 12…) keep theirs;
- 0.7 or more: no label.

During the run, a label is **dropped after a right first answer** on that note and **comes back after a miss**. A re-test never shows its own label (the answer was just revealed), and **check-up prompts show no labels at all**, so their accuracy measures what you know without help.

How cued answers count (`cueOpts` in `srs.js`, also applied when the model is rebuilt from the log):
- the asked note's own label showing: at most **Hard**, and the time is **left out of the speed model**;
- other labels showing: at most **Good**;
- the model check ignores answers with their own label showing.

Every prompt logs the labels that were on the board and their distance to the asked position (`attempts.cue_*`). The distance counts one fret along a string as 1 and one string across as 2, so labels on the same string are closer: `sqrt(Δfret² + (2·Δstring)²)`. The raw positions are in `cue_labels`, so other measures can be computed from the log without playing again.

*Why:* fewer cues in practice gives better retention (Carpenter & DeLosh 2006), and the method of vanishing cues (Glisky, Schacter & Tulving 1986) removed cues step by step until the learner produced the item alone. Support that helps beginners hurts people who already know the material (expertise reversal; Kalyuga), so the fading follows the model's estimate for each note, not a fixed schedule, which is the adaptive fading that did better than fixed fading (Salden et al. 2010). Applying it to fretboard labels is an inference: no study tested it. The distance does not change what the model schedules; it is used in the **cue-reliance estimate** (section 10).

## 9. Mastery, fading and practice habits

- **Mastered** = right with a Good or Easy grade on at least two different days, and still strong (combined score ≥ 0.7). Mastered positions get a white ring on the Stats map.
- **Fading** = memory below 85% for a spelling you have played. These get an orange dashed ring, and the "Fading, due for review" card counts them.
  *Why:* learners assume memory stays as it is ("stability bias", Kornell & Bjork 2009), and one long session can paint everything green.
- **Before a run:** how many notes are fading, "Welcome back" after 2+ days away (no lost streak), and **your practice plan** if you wrote one in Settings → Practice.
  *Why:* "when X, I will practise Y" plans had d = 0.65 on goal attainment across 94 studies (Gollwitzer & Sheeran 2006). Missing a day did not materially affect habit formation (Lally et al. 2010), and seeing a broken streak lowers later engagement (Silverman & Barasch 2023). So the app counts days, not streaks.
- **After a run:** how many notes will be due tomorrow, and a nudge that short daily runs beat one long session.
  *Why:* spaced practice across days beats massed practice (Rohrer & Taylor 2006), and Duolingo found learners who binge quit more.
- **Stats → "Practised (last 7 days)"** counts days with at least one answer, today included. It is a weekly consistency measure that forgives missed days.
- **Not built, on purpose:** points, badges for volume, and leaderboards. Rewards for doing or completing tasks lower intrinsic motivation (d ≈ −0.4, Deci, Koestner & Ryan 1999), and a leaderboard-and-badges course lowered both motivation and exam scores (Hanus & Fox 2015).

## 10. Checking the model

Every answer logs what the model expected **just before** it: `pred_p` (chance of a right answer), `pred_ms` (expected time), `pred_r`, `pred_s`, `pred_d`.

**Settings → Data → Check the model** shows:
- **Log loss** of the predictions against a constant guess (lower is better), and **AUC** (0.5 = chance);
- **by time since the item was last asked:** first time, under 2 min, 2–10 min, 10 min–3 h, 3 h–1 day, over 1 day. Within-session answers are much easier to predict than next-day ones, so they are kept apart;
- **calibration:** predicted vs actual success in 10% bins;
- **decay fit:** the log is replayed under 7 decay values, scoring the memory model on answers given more than an hour after the previous one. This needs at least 30 such answers. If a value fits more than 1% better, a button applies it and rebuilds the model; another goes back to the default.

- **reliance on note names:** answers grouped by what the board showed (no names, another name within 2 steps, further away, the asked note's own name), with the right rate, the rate the memory model expected, and the median time of right answers. Once there are 40 answers with predictions (at least five right and five wrong), a logistic regression estimates how much the labels changed your odds of a right answer **beyond what the memory model expected**: `logit P(right) = b0 + logit(pred_p) + b1·[own name showing] + b2·proximity`, where `proximity = exp(−distance/3)` of the nearest other label (0.72 one step away, 0.26 four steps, 0 with none). It is shown as an odds multiplier with a 95% range (×1 = labels changed nothing). A small ridge penalty keeps the own-name term finite, since those answers are nearly always right. Each term needs at least 8 answers. On simulated data with known effects (own name +2.5, nearby name +1.5 on the proximity scale, 1500 answers) it recovered 3.0 ± 0.3 and 1.1 ± 0.3, inside about 1.5 standard errors; the estimate is noisy until you have a few hundred cued answers. It is a diagnostic only: it changes nothing in the schedule.

These follow the open spaced-repetition benchmark's method. Fit as few parameters as possible on a single learner's data; the decay and the two label terms are all that is fitted here.

Judge changes by **first-answer accuracy and time on the next day**, and by **check-up accuracy**, not by in-session performance.

Useful SQL in Settings → Database tables, or `ft.sql(...)` in the console:

```sql
-- does the time grade predict the next answer on the same item?
with a as (
  select string_idx, fret, spelling, fsrs_grade,
         lead(correct) over (partition by string_idx, fret, spelling, task order by t) as next_ok
  from attempts)
select fsrs_grade, avg(next_ok::int) as next_correct, count(*) as n
from a where next_ok is not null group by 1 order by 1;

-- which kinds of mistakes you make most
select error_type, count(*) from attempts where error_type is not null group by 1 order by 2 desc;

-- re-tests: how often a missed note is right when it comes back
select avg(correct::int) as retest_success, count(*) as n from attempts where retest;
```

## Intervals

The Intervals tab is a separate part of the app (`js/intervals.js`, `js/intervalsView.js`). It does not use FSRS or the note model: interval answers are logged with `task = 'interval'` and left out of the model rebuild and the model check.

### What is asked, easiest first

1. **Octave shapes, 2 strings away** (up and down): the root is marked and named; play the same note an octave higher two strings up (+2 frets, +3 where the shape crosses the G→B major third), or lower two strings down. These come first because octave shapes are the guitarist's main way to move a note between strings, and every later item leans on them.
2. **Octave, 3 strings away** (up and down): the other common shape (−3 frets, −2 across the B string).
3. **An interval above the marked root**, in this order: perfect 5th, perfect 4th, major 3rd, minor 3rd, major 6th, minor 6th, major 2nd, minor 7th, major 7th, minor 2nd, tritone. The 5th and 4th match shapes players already use (power chord, same fret on the next string). The thirds come next because they build triads, the sixths are inverted thirds, the seconds and sevenths sit one step from the root or its octave, and the tritone comes last as the one interval no common shape gives away.
4. **Triads near the root**: major, then minor. Play root, 3rd and 5th in that order; each right note is ticked off, and any wrong note is a miss.
5. **Scale degrees**: "the 5th of C" for degrees 5, 4, 3, 6, 2, 7 of the major scale (most used first), with no position marked: any octave anywhere counts.

The pitch detector hears the pitch, not the string, so grading checks the exact pitch (root ±12 for octaves, root + interval for the rest; pitch class for degrees). The prompt names the target string and the reveal shows the expected position. Roots are picked anywhere on the neck where the answer fits: the target string exists and the target fret is on the neck for octaves, and every note is within 4 frets of the root for intervals and triads. Playing the marked root itself is ignored (players often sound it first), as is the triad note just played ringing again.

### Unlocking and picking

Items open in groups: the two octave-shape directions together, then one item at a time. The next group opens once every open item has been **known** at least once: at least 5 answers and a recent accuracy of 80% or more. Recent accuracy weighs the newest answer 1, the one before 0.8, then 0.64 and so on (last 20 answers), so a few early misses stop counting once you have it. Once known, an item stays past the gate, so a bad day does not lock later items again. 80% matches the target success rate used in Practice.

Each prompt picks an open item at random, weighted towards new items (fewer than 5 answers, weight 4) and weak ones (weight 1 + 4 × (1 − accuracy)), never the same item twice in a row when there is a choice, and never the same root twice in a row. Per-item stats (answers, recent accuracy, median time of right answers) are rebuilt from the answer log when the tab opens and updated after each answer.

## Changing the model

The model is rebuilt from the answer log when its version changes (`MODEL_VERSION` in `js/srs.js`), so changes apply to all past answers. Settings → Data → "Rebuild model from log" does the same on demand. A rebuild keeps the target rate, the fitted decay and the run history, and replays confusions from the logged wrong notes.
