# Loom Research Notes

This plugin draws on learning-science frameworks that generalize across domains (languages, systems, math, music, etc.). The sources below informed the graph model, review scheduling, and unlock logic.

## Core Sources

- **Distributed practice / spacing effect**: Cepeda et al. (2006), *Psychological Science*. DOI: https://doi.org/10.1111/j.1467-9280.2006.01684.x
  - Supports repeated review at expanding intervals, which maps to Loom's `srs_stage` and `next_review` fields.
- **Testing effect / retrieval practice**: Roediger & Karpicke (2006), *Science*. DOI: https://doi.org/10.1126/science.1152408
  - Justifies Loom's emphasis on review outcomes and capturing a rating after practice.
- **Interleaving vs. blocking**: Kornell & Bjork (2008), *Psychological Science*. DOI: https://doi.org/10.1111/j.1467-9280.2008.02127.x
  - Informs the idea that the “next” node can alternate between topics or difficulties rather than staying in a single block.
- **Mastery learning**: Bloom (1968), *Learning for Mastery*. ERIC: https://files.eric.ed.gov/fulltext/ED053419.pdf
  - Drives Loom’s prerequisite graph and unlock logic (mastery gates access to later nodes).
- **Deliberate practice**: Ericsson, Krampe, & Tesch-Römer (1993), *Psychological Review*. DOI: https://doi.org/10.1037/0033-295X.100.3.363
  - Reinforces adding purposeful practice nodes and tracking progress explicitly.

## Supporting Ideas

- **Zone of Proximal Development (ZPD)**: Vygotsky (1978), *Mind in Society*.
  - Aligns with unlocking nodes once prerequisites are mastered, keeping challenges just ahead of current ability.
- **Desirable difficulties**: Bjork (1994), in *Memory and Metacognition*.
  - Suggests that a bit of challenge (spacing, retrieval, interleaving) yields stronger retention, motivating the review ratings.
- **Concept mapping**: Novak & Gowin (1984), *Learning How to Learn*.
  - Supports representing knowledge as graphs rather than linear lists.

## How This Maps to Loom

- **Graph structure**: nodes, prerequisites, unlocks → mastery learning and ZPD.
- **Progress signals**: `familiarity`, `status`, `srs_stage` → deliberate practice + mastery.
- **Scheduling**: `next_review`, session logs → spacing effect + testing effect.
- **Context captures**: use real-world situations to seed nodes and keep learning grounded.
