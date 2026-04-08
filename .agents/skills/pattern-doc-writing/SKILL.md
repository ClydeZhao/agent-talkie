---
name: pattern-doc-writing
description: Write or rewrite product docs, idea files, PRDs, and concept notes in a high-signal pattern-document style. Use when the document should communicate the core idea clearly, stay abstract but concrete, avoid premature implementation detail, and read more like a strong conceptual memo than a spec dump.
---

# Pattern Doc Writing

## Overview

Write documents that explain the pattern before the implementation. Keep the reader oriented, keep abstraction levels stable, and make the idea feel obvious in retrospect.

Use this skill when a document currently feels too mechanical, too taxonomy-heavy, or too mixed between product definition and implementation detail.

## Workflow

### 1. Find the real pattern

Before rewriting, answer:

- What is the one core idea?
- What familiar baseline should the reader compare it against?
- What should stay flexible?
- What must be true regardless of implementation?

If the document cannot answer those questions cleanly, fix that first instead of polishing wording.

### 2. Choose the right abstraction level

Do not mix these levels in the same section unless there is a clear reason:

- product idea
- design principle
- user experience
- capability / requirement
- implementation detail

Move implementation detail out unless it is necessary to explain the product concept.

### 3. Use this section order by default

Use a simple top-down flow:

1. what this is
2. what problem it fixes
3. the core idea / pattern
4. the principles behind it
5. how it should feel in use
6. representative examples
7. scope and non-goals
8. note on what is intentionally left open

Do not create a long taxonomy unless the content truly demands it.

### 4. Write in a strong memo voice

- Prefer short declarative sentences.
- Prefer paragraphs over bullet floods.
- Use bullets only when the content is inherently list-shaped.
- Avoid filler transitions and corporate framing.
- Avoid pretending optional choices are fixed decisions.
- Avoid meta-announcements such as "let's dive in", "here's what this means", or one-line warm-up sentences under headings.
- Avoid inflated contrast and vague intensifiers when a plain sentence would be clearer.

The writing should feel confident, not inflated.

### 5. Stay abstract but concrete

Good pattern docs do both:

- abstract enough to avoid locking implementation too early
- concrete enough that the reader can picture usage immediately

Use representative examples to carry the concreteness. Do not use protocol fields or architecture diagrams unless they are essential to understanding the idea.

### 6. Contrast with the common alternative

When useful, explicitly name the default mental model and explain how this pattern differs.

Examples:

- "This is not a hosted runtime."
- "This is conversation-first, not task-first."
- "This is a collaboration layer, not an agent operating system."

This makes the idea legible faster.

### 7. Remove common AI-writing failure modes

Before finalizing, cut patterns that make the document sound generic or over-produced:

- empty signposting and tutorial-script phrasing
- "not just X, but Y" used for emphasis instead of precision
- stacked triads and other forced symmetry
- synonym cycling where one concrete noun keeps changing names
- false ranges like "from X to Y" when X and Y are not part of a real scale
- subjectless fragments such as "No config needed" when a full sentence is clearer
- vague claims about "transforming", "unlocking", or "reimagining" without a concrete effect

If a sentence is trying to sound important rather than say something exact, rewrite it.

### 8. End with controlled openness

Close by saying what the document is and is not trying to decide.

A good ending often clarifies:

- this document defines the pattern, not the implementation
- several implementations are possible
- optional details should stay modular until needed

## Editing Checklist

Before finishing:

- Does the document have one obvious core idea?
- Does each section stay at one abstraction level?
- Did implementation detail leak into product definition?
- Are examples doing real explanatory work?
- Could a smart reader explain the idea back after one pass?
- Did you remove filler transitions, empty emphasis, and obvious AI-writing patterns?
- Did you keep the prose direct without making it casual or chatty?
