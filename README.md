Core Features

1. Application Interface and Navigation

Splash Screen: A professional entrance screen that centers the application logo before transitioning to the sign-in area.

Authentication Options: Users can sign in using a Google account or continue as a guest for a private, local experience.

Dynamic Header: The home screen features a fixed header that rotates through active task names to keep current goals visible.

Sidebar Menu: A slide-in menu provides quick access to all specialized areas of the application.

Navigation History: Integrated back buttons allow for seamless navigation between task lists and sub-menus.

2. Task Management

Flexible Task Creation: A detailed modal allows users to set specific due dates or time intervals for every task.

Time Interval Support: Tasks can be scheduled for a single day or defined by a beginning and ending time and date.

Multi-Step Breakdown: Complex tasks can be divided into sub-steps. The application tracks and displays the completion progress for these individual steps.

Overdue Management: The system automatically identifies tasks that have passed their deadline. Upon login, users are notified and prompted to update their status.

Interactive List: Tasks can be toggled as complete, edited for more detail, or permanently deleted.

3. Productivity and Motivation Tools

Focus Mode: Includes a dedicated Pomodoro timer set to 25-minute intervals. Users can associate specific tasks with a focus session to improve deep work.

Idea Inbox: A quick-capture screen designed for fleeting thoughts. Ideas saved here can be converted into full tasks with one click.

Consistency Tracking: The application monitors daily task completion to maintain a streak counter, encouraging regular productivity.

Streak History: A dedicated log displays past completion records, showing the date and number of tasks finished.

Contextual Suggestions: Integrated logic provides task recommendations based on the time of day or user-defined routine tags.

Project Structure

The application is organized as follows:

/Karya-App
├── index.html          # Application structure and screen containers
├── script.js           # Logic for tasks, timers, and data management
├── style.css           # Visual theme and responsive layout definitions
└── images/             # Application assets and logo files


How to Use in VS Code

For the best development and testing experience on a laptop, follow these steps using Visual Studio Code:

Open the Project: Launch VS Code, go to the File menu, select Open Folder, and choose the Karya-App directory.

Install Live Server: Open the Extensions view in VS Code (Ctrl+Shift+X) and search for "Live Server" by Ritwick Dey. Install this extension to allow the application to run as if it were on a real web server.

Launch the App: Open the index.html file in the editor. Right-click anywhere inside the file and select "Open with Live Server".

View in Browser: Your default web browser will automatically open a new tab at http://127.0.0.1:5500. This allows features like Firebase Authentication and Browser Notifications to function correctly.

Develop and Test: Any changes you save in index.html, style.css, or script.js will cause the browser to refresh automatically, allowing for immediate testing of new formatting or features.