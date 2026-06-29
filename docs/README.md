# Ed-Assist — System Documents

This folder holds the design of the lesson-planning system: the four source
documents (as both readable text and the original PDFs) that define how it works.

## The four documents

| # | Document | Audience | Purpose |
|---|----------|----------|---------|
| 1 | [Orientation for Teachers](framework/1-orientation-for-teachers.md) | Teachers | A first-read overview of what the system is and what you get |
| 2 | [How to Use the System](framework/2-how-to-use-the-system.md) | Teachers | Step-by-step instructions for generating plans |
| 3 | [The Architecture](framework/3-the-architecture.md) | Leaders / partners | The design and reasoning behind the system |
| 4 | [The Lesson Plan Framework](framework/4-lesson-plan-framework.md) | Claude (the engine) | The instruction document Claude reads to generate plans |

> **Document 4 is the engine.** Refining it improves every plan the system
> produces — at no cost. This is where most improvement work happens.

## Original PDFs

The untouched originals are in [`source-pdfs/`](source-pdfs/), kept for reference.

## How the system works (in one breath)

A teacher uploads the **Framework** (document 4) + a **textbook chapter** to Claude,
answers **five questions** (chapter number, name, grade, subject, sessions), and
Claude generates session-by-session plans — three parts each (Before / During /
After class), three levels (Core / Enhanced / Full), built around an Indian story
character that grows across the chapter, plus an Evening Post for Google Classroom.
