# Karya

A smarter way to do your day.

A productivity app covering task management, focused work sessions, quick idea
capture, streak tracking, shared lists, and a voice assistant.

> **The app is being rebuilt.** The version that runs today is the vanilla
> JavaScript build at the repository root. A React and TypeScript rebuild lives
> in `app/`, and a Postgres backend lives in `supabase/`. Both are in progress
> and neither is wired into the running app yet. See
> [Repository layout](#repository-layout) for what is where.

## Core Features

### 1. Application Interface and Navigation

**Splash Screen:** A professional entrance screen that centers the application
logo before transitioning to the sign-in area.

**Authentication Options:** Users can sign in using a Google account or
continue as a guest for a private, local experience.

**Dynamic Header:** The home screen features a fixed header that rotates
through active task names to keep current goals visible.

**Sidebar Menu:** A slide-in menu provides quick access to all specialized
areas of the application.

**Navigation History:** Integrated back buttons allow for seamless navigation
between task lists and sub-menus.

### 2. Task Management

**Flexible Task Creation:** A detailed modal allows users to set specific due
dates or time intervals for every task.

**Time Interval Support:** Tasks can be scheduled for a single day or defined
by a beginning and ending time and date.

**Multi-Step Breakdown:** Complex tasks can be divided into sub-steps. The
application tracks and displays the completion progress for these individual
steps.

**Overdue Management:** The system automatically identifies tasks that have
passed their deadline. Upon login, users are notified and prompted to update
their status.

**Interactive List:** Tasks can be toggled as complete, edited for more detail,
or permanently deleted.

### 3. Productivity and Motivation Tools

**Focus Mode:** Includes a dedicated Pomodoro timer set to 25-minute intervals.
Users can associate specific tasks with a focus session to improve deep work.

**Idea Inbox:** A quick-capture screen designed for fleeting thoughts. Ideas
saved here can be converted into full tasks with one click.

**Consistency Tracking:** The application monitors daily task completion to
maintain a streak counter, encouraging regular productivity.

**Streak History:** A dedicated log displays past completion records, showing
the date and number of tasks finished.

**Contextual Suggestions:** Integrated logic provides task recommendations
based on the time of day or user-defined routine tags.

### 4. Kayra, the Voice Assistant

**Spoken Input and Replies:** Kayra listens through the browser's speech
recognition and answers aloud through speech synthesis, so a question can be
asked without touching the keyboard.

**Aware of Your List:** Requests are answered with your open tasks in view,
including their priority and time estimates, alongside a running average of how
many tasks you finish per active day.

**Deliberately Brief:** Replies are held to roughly two sentences, because they
are spoken rather than read, and Kayra declines questions unrelated to
productivity.

**Bring Your Own Key:** Kayra calls Google's Gemini and needs an API key, which
is entered once in Settings and kept in your browser. Every other feature works
without one.

## Repository layout

```
karya-app/
├── index.html          Screen containers for the running app
├── script.js           Task, timer, streak, group, and assistant logic
├── style.css           Visual theme and responsive layout
├── images/             Logos and background assets
│
├── app/                React and TypeScript rebuild, in progress
├── supabase/           Database schema, policies, and local config
├── scripts/            Development scripts for the local database
└── openspec/           Behaviour specifications for the rebuild
```

Each of the four directories below the divider has its own README explaining
what it contains and the rules that apply inside it.

## Running the app

The app that works today needs no build step.

1. **Open the project.** Launch VS Code, choose File then Open Folder, and
   select the `karya-app` directory.
2. **Install Live Server.** Open the Extensions view with `Ctrl+Shift+X`,
   search for "Live Server" by Ritwick Dey, and install it.
3. **Launch.** Open `index.html`, right-click anywhere in the file, and choose
   "Open with Live Server".
4. **View.** Your browser opens `http://127.0.0.1:5500`. Serving over a real
   server rather than opening the file directly is what lets authentication and
   browser notifications work.

Changes saved to `index.html`, `style.css`, or `script.js` refresh the browser
automatically.

## Working on the rebuild

Neither of these affects the running app.

**The React app:**

```bash
cd app
npm install
npm run dev
```

The dev server runs on `http://localhost:5173`. See `app/README.md` for the
scripts, the environment variables, and the conventions that apply.

**The database:** requires Docker.

```bash
npx supabase start          # starts a local Postgres and API
npx supabase db reset       # replays every migration from empty
```

Copy the printed URL and keys into `app/.env`, then:

```bash
node scripts/seed-dev-db.mjs    # realistic development data
node scripts/verify-rls.mjs     # proves the access-control policies
```

Both scripts refuse to run against anything but a local database. See
`supabase/README.md` and `scripts/README.md` for details.
